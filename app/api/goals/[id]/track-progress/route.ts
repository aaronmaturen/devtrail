import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { triggerJobProcessing } from '@/lib/workers/process-helper';
import { GoalProgressJobConfig } from '@/lib/workers/goals-progress';

/**
 * POST /api/goals/[id]/track-progress
 * Create a GOAL_PROGRESS job to track progress against a goal
 *
 * Body:
 * - evidenceIds?: string[] - Optional: specific evidence to match against
 * - autoMatchEvidence?: boolean - Default true: automatically find relevant evidence
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const goalId = (await params).id;
    const body = await request.json();

    // Validate goal exists
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
    });

    if (!goal) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      );
    }

    // Build job config
    const config: GoalProgressJobConfig = {
      goalId,
      evidenceIds: body.evidenceIds,
      autoMatchEvidence: body.autoMatchEvidence !== false, // Default to true
    };

    // Create job
    const job = await prisma.job.create({
      data: {
        type: 'GOAL_PROGRESS',
        status: 'PENDING',
        config: JSON.stringify(config),
      },
    });

    // Trigger processing (immediate in dev, queued in production)
    await triggerJobProcessing(job.id, 'GOAL_PROGRESS');

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      message: 'Goal progress tracking job created',
    });
  } catch (error) {
    console.error('Error creating goal progress job:', error);
    return NextResponse.json(
      {
        error: 'Failed to create goal progress job',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/goals/[id]/track-progress
 * Get the latest progress tracking job status for a goal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const goalId = (await params).id;

    // Find the most recent GOAL_PROGRESS job for this goal
    const jobs = await prisma.job.findMany({
      where: {
        type: 'GOAL_PROGRESS',
        config: {
          contains: goalId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5, // Last 5 jobs
    });

    const jobsWithStatus = jobs.map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      result: job.result ? JSON.parse(job.result) : null,
    }));

    return NextResponse.json({
      jobs: jobsWithStatus,
    });
  } catch (error) {
    console.error('Error fetching goal progress jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goal progress jobs' },
      { status: 500 }
    );
  }
}
