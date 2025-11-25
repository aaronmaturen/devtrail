import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/reviews
 * List all review analyses with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get('year');
    const reviewType = searchParams.get('reviewType');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};
    if (year) {
      where.year = year;
    }
    if (reviewType) {
      where.reviewType = reviewType;
    }

    // Get total count
    const total = await prisma.reviewAnalysis.count({ where });

    // Get analyses
    const analyses = await prisma.reviewAnalysis.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        year: true,
        reviewType: true,
        source: true,
        aiSummary: true,
        themes: true,
        strengths: true,
        growthAreas: true,
        achievements: true,
        confidenceScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Parse JSON fields
    const parsedAnalyses = analyses.map((analysis) => ({
      ...analysis,
      themes: JSON.parse(analysis.themes),
      strengths: JSON.parse(analysis.strengths),
      growthAreas: JSON.parse(analysis.growthAreas),
      achievements: JSON.parse(analysis.achievements),
    }));

    return NextResponse.json({
      analyses: parsedAnalyses,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching review analyses:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch review analyses',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
