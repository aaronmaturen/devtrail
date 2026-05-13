import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';

/**
 * GET /api/report-builder
 * List all report documents
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause - always filter by userId
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [documents, total] = await Promise.all([
      prisma.reportDocument.findMany({
        where,
        include: {
          blocks: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              type: true,
              position: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.reportDocument.count({ where }),
    ]);

    // Fetch subject names for documents with subjectUserId
    const subjectIds = documents
      .filter((d) => d.subjectUserId && d.subjectUserId !== userId)
      .map((d) => d.subjectUserId as string);

    const subjects = subjectIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const subjectMap = new Map(subjects.map((s) => [s.id, s.name || s.email || 'Unknown']));

    // Transform to include block counts and subject name
    const transformedDocuments = documents.map((doc) => ({
      ...doc,
      blockCount: doc.blocks.length,
      promptCount: doc.blocks.filter((b) => b.type === 'PROMPT').length,
      responseCount: doc.blocks.filter((b) => b.type === 'RESPONSE').length,
      subjectName: doc.subjectUserId && doc.subjectUserId !== userId
        ? subjectMap.get(doc.subjectUserId) || null
        : null,
    }));

    return NextResponse.json({
      documents: transformedDocuments,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('Error fetching report documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report documents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/report-builder
 * Create a new report document
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const body = await request.json();
    const { name, description, contextConfig, subjectUserId } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Validate subjectUserId if provided (must be self or a direct report)
    if (subjectUserId && subjectUserId !== userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { reports: { select: { id: true } } },
      });
      const reportIds = user?.reports.map((r) => r.id) || [];
      if (!reportIds.includes(subjectUserId)) {
        return NextResponse.json(
          { error: 'You can only write reviews for yourself or your direct reports' },
          { status: 403 }
        );
      }
    }

    const document = await prisma.reportDocument.create({
      data: {
        name,
        description: description || null,
        contextConfig: contextConfig ? JSON.stringify(contextConfig) : '{}',
        status: 'DRAFT',
        userId,
        subjectUserId: subjectUserId || userId, // Default to self
      },
      include: {
        blocks: true,
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Error creating report document:', error);
    return NextResponse.json(
      { error: 'Failed to create report document' },
      { status: 500 }
    );
  }
}
