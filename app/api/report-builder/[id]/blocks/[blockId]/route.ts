import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/report-builder/[id]/blocks/[blockId]
 * Get a single block with full history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;

    const block = await prisma.reportBlock.findFirst({
      where: {
        id: blockId,
        documentId: id,
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!block) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...block,
      metadata: JSON.parse(block.metadata || '{}'),
    });
  } catch (error) {
    console.error('Error fetching block:', error);
    return NextResponse.json(
      { error: 'Failed to fetch block' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/report-builder/[id]/blocks/[blockId]
 * Update a block's content (creates revision history)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;
    const body = await request.json();
    const { prompt, content, metadata, type, trackRevision = true } = body;

    // Fetch current block
    const currentBlock = await prisma.reportBlock.findFirst({
      where: {
        id: blockId,
        documentId: id,
      },
    });

    if (!currentBlock) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    // Track revision if content changed (not prompt changes)
    if (trackRevision && content !== undefined && content !== currentBlock.content) {
      await prisma.reportBlockRevision.create({
        data: {
          blockId,
          previousContent: currentBlock.content,
          newContent: content,
          changeType: 'MANUAL_EDIT',
          changedBy: 'USER',
        },
      });
    }

    // Build update data
    const updateData: any = {};
    if (prompt !== undefined) updateData.prompt = prompt;
    if (content !== undefined) updateData.content = content;
    if (type !== undefined) updateData.type = type;
    if (metadata !== undefined) {
      updateData.metadata = JSON.stringify(metadata);
    }

    const block = await prisma.reportBlock.update({
      where: { id: blockId },
      data: updateData,
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    return NextResponse.json({
      ...block,
      metadata: JSON.parse(block.metadata || '{}'),
    });
  } catch (error) {
    console.error('Error updating block:', error);
    return NextResponse.json(
      { error: 'Failed to update block' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/report-builder/[id]/blocks/[blockId]
 * Delete a block and its revisions
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;

    // Verify block exists and belongs to document
    const block = await prisma.reportBlock.findFirst({
      where: {
        id: blockId,
        documentId: id,
      },
    });

    if (!block) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    // Delete block (revisions cascade)
    await prisma.reportBlock.delete({
      where: { id: blockId },
    });

    // Reorder remaining blocks
    const remainingBlocks = await prisma.reportBlock.findMany({
      where: { documentId: id },
      orderBy: { position: 'asc' },
    });

    await prisma.$transaction(
      remainingBlocks.map((b, index) =>
        prisma.reportBlock.update({
          where: { id: b.id },
          data: { position: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting block:', error);
    return NextResponse.json(
      { error: 'Failed to delete block' },
      { status: 500 }
    );
  }
}
