import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/sync/status/[jobId] - Get job status and logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Parse JSON fields
    const response = {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      statusMessage: job.statusMessage,
      logs: job.logs ? JSON.parse(job.logs) : [],
      result: job.result ? JSON.parse(job.result) : null,
      error: job.error,
      config: job.config ? JSON.parse(job.config) : null,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    );
  }
}

// PATCH /api/sync/status/[jobId] - Update job status (for internal use)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await request.json();

    // Prepare update data
    const updateData: any = {};

    if (body.status !== undefined) {
      updateData.status = body.status;

      // Auto-set timestamps based on status
      if (body.status === 'RUNNING' && !body.startedAt) {
        updateData.startedAt = new Date();
      }
      if ((body.status === 'COMPLETED' || body.status === 'FAILED') && !body.completedAt) {
        updateData.completedAt = new Date();
      }
    }

    if (body.progress !== undefined) {
      updateData.progress = body.progress;
    }

    if (body.logs !== undefined) {
      updateData.logs = JSON.stringify(body.logs);
    }

    if (body.result !== undefined) {
      updateData.result = JSON.stringify(body.result);
    }

    if (body.error !== undefined) {
      updateData.error = body.error;
    }

    if (body.statusMessage !== undefined) {
      updateData.statusMessage = body.statusMessage;
    }

    // Update the job
    const job = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
    });

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      statusMessage: job.statusMessage,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error('Error updating job status:', error);
    return NextResponse.json(
      { error: 'Failed to update job status' },
      { status: 500 }
    );
  }
}

// DELETE /api/sync/status/[jobId] - Cancel/delete a job
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Update job status to CANCELLED if it's PENDING or RUNNING
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status === 'PENDING' || job.status === 'RUNNING') {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });
      return NextResponse.json({ message: 'Job cancelled successfully' });
    } else {
      // Delete completed/failed jobs
      await prisma.job.delete({
        where: { id: jobId },
      });
      return NextResponse.json({ message: 'Job deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}
