import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { isInsightStale } from '@/lib/workers/monthly-insight';

/**
 * GET /api/analytics/monthly-insights
 * Returns all monthly insights, optionally filtered by date range
 * Also indicates which insights are stale and need regeneration
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Build where clause
    const where: any = {};

    if (dateFrom) {
      const [year, month] = dateFrom.split('-').map(Number);
      where.OR = where.OR || [];
      where.OR.push({ year: { gt: year } });
      where.OR.push({ year, monthNum: { gte: month } });
    }

    if (dateTo) {
      const [year, month] = dateTo.split('-').map(Number);
      if (where.OR) {
        // Complex date range - simplify by fetching all and filtering
        delete where.OR;
      }
    }

    // Fetch insights
    const insights = await prisma.monthlyInsight.findMany({
      orderBy: [
        { year: 'desc' },
        { monthNum: 'desc' },
      ],
    });

    // Filter by date range if provided (simpler approach)
    let filteredInsights = insights;
    if (dateFrom || dateTo) {
      filteredInsights = insights.filter((insight) => {
        if (dateFrom && insight.month < dateFrom.substring(0, 7)) return false;
        if (dateTo && insight.month > dateTo.substring(0, 7)) return false;
        return true;
      });
    }

    // Process insights to add stale detection and parse JSON fields
    const processedInsights = filteredInsights.map((insight) => {
      const isStale = isInsightStale({
        month: insight.month,
        isComplete: insight.isComplete,
        generatedAt: insight.generatedAt,
      });

      // Parse categories, handling potential missing field
      let categories: Record<string, number> = {};
      try {
        categories = insight.categories ? JSON.parse(insight.categories) : {};
      } catch {
        categories = {};
      }

      return {
        id: insight.id,
        month: insight.month,
        year: insight.year,
        monthNum: insight.monthNum,
        totalPrs: insight.totalPrs,
        totalChanges: insight.totalChanges,
        componentsCount: insight.componentsCount,
        categories,
        strengths: JSON.parse(insight.strengths),
        weaknesses: JSON.parse(insight.weaknesses),
        tags: JSON.parse(insight.tags),
        summary: insight.summary,
        generatedAt: insight.generatedAt.toISOString(),
        dataEndDate: insight.dataEndDate.toISOString(),
        isComplete: insight.isComplete,
        isStale,
      };
    });

    // Identify stale months
    const staleMonths = processedInsights
      .filter((i) => i.isStale)
      .map((i) => i.month);

    return NextResponse.json({
      insights: processedInsights,
      staleMonths,
      total: processedInsights.length,
    });
  } catch (error) {
    console.error('Error fetching monthly insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly insights' },
      { status: 500 }
    );
  }
}
