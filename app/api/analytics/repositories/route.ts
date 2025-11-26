import { NextResponse } from 'next/server';
import { getRepositories, getDateRange } from '@/lib/services/component-analytics';

/**
 * GET /api/analytics/repositories
 * Get list of available repositories with PR counts and date range
 */
export async function GET() {
  try {
    const [repositories, dateRange] = await Promise.all([
      getRepositories(),
      getDateRange(),
    ]);

    return NextResponse.json({
      repositories,
      dateRange,
    });
  } catch (error) {
    console.error('Error getting repositories:', error);
    return NextResponse.json(
      { error: 'Failed to get repositories' },
      { status: 500 }
    );
  }
}
