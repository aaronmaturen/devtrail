import { NextRequest, NextResponse } from 'next/server';
import { getTimeSeriesData, FilterOptions } from '@/lib/services/component-analytics';
import { withAuth, isAuthError } from '@/lib/api/auth';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/analytics/components/timeseries
 * Get time series data for component activity
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

    // Parse filter options
    const filterOptions: FilterOptions = {
      userId: effectiveUserId,
    };

    if (searchParams.get('dateFrom')) {
      filterOptions.dateFrom = searchParams.get('dateFrom')!;
    }
    if (searchParams.get('dateTo')) {
      filterOptions.dateTo = searchParams.get('dateTo')!;
    }

    const repositories = searchParams.getAll('repositories');
    if (repositories.length > 0) {
      filterOptions.repositories = repositories;
    }

    const components = searchParams.getAll('components');
    if (components.length > 0) {
      filterOptions.components = components;
    }

    const timeseries = await getTimeSeriesData(filterOptions);

    return NextResponse.json({
      timeseries,
      filters_applied: filterOptions,
    });
  } catch (error) {
    console.error('Error getting time series data:', error);
    return NextResponse.json(
      { error: 'Failed to get time series data' },
      { status: 500 }
    );
  }
}
