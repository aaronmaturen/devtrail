import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/evidence
 * List evidence with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const criterionId = searchParams.get('criterionId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (criterionId) {
      where.criteria = {
        some: {
          criterionId: parseInt(criterionId),
        },
      };
    }

    // Fetch evidence with criteria relationships
    const [evidence, total, statistics] = await Promise.all([
      prisma.evidenceEntry.findMany({
        where,
        include: {
          criteria: {
            include: {
              criterion: true,
            },
          },
          attachments: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.evidenceEntry.count({ where }),
      prisma.evidenceEntry.groupBy({
        by: ['type'],
        where,
        _count: {
          type: true,
        },
      }),
    ]);

    // Build statistics object
    const stats = {
      github: statistics.find(s => s.type === 'PR')?._count.type || 0,
      slack: statistics.find(s => s.type === 'SLACK')?._count.type || 0,
      reviews: statistics.find(s => s.type === 'REVIEW')?._count.type || 0,
      manual: statistics.find(s => s.type === 'MANUAL')?._count.type || 0,
    };

    return NextResponse.json({
      evidence,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      statistics: stats,
    });
  } catch (error) {
    console.error('Error fetching evidence:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evidence' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/evidence
 * Create new evidence entry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,
      title,
      description,
      content,
      prNumber,
      prUrl,
      repository,
      mergedAt,
      slackLink,
      additions,
      deletions,
      changedFiles,
      components,
      criteriaIds, // Array of criterion IDs with confidence scores
    } = body;

    // Validate required fields
    if (!type || !title) {
      return NextResponse.json(
        { error: 'Type and title are required' },
        { status: 400 }
      );
    }

    // Create evidence entry
    const evidence = await prisma.evidenceEntry.create({
      data: {
        type,
        title,
        description,
        content: content || '{}',
        prNumber,
        prUrl,
        repository,
        mergedAt: mergedAt ? new Date(mergedAt) : null,
        slackLink,
        additions,
        deletions,
        changedFiles,
        components: components ? JSON.stringify(components) : null,
        timestamp: new Date(),
      },
    });

    // Create criteria relationships if provided
    if (criteriaIds && Array.isArray(criteriaIds)) {
      await Promise.all(
        criteriaIds.map((item: { criterionId: number; confidence: number; explanation?: string }) =>
          prisma.evidenceCriterion.create({
            data: {
              evidenceId: evidence.id,
              criterionId: item.criterionId,
              confidence: item.confidence,
              explanation: item.explanation,
            },
          })
        )
      );
    }

    // Fetch the created evidence with relationships
    const createdEvidence = await prisma.evidenceEntry.findUnique({
      where: { id: evidence.id },
      include: {
        criteria: {
          include: {
            criterion: true,
          },
        },
        attachments: true,
      },
    });

    return NextResponse.json(createdEvidence, { status: 201 });
  } catch (error) {
    console.error('Error creating evidence:', error);
    return NextResponse.json(
      { error: 'Failed to create evidence' },
      { status: 500 }
    );
  }
}
