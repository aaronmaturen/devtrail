import { NextResponse } from 'next/server';
import { getRepositories, getDateRange } from '@/lib/services/component-analytics';
import { withAuth, isAuthError } from '@/lib/api/auth';

/**
 * GET /api/analytics/repositories
 * Get list of available repositories with PR counts and date range
 */
export async function GET() {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const [repositories, dateRange] = await Promise.all([
      getRepositories(userId),
      getDateRange(userId),
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
