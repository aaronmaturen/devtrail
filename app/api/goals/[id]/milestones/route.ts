import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/goals/[id]/milestones
 * Get milestones for a goal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const milestones = await prisma.goalMilestone.findMany({
      where: { goalId: (await params).id },
      orderBy: {
        targetDate: 'asc',
      },
    });

    return NextResponse.json(milestones);
  } catch (error) {
    console.error('Error fetching milestones:', error);
    return NextResponse.json(
      { error: 'Failed to fetch milestones' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/goals/[id]/milestones
 * Create a new milestone
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { title, description, targetDate, status } = body;

    // Validate required fields
    if (!title || !targetDate) {
      return NextResponse.json(
        { error: 'Title and target date are required' },
        { status: 400 }
      );
    }

    // Create milestone
    const milestone = await prisma.goalMilestone.create({
      data: {
        goalId: (await params).id,
        title,
        description: description || null,
        targetDate: new Date(targetDate),
        status: status || 'PENDING',
      },
    });

    return NextResponse.json(milestone);
  } catch (error) {
    console.error('Error creating milestone:', error);
    return NextResponse.json(
      { error: 'Failed to create milestone' },
      { status: 500 }
    );
  }
}
