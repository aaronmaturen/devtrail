import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET - Check job status
 *
 * Response:
 * {
 *   id: string,
 *   type: string,
 *   status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
 *   result: object | null,  // Parsed JSON result if completed
 *   error: string | null,   // Error message if failed
 *   createdAt: string,
 *   completedAt: string | null,
 *   blockId: string | null,
 *   documentId: string
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = await prisma.analysisJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Parse result if present
    let result = null;
    if (job.result) {
      try {
        result = JSON.parse(job.result);
      } catch (e) {
        console.error(`[API] Failed to parse job result for ${jobId}:`, e);
        // Return raw result if JSON parsing fails
        result = { raw: job.result };
      }
    }

    return NextResponse.json({
      id: job.id,
      type: job.type,
      status: job.status,
      result,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() || null,
      blockId: job.blockId,
      documentId: job.documentId,
    });

  } catch (error) {
    console.error('[API] Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Cancel a pending/processing job
 *
 * Note: This is a soft cancel - it marks the job as FAILED with a cancellation message.
 * If the job is already processing, it may complete anyway.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = await prisma.analysisJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Only allow canceling pending or processing jobs
    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      return NextResponse.json(
        { error: `Cannot cancel job with status: ${job.status}` },
        { status: 400 }
      );
    }

    // Mark as failed with cancellation message
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: 'Job cancelled by user',
        completedAt: new Date(),
      },
    });

    console.log(`[API] Cancelled job ${jobId}`);

    return NextResponse.json({
      success: true,
      message: 'Job cancelled',
    });

  } catch (error) {
    console.error('[API] Error cancelling job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel job', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
