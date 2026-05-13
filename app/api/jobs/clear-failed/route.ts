import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';

// POST /api/jobs/clear-failed - Delete all failed and cancelled jobs
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const result = await prisma.job.deleteMany({
      where: {
        userId,
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
