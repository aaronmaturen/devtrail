import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/evidence/[id]
 * Get single evidence entry by ID
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const evidence = await prisma.evidenceEntry.findUnique({
      where: { id },
      include: {
        criteria: {
          include: {
            criterion: true,
          },
        },
        attachments: true,
      },
    });

    if (!evidence) {
      return NextResponse.json(
        { error: 'Evidence not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(evidence);
  } catch (error) {
    console.error('Error fetching evidence:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evidence' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/evidence/[id]
 * Update evidence entry
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      description,
      content,
      prNumber,
      prUrl,
      repository,
      mergedAt,
      slackLink,
      additions,
      deletions,
      changedFiles,
      components,
      criteriaIds,
    } = body;

    // Check if evidence exists
    const existing = await prisma.evidenceEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Evidence not found' },
        { status: 404 }
      );
    }

    // Update evidence entry
    const evidence = await prisma.evidenceEntry.update({
      where: { id },
      data: {
        title,
        description,
        content,
        prNumber,
        prUrl,
        repository,
        mergedAt: mergedAt ? new Date(mergedAt) : null,
        slackLink,
        additions,
        deletions,
        changedFiles,
        components: components ? JSON.stringify(components) : null,
      },
    });

    // Update criteria relationships if provided
    if (criteriaIds && Array.isArray(criteriaIds)) {
      // Delete existing criteria relationships
      await prisma.evidenceCriterion.deleteMany({
        where: { evidenceId: id },
      });

      // Create new relationships
      await Promise.all(
        criteriaIds.map((item: { criterionId: number; confidence: number; explanation?: string }) =>
          prisma.evidenceCriterion.create({
            data: {
              evidenceId: id,
              criterionId: item.criterionId,
              confidence: item.confidence,
              explanation: item.explanation,
            },
          })
        )
      );
    }

    // Fetch updated evidence with relationships
    const updatedEvidence = await prisma.evidenceEntry.findUnique({
      where: { id },
      include: {
        criteria: {
          include: {
            criterion: true,
          },
        },
        attachments: true,
      },
    });

    return NextResponse.json(updatedEvidence);
  } catch (error) {
    console.error('Error updating evidence:', error);
    return NextResponse.json(
      { error: 'Failed to update evidence' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/evidence/[id]
 * Delete evidence entry
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    // Check if evidence exists
    const existing = await prisma.evidenceEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Evidence not found' },
        { status: 404 }
      );
    }

    // Delete evidence (cascade will delete criteria relationships and attachments)
    await prisma.evidenceEntry.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting evidence:', error);
    return NextResponse.json(
      { error: 'Failed to delete evidence' },
      { status: 500 }
    );
  }
}
