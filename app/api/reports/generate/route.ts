import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { triggerJobProcessing } from '@/lib/workers/process-helper';

/**
 * POST /api/reports/generate
 * Create a Job to generate a report
 *
 * In local development, jobs are processed immediately for instant feedback.
 * In production, jobs are queued for cron processing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      reportType,
      startDate,
      endDate,
      repositories,
      criteriaIds,
      options,
    } = body;

    // Validate required fields
    if (!reportType) {
      return NextResponse.json(
        { error: 'Report type is required' },
        { status: 400 }
      );
    }

    // Build job configuration
    const config = {
      reportType,
      startDate,
      endDate,
      repositories: repositories || [],
      criteriaIds: criteriaIds || [],
      options: options || {},
    };

    // Create a Job for report generation
    const job = await prisma.job.create({
      data: {
        type: 'REPORT_GENERATION',
        status: 'PENDING',
        progress: 0,
        config: JSON.stringify(config),
        logs: JSON.stringify([{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Report generation job created for type: ${reportType}`,
        }]),
      },
    });

    // Trigger job processing (immediate in dev, queued in production)
    await triggerJobProcessing(job.id, job.type);

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      message: 'Report generation job created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating report generation job:', error);
    return NextResponse.json(
      { error: 'Failed to create report generation job' },
      { status: 500 }
    );
  }
}
