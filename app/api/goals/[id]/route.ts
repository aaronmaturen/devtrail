import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/goals/[id]
 * Get a single goal by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const goal = await prisma.goal.findUnique({
      where: { id: (await params).id },
      include: {
        milestones: {
          orderBy: {
            targetDate: 'asc',
          },
        },
        progressEntries: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error('Error fetching goal:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goal' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/goals/[id]
 * Update a goal
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      category,
      status,
      priority,
      specific,
      measurable,
      achievable,
      relevant,
      timeBound,
      targetDate,
      startDate,
      progressPercent,
      completedDate,
    } = body;

    // Build update data
    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (specific !== undefined) updateData.specific = specific;
    if (measurable !== undefined) updateData.measurable = measurable;
    if (achievable !== undefined) updateData.achievable = achievable;
    if (relevant !== undefined) updateData.relevant = relevant;
    if (timeBound !== undefined) updateData.timeBound = timeBound;
    if (targetDate !== undefined) updateData.targetDate = new Date(targetDate);
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (progressPercent !== undefined) updateData.progressPercent = progressPercent;
    if (completedDate !== undefined)
      updateData.completedDate = completedDate ? new Date(completedDate) : null;

    // Update goal
    const goal = await prisma.goal.update({
      where: { id: (await params).id },
      data: updateData,
      include: {
        milestones: {
          orderBy: {
            targetDate: 'asc',
          },
        },
        progressEntries: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return NextResponse.json(goal);
  } catch (error) {
    console.error('Error updating goal:', error);
    return NextResponse.json(
      { error: 'Failed to update goal' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/goals/[id]
 * Delete a goal
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await prisma.goal.delete({
      where: { id: (await params).id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal:', error);
    return NextResponse.json(
      { error: 'Failed to delete goal' },
      { status: 500 }
    );
  }
}
