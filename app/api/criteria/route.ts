import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const CRITERION_TYPES = [
  'junior_engineer',
  'engineer',
  'mid_engineer',
  'senior_engineer',
  'staff_engineer',
  'senior_staff_engineer',
  'principal_engineer',
] as const;

const criterionSchema = z.object({
  id: z.number().optional(),
  type: z.enum(CRITERION_TYPES).default('staff_engineer'),
  areaOfConcentration: z.string().min(1),
  subarea: z.string().min(1),
  description: z.string().min(1),
  prDetectable: z.boolean(),
});

/**
 * GET /api/criteria
 * Get all criteria for selection in forms
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const prDetectable = searchParams.get('prDetectable');
    const area = searchParams.get('area');
    const type = searchParams.get('type');

    // Build where clause
    const where: any = {};

    if (prDetectable !== null) {
      where.prDetectable = prDetectable === 'true';
    }

    if (area) {
      where.areaOfConcentration = area;
    }

    if (type) {
      where.type = type;
    }

    const criteria = await prisma.criterion.findMany({
      where,
      orderBy: [
        { areaOfConcentration: 'asc' },
        { subarea: 'asc' },
      ],
      include: {
        _count: {
          select: { evidenceCriteria: true },
        },
      },
    });

    // Group by area of concentration for easier use in UI
    const grouped = criteria.reduce((acc, criterion) => {
      if (!acc[criterion.areaOfConcentration]) {
        acc[criterion.areaOfConcentration] = [];
      }
      acc[criterion.areaOfConcentration].push(criterion);
      return acc;
    }, {} as Record<string, typeof criteria>);

    // Get available types
    const types = CRITERION_TYPES;

    return NextResponse.json({
      criteria,
      grouped,
      types,
      total: criteria.length,
    });
  } catch (error) {
    console.error('Error fetching criteria:', error);
    return NextResponse.json(
      { error: 'Failed to fetch criteria' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/criteria
 * Create new criterion
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = criterionSchema.parse(body);

    // Auto-generate ID if not provided
    let id = validated.id;
    if (!id) {
      const maxId = await prisma.criterion.aggregate({ _max: { id: true } });
      id = (maxId._max.id || 0) + 1;
    }

    const criterion = await prisma.criterion.create({
      data: {
        id,
        type: validated.type,
        areaOfConcentration: validated.areaOfConcentration,
        subarea: validated.subarea,
        description: validated.description,
        prDetectable: validated.prDetectable,
      },
    });

    return NextResponse.json(criterion, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid criterion data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating criterion:', error);
    return NextResponse.json(
      { error: 'Failed to create criterion' },
      { status: 500 }
    );
  }
}
