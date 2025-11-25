import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const criterionSchema = z.object({
  id: z.number(),
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

    // Build where clause
    const where: any = {};

    if (prDetectable !== null) {
      where.prDetectable = prDetectable === 'true';
    }

    if (area) {
      where.areaOfConcentration = area;
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

    return NextResponse.json({
      criteria,
      grouped,
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

    const criterion = await prisma.criterion.create({
      data: {
        id: validated.id,
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
