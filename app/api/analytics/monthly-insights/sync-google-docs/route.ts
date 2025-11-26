/**
 * API Route: Sync Monthly Insights to Google Docs
 *
 * POST /api/analytics/monthly-insights/sync-google-docs
 *
 * Creates or updates a Google Doc with all monthly insights,
 * formatted as a comprehensive trends document.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { syncDocument, DocumentContent, DocumentSection } from '@/lib/services/google-docs';
import { hasGoogleConfig } from '@/lib/config';
import { format } from 'date-fns';

// Helper to format month string to readable format
function formatMonth(month: string): string {
  try {
    const date = new Date(`${month}-01`);
    return format(date, 'MMMM yyyy');
  } catch {
    return month;
  }
}

// Helper to format categories for display
function formatCategories(categories: Record<string, number>, totalPrs: number): string[] {
  const entries = Object.entries(categories)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return [];

  return entries.map(([category, count]) => {
    const percentage = Math.round((count / totalPrs) * 100);
    const label = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
    return `${label}: ${count} PRs (${percentage}%)`;
  });
}

// Helper to safely parse JSON fields
function parseJsonField<T>(value: string | T | null | undefined, defaultValue: T): T {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }
  return value as T;
}

// Build document content from insights
function buildDocumentContent(insights: any[]): DocumentContent {
  const sections: DocumentSection[] = [];

  // Individual month sections - most recent first
  for (const insight of insights) {
    const monthName = formatMonth(insight.month);

    // Parse JSON fields
    const tags = parseJsonField<string[]>(insight.tags, []);
    const categories = parseJsonField<Record<string, number>>(insight.categories, {});
    const strengths = parseJsonField<string[]>(insight.strengths, []);
    const weaknesses = parseJsonField<string[]>(insight.weaknesses, []);

    // Month header
    const monthTitle = insight.isComplete ? monthName : `${monthName} (in progress)`;
    sections.push({
      heading: monthTitle,
      headingLevel: 1,
    });

    // Tags
    if (tags.length > 0) {
      sections.push({
        paragraphs: [`Tags: ${tags.join(', ')}`],
      });
    }

    // Summary
    if (insight.summary) {
      sections.push({
        paragraphs: [insight.summary],
      });
    }

    // Metrics
    sections.push({
      heading: 'Metrics',
      headingLevel: 2,
      bulletPoints: [
        `PRs merged: ${insight.totalPrs}`,
        `Lines changed: ${insight.totalChanges.toLocaleString()}`,
        `Components touched: ${insight.componentsCount}`,
        ...formatCategories(categories, insight.totalPrs),
      ],
    });

    // Strengths
    if (strengths.length > 0) {
      sections.push({
        heading: 'Strengths',
        headingLevel: 2,
        bulletPoints: strengths,
      });
    }

    // Areas for Improvement
    if (weaknesses.length > 0) {
      sections.push({
        heading: 'Areas for Improvement',
        headingLevel: 2,
        bulletPoints: weaknesses,
      });
    }
  }

  return {
    title: 'Monthly Development Insights',
    sections,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Check if Google is configured
    const isConfigured = await hasGoogleConfig();
    if (!isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google Docs not configured. Please add your Google OAuth credentials in Settings.',
        },
        { status: 400 }
      );
    }

    // Get optional date range from request body
    const body = await request.json().catch(() => ({}));
    const { dateFrom, dateTo } = body;

    // Build query
    const where: any = {};
    if (dateFrom || dateTo) {
      where.month = {};
      if (dateFrom) where.month.gte = dateFrom;
      if (dateTo) where.month.lte = dateTo;
    }

    // Fetch all monthly insights
    const insights = await prisma.monthlyInsight.findMany({
      where,
      orderBy: { month: 'desc' },
    });

    if (insights.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No monthly insights found. Generate some insights first from the Dashboard.',
        },
        { status: 400 }
      );
    }

    // Build document content
    const content = buildDocumentContent(insights);

    // Sync to Google Docs
    const result = await syncDocument(
      'Monthly Development Insights',
      content
    );

    return NextResponse.json({
      success: true,
      documentUrl: result.documentUrl,
      documentId: result.documentId,
      created: result.created,
      insightsCount: insights.length,
      message: result.created
        ? 'Created new Google Doc with monthly insights'
        : 'Updated existing Google Doc with latest insights',
    });
  } catch (error) {
    console.error('Error syncing to Google Docs:', error);

    // Handle specific Google API errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('invalid_grant') || errorMessage.includes('Token has been expired')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google OAuth token expired. Please re-authenticate in Settings.',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Check configuration status
  try {
    const isConfigured = await hasGoogleConfig();
    return NextResponse.json({
      configured: isConfigured,
    });
  } catch {
    return NextResponse.json({
      configured: false,
    });
  }
}
