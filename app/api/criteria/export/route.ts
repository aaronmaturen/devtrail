import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/criteria/export - Export all criteria as JSON
export async function GET() {
  try {
    const criteria = await prisma.criterion.findMany({
      orderBy: {
        id: 'asc',
      },
    });

    // Create a formatted export with metadata
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      totalCriteria: criteria.length,
      criteria: criteria.map((c) => ({
        id: c.id,
        areaOfConcentration: c.areaOfConcentration,
        subarea: c.subarea,
        description: c.description,
        prDetectable: c.prDetectable,
      })),
    };

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="devtrail-criteria-${new Date().toISOString().split('T')[0]}.json"`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error exporting criteria:', error);
    return NextResponse.json(
      { error: 'Failed to export criteria' },
      { status: 500 }
    );
  }
}
