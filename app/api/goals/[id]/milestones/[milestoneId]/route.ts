import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';

/**
 * PATCH /api/goals/[id]/milestones/[milestoneId]
 * Update a milestone
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const { id: goalId, milestoneId } = await params;

    // Verify goal belongs to user
    const goal = await prisma.goal.findUnique({
      where: { id: goalId, userId },
    });

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, status, targetDate, completedDate } = body;

    // Build update data
    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      updateData.status = status;
      // If marking as completed, set completed date
      if (status === 'COMPLETED' && !completedDate) {
        updateData.completedDate = new Date();
      }
    }
    if (targetDate !== undefined) updateData.targetDate = new Date(targetDate);
    if (completedDate !== undefined)
      updateData.completedDate = completedDate ? new Date(completedDate) : null;

    // Update milestone
    const milestone = await prisma.goalMilestone.update({
      where: { id: milestoneId },
      data: updateData,
    });

    return NextResponse.json(milestone);
  } catch (error) {
    console.error('Error updating milestone:', error);
    return NextResponse.json(
      { error: 'Failed to update milestone' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/goals/[id]/milestones/[milestoneId]
 * Delete a milestone
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const { id: goalId, milestoneId } = await params;

    // Verify goal belongs to user
    const goal = await prisma.goal.findUnique({
      where: { id: goalId, userId },
    });

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    await prisma.goalMilestone.delete({
      where: { id: milestoneId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    return NextResponse.json(
      { error: 'Failed to delete milestone' },
      { status: 500 }
    );
  }
}
