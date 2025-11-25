import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/jobs/stats - Get job statistics
export async function GET(request: NextRequest) {
  try {
    const [total, pending, running, completed, failed, cancelled] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { status: 'PENDING' } }),
      prisma.job.count({ where: { status: 'RUNNING' } }),
      prisma.job.count({ where: { status: 'COMPLETED' } }),
      prisma.job.count({ where: { status: 'FAILED' } }),
      prisma.job.count({ where: { status: 'CANCELLED' } }),
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
