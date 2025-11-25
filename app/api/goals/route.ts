import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/goals
 * List goals with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (priority) {
      where.priority = priority;
    }

    // Fetch goals with related data
    const [goals, total] = await Promise.all([
      prisma.goal.findMany({
        where,
        include: {
          _count: {
            select: {
              milestones: true,
              progressEntries: true,
            },
          },
        },
        orderBy: [
          { status: 'asc' }, // Active first
          { priority: 'desc' }, // High priority first
          { targetDate: 'asc' }, // Soonest deadline first
        ],
        take: limit,
        skip: offset,
      }),
      prisma.goal.count({ where }),
    ]);

    return NextResponse.json({
      goals,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/goals
 * Create new goal
 */
export async function POST(request: NextRequest) {
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
      generatedFrom,
      milestones,
    } = body;

    // Validate required fields
    if (!title || !description || !category || !targetDate) {
      return NextResponse.json(
        { error: 'Title, description, category, and target date are required' },
        { status: 400 }
      );
    }

    // Create goal with optional milestones
    const goal = await prisma.goal.create({
      data: {
        title,
        description,
        category,
        status: status || 'ACTIVE',
        priority: priority || 'MEDIUM',
        specific: specific || '',
        measurable: measurable || '',
        achievable: achievable || '',
        relevant: relevant || '',
        timeBound: timeBound || '',
        targetDate: new Date(targetDate),
        startDate: startDate ? new Date(startDate) : new Date(),
        progressPercent: progressPercent || 0,
        generatedFrom: generatedFrom ? JSON.stringify(generatedFrom) : null,
        milestones: milestones
          ? {
              create: milestones.map((m: any) => ({
                title: m.title,
                description: m.description,
                targetDate: new Date(m.targetDate),
                status: m.status || 'PENDING',
              })),
            }
          : undefined,
      },
      include: {
        _count: {
          select: {
            milestones: true,
            progressEntries: true,
          },
        },
        milestones: true,
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error('Error creating goal:', error);
    return NextResponse.json(
      { error: 'Failed to create goal' },
      { status: 500 }
    );
  }
}
