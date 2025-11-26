import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { processJob } from './processor';

const prisma = new PrismaClient();

/**
 * POST - Create a new analysis job
 *
 * Request body:
 * {
 *   blockId?: string,      // For GENERATE/REFINE jobs
 *   documentId: string,    // Required
 *   type: 'GENERATE' | 'REFINE' | 'ANALYZE',
 *   prompt?: string        // Optional override prompt
 * }
 *
 * Response:
 * {
 *   jobId: string,
 *   status: 'PENDING'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blockId, documentId, type, prompt } = body;

    // Validate required fields
    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    if (!type || !['GENERATE', 'REFINE', 'ANALYZE'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be one of: GENERATE, REFINE, ANALYZE' },
        { status: 400 }
      );
    }

    // For GENERATE and REFINE, blockId is required
    if ((type === 'GENERATE' || type === 'REFINE') && !blockId) {
      return NextResponse.json(
        { error: `blockId is required for ${type} jobs` },
        { status: 400 }
      );
    }

    // Verify document exists
    const document = await prisma.reportDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Verify block exists if provided
    if (blockId) {
      const block = await prisma.reportBlock.findUnique({
        where: { id: blockId },
      });

      if (!block) {
        return NextResponse.json(
          { error: 'Block not found' },
          { status: 404 }
        );
      }

      if (block.documentId !== documentId) {
        return NextResponse.json(
          { error: 'Block does not belong to the specified document' },
          { status: 400 }
        );
      }
    }

    // Create job record
    const job = await prisma.analysisJob.create({
      data: {
        blockId,
        documentId,
        type,
        prompt,
        status: 'PENDING',
      },
    });

    console.log(`[API] Created job ${job.id} (type: ${type}, documentId: ${documentId})`);

    // Trigger background processing (don't await - let it run async)
    // In a production app, this would be pushed to a queue (BullMQ, SQS, etc.)
    processJob(job.id).catch((error) => {
      console.error(`[API] Job ${job.id} processing error:`, error);
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'PENDING',
    });

  } catch (error) {
    console.error('[API] Error creating job:', error);
    return NextResponse.json(
      { error: 'Failed to create job', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET - List all jobs (with optional filters)
 *
 * Query params:
 * - documentId: filter by document
 * - status: filter by status
 * - limit: max number of results (default 50)
 *
 * Response:
 * {
 *   jobs: [{ id, type, status, createdAt, completedAt, ... }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: any = {};
    if (documentId) where.documentId = documentId;
    if (status) where.status = status;

    const jobs = await prisma.analysisJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ jobs });

  } catch (error) {
    console.error('[API] Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
