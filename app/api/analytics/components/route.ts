import { NextRequest, NextResponse } from 'next/server';
import { analyzeComponents, FilterOptions } from '@/lib/services/component-analytics';

/**
 * GET /api/analytics/components
 * Get component analysis data with optional filters
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

    const result = await analyzeComponents(filterOptions);

    return NextResponse.json({
      summary: result.summary,
      components: result.components,
      filters_applied: filterOptions,
      using_pr_counts: result.using_pr_counts,
      note: result.note,
    });
  } catch (error) {
    console.error('Error analyzing components:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze components';
    return NextResponse.json(
      { error: errorMessage, details: error },
      { status: 500 }
    );
  }
}
