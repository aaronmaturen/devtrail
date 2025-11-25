import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/reports
 * List reports with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};

    if (type) {
      where.type = type;
    }

    // Fetch reports
    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({ where }),
    ]);

    return NextResponse.json({
      reports,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports
 * Create new report entry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      type,
      content,
      metadata,
      jobId,
      evidenceCount,
      criteriaCount,
    } = body;

    // Validate required fields
    if (!name || !type || !content) {
      return NextResponse.json(
        { error: 'Name, type, and content are required' },
        { status: 400 }
      );
    }

    // Create report
    const report = await prisma.report.create({
      data: {
        name,
        type,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null,
        jobId,
        evidenceCount,
        criteriaCount,
      },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error('Error creating report:', error);
    return NextResponse.json(
      { error: 'Failed to create report' },
      { status: 500 }
    );
  }
}
