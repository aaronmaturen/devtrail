import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { withAuth, isAuthError } from '@/lib/api/auth';

// Schema for agent sync request
const agentSyncRequestSchema = z.object({
  agentType: z.enum(['github', 'jira']).describe('Type of sync agent to run'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  username: z.string().optional(),
  repositories: z.array(z.string()).optional(),
  projects: z.array(z.string()).optional(),
  dryRun: z.boolean().optional().default(false),
  updateExisting: z.boolean().optional().default(false),
});

/**
 * POST /api/sync/agent - Create an agent-based sync job
 *
 * This endpoint uses AI agents with tools for intelligent syncing,
 * rather than hardcoded sync logic.
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const body = await request.json();
    const validatedData = agentSyncRequestSchema.parse(body);

    // Determine job type based on agent type
    const jobType =
      validatedData.agentType === 'github'
        ? 'AGENT_GITHUB_SYNC'
        : 'AGENT_JIRA_SYNC';

    // Create the job record with userId for user-scoped data
    const job = await prisma.job.create({
      data: {
        type: jobType,
        status: 'PENDING',
        progress: 0,
        logs: JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Agent-based ${validatedData.agentType} sync job created`,
          },
        ]),
        config: JSON.stringify({ ...validatedData, userId }),
        userId,
      },
    });

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        type: job.type,
        message: `Agent-based ${validatedData.agentType} sync job created successfully`,
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
    console.error('Error creating agent sync job:', error);
    return NextResponse.json(
      { error: 'Failed to create agent sync job' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync/agent - Get recent agent sync jobs
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const agentType = searchParams.get('agentType'); // 'github' or 'jira'

    const whereClause: any = {
      userId,
      type: {
        in: ['AGENT_GITHUB_SYNC', 'AGENT_JIRA_SYNC'],
      },
    };

    // Filter by agent type if specified
    if (agentType === 'github') {
      whereClause.type = 'AGENT_GITHUB_SYNC';
    } else if (agentType === 'jira') {
      whereClause.type = 'AGENT_JIRA_SYNC';
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
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
    console.error('Error fetching agent sync jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent sync jobs' },
      { status: 500 }
    );
  }
}
