import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST /api/jobs/clear-failed - Delete all failed and cancelled jobs
export async function POST(request: NextRequest) {
  try {
    const result = await prisma.job.deleteMany({
      where: {
        status: {
          in: ['FAILED', 'CANCELLED'],
        },
      },
    });

    return NextResponse.json({
      message: 'Failed and cancelled jobs cleared successfully',
      deleted: result.count,
    });
  } catch (error) {
    console.error('Error clearing failed/cancelled jobs:', error);
    return NextResponse.json(
      { error: 'Failed to clear jobs' },
      { status: 500 }
    );
  }
}
