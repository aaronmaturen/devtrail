import { NextRequest, NextResponse } from 'next/server';
import { processPendingJobs, processJobById } from '@/lib/workers/job-processor';

/**
 * GET /api/workers/process-jobs
 *
 * Trigger processing of all pending jobs in the queue.
 * This endpoint can be called:
 * - Manually via API request
 * - By a cron job for scheduled processing
 * - By a webhook for event-driven processing
 *
 * Query parameters:
 * - jobId (optional): Process a specific job by ID instead of all pending jobs
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    // Process specific job if jobId provided
    if (jobId) {
      console.log(`Processing specific job: ${jobId}`);

      try {
        await processJobById(jobId);

        return NextResponse.json({
          success: true,
          message: `Job ${jobId} processed successfully`,
          jobId,
        });
      } catch (error) {
        console.error(`Error processing job ${jobId}:`, error);

        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to process job',
            jobId,
          },
          { status: 500 }
        );
      }
    }

    // Process all pending jobs
    console.log('Starting job processor for all pending jobs');
    const result = await processPendingJobs();

    return NextResponse.json({
      success: true,
      message: `Processed ${result.processed} jobs successfully, ${result.failed} failed`,
      ...result,
    });
  } catch (error) {
    console.error('Error in job processor:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process jobs',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workers/process-jobs
 *
 * Same as GET but allows for future expansion with request body options.
 * Can be used for manual triggering with additional configuration.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { jobId, options } = body;

    // Process specific job if jobId provided
    if (jobId) {
      console.log(`Processing specific job: ${jobId}`);

      try {
        await processJobById(jobId);

        return NextResponse.json({
          success: true,
          message: `Job ${jobId} processed successfully`,
          jobId,
        });
      } catch (error) {
        console.error(`Error processing job ${jobId}:`, error);

        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to process job',
            jobId,
          },
          { status: 500 }
        );
      }
    }

    // Process all pending jobs
    console.log('Starting job processor for all pending jobs', options);
    const result = await processPendingJobs();

    return NextResponse.json({
      success: true,
      message: `Processed ${result.processed} jobs successfully, ${result.failed} failed`,
      ...result,
    });
  } catch (error) {
    console.error('Error in job processor:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process jobs',
      },
      { status: 500 }
    );
  }
}
