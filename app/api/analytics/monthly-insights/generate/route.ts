import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { triggerJobProcessing } from '@/lib/workers/process-helper';
import { z } from 'zod';

// Schema for generate request
const generateRequestSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/analytics/monthly-insights/generate
 * Triggers generation of a monthly insight for the specified month
 * Creates a background job for AI analysis
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = generateRequestSchema.parse(body);

    // Validate month is not in the future
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (validatedData.month > currentMonth) {
      return NextResponse.json(
        { error: 'Cannot generate insights for future months' },
        { status: 400 }
      );
    }

    // Check for existing pending/running job for this month
    const existingJob = await prisma.job.findFirst({
      where: {
        type: 'MONTHLY_INSIGHT_GENERATION',
        status: { in: ['PENDING', 'RUNNING'] },
        config: { contains: validatedData.month },
      },
    });

    if (existingJob) {
      return NextResponse.json({
        jobId: existingJob.id,
        status: existingJob.status,
        month: validatedData.month,
        message: 'Job already in progress for this month',
      });
    }

    // Create the job
    const job = await prisma.job.create({
      data: {
        type: 'MONTHLY_INSIGHT_GENERATION',
        status: 'PENDING',
        progress: 0,
        logs: JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Monthly insight generation job created for ${validatedData.month}`,
          },
        ]),
        config: JSON.stringify({
          month: validatedData.month,
          force: validatedData.force,
        }),
      },
    });

    // Trigger job processing
    await triggerJobProcessing(job.id, 'MONTHLY_INSIGHT_GENERATION');

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        month: validatedData.month,
        message: 'Monthly insight generation job created successfully',
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
    console.error('Error creating monthly insight job:', error);
    return NextResponse.json(
      { error: 'Failed to create monthly insight generation job' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/monthly-insights/generate
 * Returns recent monthly insight generation jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const month = searchParams.get('month');

    const where: any = {
      type: 'MONTHLY_INSIGHT_GENERATION',
    };

    if (month) {
      where.config = { contains: month };
    }

    const jobs = await prisma.job.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return NextResponse.json(
      jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        statusMessage: job.statusMessage,
        config: job.config ? JSON.parse(job.config) : null,
        result: job.result ? JSON.parse(job.result) : null,
        error: job.error,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
      }))
    );
  } catch (error) {
    console.error('Error fetching monthly insight jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly insight jobs' },
      { status: 500 }
    );
  }
}
