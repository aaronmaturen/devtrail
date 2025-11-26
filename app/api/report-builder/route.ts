import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/report-builder
 * List all report documents
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
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

    // Transform to include block counts
    const transformedDocuments = documents.map((doc) => ({
      ...doc,
      blockCount: doc.blocks.length,
      promptCount: doc.blocks.filter((b) => b.type === 'PROMPT').length,
      responseCount: doc.blocks.filter((b) => b.type === 'RESPONSE').length,
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
  try {
    const body = await request.json();
    const { name, description, contextConfig } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const document = await prisma.reportDocument.create({
      data: {
        name,
        description: description || null,
        contextConfig: contextConfig ? JSON.stringify(contextConfig) : '{}',
        status: 'DRAFT',
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
