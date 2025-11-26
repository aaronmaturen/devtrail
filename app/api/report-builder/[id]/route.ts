import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/report-builder/[id]
 * Get a single report document with all blocks
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const document = await prisma.reportDocument.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { position: 'asc' },
          include: {
            revisions: {
              orderBy: { createdAt: 'desc' },
              take: 1, // Just get latest revision for summary
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Report document not found' },
        { status: 404 }
      );
    }

    // Parse contextConfig
    const parsedDocument = {
      ...document,
      contextConfig: JSON.parse(document.contextConfig || '{}'),
      blocks: document.blocks.map((block) => ({
        ...block,
        metadata: JSON.parse(block.metadata || '{}'),
        revisionCount: block.revisions.length,
        lastRevision: block.revisions[0] || null,
      })),
    };

    return NextResponse.json(parsedDocument);
  } catch (error) {
    console.error('Error fetching report document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report document' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/report-builder/[id]
 * Update a report document
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, status, contextConfig } = body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (contextConfig !== undefined) {
      updateData.contextConfig = JSON.stringify(contextConfig);
    }

    const document = await prisma.reportDocument.update({
      where: { id },
      data: updateData,
      include: {
        blocks: {
          orderBy: { position: 'asc' },
        },
      },
    });

    return NextResponse.json({
      ...document,
      contextConfig: JSON.parse(document.contextConfig || '{}'),
    });
  } catch (error) {
    console.error('Error updating report document:', error);
    return NextResponse.json(
      { error: 'Failed to update report document' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/report-builder/[id]
 * Delete a report document and all its blocks
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.reportDocument.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting report document:', error);
    return NextResponse.json(
      { error: 'Failed to delete report document' },
      { status: 500 }
    );
  }
}
