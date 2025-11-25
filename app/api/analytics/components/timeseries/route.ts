import { NextRequest, NextResponse } from 'next/server';
import { getTimeSeriesData, FilterOptions } from '@/lib/services/component-analytics';

/**
 * GET /api/analytics/components/timeseries
 * Get time series data for component activity
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse filter options
    const filterOptions: FilterOptions = {};

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
