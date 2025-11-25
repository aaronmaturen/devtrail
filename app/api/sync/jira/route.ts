import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for Jira sync request - only runtime params
const syncRequestSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

// POST /api/sync/jira - Create a new Jira sync job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = syncRequestSchema.parse(body);

    // Load saved configuration from database
    const configs = await prisma.config.findMany({
      where: {
        key: {
          in: [
            'jira_host',
            'jira_email',
            'jira_api_token',
            'selected_projects',
            'anthropic_api_key',
            'user_context',
          ],
        },
      },
    });

    // Parse JSON values from database
    const configMap = new Map(
      configs.map((c) => [c.key, JSON.parse(c.value)])
    );

    const jiraHost = configMap.get('jira_host');
    const jiraEmail = configMap.get('jira_email');
    const jiraApiToken = configMap.get('jira_api_token');
    const projects = configMap.get('selected_projects');
    const anthropicApiKey = configMap.get('anthropic_api_key');
    const userContext = configMap.get('user_context');

    // Validate required configuration exists
    if (!jiraHost || !jiraEmail || !jiraApiToken) {
      return NextResponse.json(
        { error: 'Jira credentials not configured. Please configure in Settings.' },
        { status: 400 }
      );
    }

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return NextResponse.json(
        { error: 'No Jira projects selected. Please configure in Settings.' },
        { status: 400 }
      );
    }

    // Prepare config for the job
    const jobConfig = {
      projects,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      jiraHost,
      jiraEmail,
      jiraApiToken,
      anthropicApiKey,
      userContext,
      dryRun: validatedData.dryRun,
    };

    // Create a new job record
    const job = await prisma.job.create({
      data: {
        type: 'JIRA_SYNC',
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

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        message: 'Jira sync job created successfully',
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

// GET /api/sync/jira - Get recent Jira sync jobs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const jobs = await prisma.job.findMany({
      where: {
        type: 'JIRA_SYNC',
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
