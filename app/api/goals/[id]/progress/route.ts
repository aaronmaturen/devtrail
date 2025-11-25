import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/goals/[id]/progress
 * Get progress entries for a goal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const progressEntries = await prisma.goalProgress.findMany({
      where: { goalId: (await params).id },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(progressEntries);
  } catch (error) {
    console.error('Error fetching progress entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress entries' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/goals/[id]/progress
 * Create a new progress entry
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { progressPercent, notes, evidence, aiSummary } = body;

    // Validate progress percent
    if (progressPercent === undefined || progressPercent < 0 || progressPercent > 100) {
      return NextResponse.json(
        { error: 'Progress percent must be between 0 and 100' },
        { status: 400 }
      );
    }

    // Create progress entry
    const progressEntry = await prisma.goalProgress.create({
      data: {
        goalId: (await params).id,
        progressPercent,
        notes: notes || null,
        evidence: evidence ? JSON.stringify(evidence) : null,
        aiSummary: aiSummary || null,
      },
    });

    // Update goal's overall progress percent
    await prisma.goal.update({
      where: { id: (await params).id },
      data: { progressPercent },
    });

    // If progress is 100%, mark goal as completed
    if (progressPercent === 100) {
      await prisma.goal.update({
        where: { id: (await params).id },
        data: {
          status: 'COMPLETED',
          completedDate: new Date(),
        },
      });
    }

    return NextResponse.json(progressEntry);
  } catch (error) {
    console.error('Error creating progress entry:', error);
    return NextResponse.json(
      { error: 'Failed to create progress entry' },
      { status: 500 }
    );
  }
}
