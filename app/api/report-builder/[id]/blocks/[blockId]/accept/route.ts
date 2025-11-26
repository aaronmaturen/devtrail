import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/report-builder/[id]/blocks/[blockId]/accept
 * Accept revised content and save it to the block
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;
    const body = await request.json();
    const { revisedContent, originalContent, refinementPrompt } = body;

    if (!revisedContent) {
      return NextResponse.json(
        { error: 'Revised content is required' },
        { status: 400 }
      );
    }

    // Fetch block
    const block = await prisma.reportBlock.findFirst({
      where: { id: blockId, documentId: id },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    // Create revision record
    await prisma.reportBlockRevision.create({
      data: {
        blockId,
        previousContent: originalContent || block.content,
        newContent: revisedContent,
        changeType: 'AGENT_REFINEMENT',
        changedBy: 'AGENT',
        agentPrompt: refinementPrompt,
      },
    });

    // Update block
    const updatedBlock = await prisma.reportBlock.update({
      where: { id: blockId },
      data: {
        content: revisedContent,
        metadata: JSON.stringify({
          ...JSON.parse(block.metadata || '{}'),
          lastRefinedAt: new Date().toISOString(),
          lastRefinementPrompt: refinementPrompt,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      block: {
        ...updatedBlock,
        metadata: JSON.parse(updatedBlock.metadata || '{}'),
      },
    });
  } catch (error) {
    console.error('Error accepting revision:', error);
    return NextResponse.json(
      { error: 'Failed to accept revision' },
      { status: 500 }
    );
  }
}
