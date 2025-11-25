import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for GitHub sync request - only runtime params
const syncRequestSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

// POST /api/sync/github - Create a new GitHub sync job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = syncRequestSchema.parse(body);

    // Load saved configuration from database
    const configs = await prisma.config.findMany({
      where: {
        key: {
          in: ['github_token', 'selected_repos', 'anthropic_api_key', 'user_context'],
        },
      },
    });

    // Parse JSON values from database
    const configMap = new Map(
      configs.map((c) => [c.key, JSON.parse(c.value)])
    );

    const githubToken = configMap.get('github_token');
    const repositories = configMap.get('selected_repos');
    const anthropicApiKey = configMap.get('anthropic_api_key');
    const userContext = configMap.get('user_context');

    // Validate required configuration exists
    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured. Please configure in Settings.' },
        { status: 400 }
      );
    }

    if (!repositories || !Array.isArray(repositories) || repositories.length === 0) {
      return NextResponse.json(
        { error: 'No repositories selected. Please configure in Settings.' },
        { status: 400 }
      );
    }

    // Prepare config for the job
    const jobConfig = {
      repositories,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      githubToken,
      anthropicApiKey,
      userContext,
      dryRun: validatedData.dryRun,
    };

    // Create a new job record
    const job = await prisma.job.create({
      data: {
        type: 'GITHUB_SYNC',
        status: 'PENDING',
        progress: 0,
        logs: JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Job created - waiting to start',
          },
        ]),
        config: JSON.stringify(jobConfig),
      },
    });

    // In the future, this is where we would trigger the actual sync
    // For now, we just return the job ID so the UI can poll for status

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        message: 'GitHub sync job created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating sync job:', error);
    return NextResponse.json(
      { error: 'Failed to create sync job' },
      { status: 500 }
    );
  }
}

// GET /api/sync/github - Get recent GitHub sync jobs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const jobs = await prisma.job.findMany({
      where: {
        type: 'GITHUB_SYNC',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return NextResponse.json(
      jobs.map((job) => ({
        ...job,
        config: job.config ? JSON.parse(job.config) : null,
        logs: job.logs ? JSON.parse(job.logs) : [],
        result: job.result ? JSON.parse(job.result) : null,
      }))
    );
  } catch (error) {
    console.error('Error fetching sync jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync jobs' },
      { status: 500 }
    );
  }
}
