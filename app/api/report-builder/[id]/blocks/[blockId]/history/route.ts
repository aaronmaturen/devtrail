import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/report-builder/[id]/blocks/[blockId]/history
 * Get full revision history for a block
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

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

    const [revisions, total] = await Promise.all([
      prisma.reportBlockRevision.findMany({
        where: { blockId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.reportBlockRevision.count({ where: { blockId } }),
    ]);

    return NextResponse.json({
      revisions,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      currentContent: block.content,
    });
  } catch (error) {
    console.error('Error fetching block history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch block history' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/report-builder/[id]/blocks/[blockId]/history
 * Restore a block to a previous revision
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;
    const body = await request.json();
    const { revisionId, restoreToContent } = body;

    // Verify block exists
    const block = await prisma.reportBlock.findFirst({
      where: { id: blockId, documentId: id },
    });

    if (!block) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    let contentToRestore: string;

    if (revisionId) {
      // Restore from specific revision
      const revision = await prisma.reportBlockRevision.findUnique({
        where: { id: revisionId },
      });

      if (!revision || revision.blockId !== blockId) {
        return NextResponse.json(
          { error: 'Revision not found' },
          { status: 404 }
        );
      }

      contentToRestore = revision.previousContent;
    } else if (restoreToContent !== undefined) {
      contentToRestore = restoreToContent;
    } else {
      return NextResponse.json(
        { error: 'Either revisionId or restoreToContent is required' },
        { status: 400 }
      );
    }

    // Create restoration revision
    await prisma.reportBlockRevision.create({
      data: {
        blockId,
        previousContent: block.content,
        newContent: contentToRestore,
        changeType: 'REGENERATE', // Using REGENERATE for restore operations
        changedBy: 'USER',
      },
    });

    // Update block
    const updatedBlock = await prisma.reportBlock.update({
      where: { id: blockId },
      data: { content: contentToRestore },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    return NextResponse.json({
      ...updatedBlock,
      metadata: JSON.parse(updatedBlock.metadata || '{}'),
    });
  } catch (error) {
    console.error('Error restoring block:', error);
    return NextResponse.json(
      { error: 'Failed to restore block' },
      { status: 500 }
    );
  }
}
