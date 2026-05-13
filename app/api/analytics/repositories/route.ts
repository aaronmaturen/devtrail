import { NextRequest, NextResponse } from 'next/server';
import { getRepositories, getDateRange } from '@/lib/services/component-analytics';
import { withAuth, isAuthError } from '@/lib/api/auth';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/analytics/repositories
 * Get list of available repositories with PR counts and date range
 * Supports viewAsUserId for managers to view direct reports' data
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const searchParams = request.nextUrl.searchParams;

    // Check for viewAsUserId - allows managers to view direct reports' data
    const viewAsUserId = searchParams.get('viewAsUserId');
    let effectiveUserId = userId;

    if (viewAsUserId && viewAsUserId !== userId) {
      // Validate that current user is the manager of viewAsUserId
      const targetUser = await prisma.user.findUnique({
        where: { id: viewAsUserId },
        select: { managerId: true },
      });

      if (!targetUser || targetUser.managerId !== userId) {
        return NextResponse.json(
          { error: 'You can only view data for your direct reports' },
          { status: 403 }
        );
      }

      effectiveUserId = viewAsUserId;
    }

    const [repositories, dateRange] = await Promise.all([
      getRepositories(effectiveUserId),
      getDateRange(effectiveUserId),
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
