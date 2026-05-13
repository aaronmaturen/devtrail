import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';

// GET /api/jobs/stats - Get job statistics
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const [total, pending, running, completed, failed, cancelled] = await Promise.all([
      prisma.job.count({ where: { userId } }),
      prisma.job.count({ where: { userId, status: 'PENDING' } }),
      prisma.job.count({ where: { userId, status: 'RUNNING' } }),
      prisma.job.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.job.count({ where: { userId, status: 'FAILED' } }),
      prisma.job.count({ where: { userId, status: 'CANCELLED' } }),
    ]);

    return NextResponse.json({
      total,
      pending,
      running,
      completed,
      failed,
      cancelled,
    });
  } catch (error) {
    console.error('Error fetching job stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job statistics' },
      { status: 500 }
    );
  }
}
