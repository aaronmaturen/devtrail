import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for config validation
// Value can be: string (API keys, model IDs), array of strings (repos, projects), or empty string
const configSchema = z.object({
  key: z.string().min(1),
  value: z.union([
    z.string(),
    z.array(z.string()),
  ]),
  encrypted: z.boolean().optional().default(false),
  description: z.string().optional(),
});

const configArraySchema = z.array(configSchema);

// Helper to safely parse config values
function parseConfigValue(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    // If not valid JSON, return as-is (for simple strings like heartbeat timestamps)
    return value;
  }
}

// GET /api/config - Get all configs or specific config by key
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // Get specific config
      const config = await prisma.config.findUnique({
        where: { key },
      });

      if (!config) {
        return NextResponse.json(
          { error: 'Config not found' },
          { status: 404 }
        );
      }

      // Parse JSON value safely
      return NextResponse.json({
        ...config,
        value: parseConfigValue(config.value),
      });
    }

    // Get all configs
    const configs = await prisma.config.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(
      configs.map((config) => ({
        ...config,
        value: parseConfigValue(config.value),
      }))
    );
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

// POST /api/config - Create or update config(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle both single config and array of configs
    const configs = Array.isArray(body) ? body : [body];
    const validatedConfigs = configArraySchema.parse(configs);

    const results = await Promise.all(
      validatedConfigs.map(async (config) => {
        return await prisma.config.upsert({
          where: { key: config.key },
          update: {
            value: JSON.stringify(config.value),
            encrypted: config.encrypted,
            description: config.description,
          },
          create: {
            key: config.key,
            value: JSON.stringify(config.value),
            encrypted: config.encrypted,
            description: config.description,
          },
        });
      })
    );

    // Return single object if single config was provided
    const response = Array.isArray(body)
      ? results
      : results[0];

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid config data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 }
    );
  }
}

// DELETE /api/config?key=<key> - Delete specific config
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Config key required' },
        { status: 400 }
      );
    }

    await prisma.config.delete({
      where: { key },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting config:', error);
    return NextResponse.json(
      { error: 'Failed to delete config' },
      { status: 500 }
    );
  }
}
