import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';

const criterionSchema = z.object({
  id: z.number(),
  areaOfConcentration: z.string(),
  subarea: z.string(),
  description: z.string(),
  prDetectable: z.boolean(),
});

const importSchema = z.object({
  exportedAt: z.string().optional(),
  version: z.string().optional(),
  totalCriteria: z.number().optional(),
  criteria: z.array(criterionSchema),
});

/**
 * POST /api/criteria/import
 * Import criteria from a JSON backup file
 */
export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate the import data
    console.log('[Criteria Import] Validating import data...');
    const validatedData = importSchema.parse(body);

    const { criteria } = validatedData;
    console.log(`[Criteria Import] Found ${criteria.length} criteria to import`);

    if (!criteria || criteria.length === 0) {
      return NextResponse.json(
        { error: 'No criteria found in import file' },
        { status: 400 }
      );
    }

    // Use a transaction to ensure all-or-nothing import
    console.log('[Criteria Import] Starting database transaction...');
    const result = await prisma.$transaction(async (tx) => {
      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const criterion of criteria) {
        try {
          // Check if criterion already exists
          const existing = await tx.criterion.findUnique({
            where: { id: criterion.id },
          });

          if (existing) {
            // Update existing criterion
            await tx.criterion.update({
              where: { id: criterion.id },
              data: {
                areaOfConcentration: criterion.areaOfConcentration,
                subarea: criterion.subarea,
                description: criterion.description,
                prDetectable: criterion.prDetectable,
              },
            });
            updated++;
            console.log(`[Criteria Import] Updated criterion ${criterion.id}`);
          } else {
            // Create new criterion
            await tx.criterion.create({
              data: {
                id: criterion.id,
                areaOfConcentration: criterion.areaOfConcentration,
                subarea: criterion.subarea,
                description: criterion.description,
                prDetectable: criterion.prDetectable,
              },
            });
            imported++;
            console.log(`[Criteria Import] Created criterion ${criterion.id}`);
          }
        } catch (criterionError) {
          console.error(`[Criteria Import] Error processing criterion ${criterion.id}:`, criterionError);
          throw criterionError; // Re-throw to rollback transaction
        }
      }

      console.log(`[Criteria Import] Transaction complete: ${imported} imported, ${updated} updated`);
      return { imported, updated, skipped };
    });

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${result.imported} new criteria and updated ${result.updated} existing criteria`,
      stats: result,
    });
  } catch (error) {
    console.error('Error importing criteria:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid import file format', details: error.issues },
        { status: 400 }
      );
    }

    // Return detailed error message for debugging
    return NextResponse.json(
      {
        error: 'Failed to import criteria',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
