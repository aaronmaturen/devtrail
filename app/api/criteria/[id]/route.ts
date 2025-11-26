import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const criterionUpdateSchema = z.object({
  areaOfConcentration: z.string().min(1).optional(),
  subarea: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  prDetectable: z.boolean().optional(),
});

// GET /api/criteria/[id] - Get single criterion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = parseInt((await params).id);

    const criterion = await prisma.criterion.findUnique({
      where: { id },
      include: {
        evidenceCriteria: {
          include: {
            evidence: {
              select: {
                id: true,
                summary: true,
                type: true,
                occurredAt: true,
              },
            },
          },
        },
      },
    });

    if (!criterion) {
      return NextResponse.json(
        { error: 'Criterion not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(criterion);
  } catch (error) {
    console.error('Error fetching criterion:', error);
    return NextResponse.json(
      { error: 'Failed to fetch criterion' },
      { status: 500 }
    );
  }
}

// PATCH /api/criteria/[id] - Update criterion
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = parseInt((await params).id);
    const body = await request.json();
    const validated = criterionUpdateSchema.parse(body);

    const criterion = await prisma.criterion.update({
      where: { id },
      data: validated,
    });

    return NextResponse.json(criterion);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid criterion data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating criterion:', error);
    return NextResponse.json(
      { error: 'Failed to update criterion' },
      { status: 500 }
    );
  }
}

// DELETE /api/criteria/[id] - Delete criterion
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = parseInt((await params).id);

    // Check if criterion has associated evidence
    const count = await prisma.evidenceCriterion.count({
      where: { criterionId: id },
    });

    if (count > 0) {
      return NextResponse.json(
        { error: `Cannot delete criterion with ${count} associated evidence entries` },
        { status: 400 }
      );
    }

    await prisma.criterion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting criterion:', error);
    return NextResponse.json(
      { error: 'Failed to delete criterion' },
      { status: 500 }
    );
  }
}
