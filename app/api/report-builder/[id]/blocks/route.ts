import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/report-builder/[id]/blocks
 * Get all blocks for a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify document exists
    const document = await prisma.reportDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Report document not found' },
        { status: 404 }
      );
    }

    const blocks = await prisma.reportBlock.findMany({
      where: { documentId: id },
      orderBy: { position: 'asc' },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 revisions
        },
      },
    });

    // Parse metadata for each block
    const parsedBlocks = blocks.map((block) => ({
      ...block,
      metadata: JSON.parse(block.metadata || '{}'),
    }));

    return NextResponse.json({ blocks: parsedBlocks });
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blocks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/report-builder/[id]/blocks
 * Create a new block
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { type, prompt, content, position, metadata } = body;

    // Validate type
    const validTypes = ['PROMPT_RESPONSE', 'TEXT', 'HEADING', 'DIVIDER'];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify document exists
    const document = await prisma.reportDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Report document not found' },
        { status: 404 }
      );
    }

    // If no position specified, add to end
    let blockPosition = position;
    if (blockPosition === undefined) {
      const lastBlock = await prisma.reportBlock.findFirst({
        where: { documentId: id },
        orderBy: { position: 'desc' },
      });
      blockPosition = (lastBlock?.position ?? -1) + 1;
    }

    // If position specified, shift existing blocks
    if (position !== undefined) {
      await prisma.reportBlock.updateMany({
        where: {
          documentId: id,
          position: { gte: position },
        },
        data: {
          position: { increment: 1 },
        },
      });
    }

    const block = await prisma.reportBlock.create({
      data: {
        documentId: id,
        type,
        prompt: prompt || '',
        content: content || '',
        position: blockPosition,
        metadata: metadata ? JSON.stringify(metadata) : '{}',
      },
      include: {
        revisions: true,
      },
    });

    return NextResponse.json(
      {
        ...block,
        metadata: JSON.parse(block.metadata || '{}'),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating block:', error);
    return NextResponse.json(
      { error: 'Failed to create block' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/report-builder/[id]/blocks
 * Reorder blocks (bulk update positions)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { blockPositions } = body; // Array of { blockId, position }

    if (!Array.isArray(blockPositions)) {
      return NextResponse.json(
        { error: 'blockPositions must be an array' },
        { status: 400 }
      );
    }

    // Update all positions in a transaction
    await prisma.$transaction(
      blockPositions.map(({ blockId, position }: { blockId: string; position: number }) =>
        prisma.reportBlock.update({
          where: { id: blockId },
          data: { position },
        })
      )
    );

    // Return updated blocks
    const blocks = await prisma.reportBlock.findMany({
      where: { documentId: id },
      orderBy: { position: 'asc' },
    });

    return NextResponse.json({ blocks });
  } catch (error) {
    console.error('Error reordering blocks:', error);
    return NextResponse.json(
      { error: 'Failed to reorder blocks' },
      { status: 500 }
    );
  }
}
