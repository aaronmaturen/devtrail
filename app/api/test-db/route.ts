import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    // Test database connection
    const count = await prisma.criterion.count();

    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      databaseUrl: process.env.DATABASE_URL,
      criteriaCount: count,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      databaseUrl: process.env.DATABASE_URL,
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
