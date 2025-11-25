import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/reviews/[id]
 * Get a single review analysis by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const analysis = await prisma.reviewAnalysis.findUnique({
      where: { id },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: 'Review analysis not found' },
        { status: 404 }
      );
    }

    // Parse JSON fields
    return NextResponse.json({
      ...analysis,
      themes: JSON.parse(analysis.themes),
      strengths: JSON.parse(analysis.strengths),
      growthAreas: JSON.parse(analysis.growthAreas),
      achievements: JSON.parse(analysis.achievements),
    });
  } catch (error) {
    console.error('Error fetching review analysis:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch review analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reviews/[id]
 * Delete a review analysis
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.reviewAnalysis.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting review analysis:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete review analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/reviews/[id]
 * Update a review analysis
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      title,
      year,
      reviewType,
      source,
      summary,
      themes,
      strengths,
      growthAreas,
      achievements,
    } = body;

    // Build update data
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (year !== undefined) updateData.year = year;
    if (reviewType !== undefined) updateData.reviewType = reviewType;
    if (source !== undefined) updateData.source = source;
    if (summary !== undefined) updateData.aiSummary = summary;
    if (themes !== undefined) updateData.themes = JSON.stringify(themes);
    if (strengths !== undefined) updateData.strengths = JSON.stringify(strengths);
    if (growthAreas !== undefined) updateData.growthAreas = JSON.stringify(growthAreas);
    if (achievements !== undefined) updateData.achievements = JSON.stringify(achievements);

    const updated = await prisma.reviewAnalysis.update({
      where: { id },
      data: updateData,
    });

    // Parse JSON fields for response
    return NextResponse.json({
      ...updated,
      themes: JSON.parse(updated.themes),
      strengths: JSON.parse(updated.strengths),
      growthAreas: JSON.parse(updated.growthAreas),
      achievements: JSON.parse(updated.achievements),
    });
  } catch (error) {
    console.error('Error updating review analysis:', error);
    return NextResponse.json(
      {
        error: 'Failed to update review analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
