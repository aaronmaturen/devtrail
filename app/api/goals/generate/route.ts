import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { triggerJobProcessing } from '@/lib/workers/process-helper';
import { z } from 'zod';
import { getAnthropicConfig, getUserContext } from '@/lib/config';

// Schema for goal generation request
const generateRequestSchema = z.object({
  goalCount: z.number().min(1).max(10).optional().default(3),
  timeframe: z.enum(['6-months', '1-year']).optional().default('1-year'),
  focusAreas: z.array(z.string()).optional(),
  includeJiraTickets: z.boolean().optional().default(false),
});

/**
 * POST /api/goals/generate - Create a new goal generation job
 *
 * Generate SMART goals based on evidence analysis, identifying strengths and gaps
 *
 * Request body:
 * - goalCount: Number of goals to generate (1-10, default: 3)
 * - timeframe: '6-months' or '1-year' (default: '1-year')
 * - focusAreas: Array of focus areas like ['DEVELOPMENT', 'LEADERSHIP', 'TECHNICAL']
 * - includeJiraTickets: Whether to include future Jira tickets in analysis
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = generateRequestSchema.parse(body);

    // Load configuration using centralized getters
    const { apiKey: anthropicApiKey, modelId: claudeModel } = await getAnthropicConfig();
    const userContext = await getUserContext();

    // Prepare config for the job
    const jobConfig = {
      goalCount: validatedData.goalCount,
      timeframe: validatedData.timeframe,
      focusAreas: validatedData.focusAreas,
      includeJiraTickets: validatedData.includeJiraTickets,
      anthropicApiKey,
      claudeModel,
      userContext,
    };

    // Create a new job record
    const job = await prisma.job.create({
      data: {
        type: 'GOAL_GENERATION',
        status: 'PENDING',
        progress: 0,
        logs: JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Goal generation job created - waiting to start',
          },
        ]),
        config: JSON.stringify(jobConfig),
      },
    });

    // Trigger immediate processing in development
    await triggerJobProcessing(job.id, 'GOAL_GENERATION');

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        message: 'Goal generation job created successfully',
        config: {
          goalCount: validatedData.goalCount,
          timeframe: validatedData.timeframe,
          focusAreas: validatedData.focusAreas,
        },
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
    console.error('Error creating goal generation job:', error);
    return NextResponse.json(
      { error: 'Failed to create goal generation job' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/goals/generate - Get recent goal generation jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const jobs = await prisma.job.findMany({
      where: {
        type: 'GOAL_GENERATION',
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
    console.error('Error fetching goal generation jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goal generation jobs' },
      { status: 500 }
    );
  }
}
