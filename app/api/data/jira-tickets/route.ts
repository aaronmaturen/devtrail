import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/data/jira-tickets - Get Jira tickets from the normalized schema
 *
 * Query parameters:
 * - project: Filter by project key (e.g., "PRO")
 * - userRole: Filter by user role (ASSIGNEE, REVIEWER)
 * - issueType: Filter by issue type (Story, Bug, Task, etc.)
 * - status: Filter by status
 * - startDate: Filter by resolved date (ISO format)
 * - endDate: Filter by resolved date (ISO format)
 * - limit: Maximum number of results (default 50)
 * - offset: Offset for pagination
 * - includeEvidence: Include linked evidence records (default false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get('project');
    const userRole = searchParams.get('userRole');
    const issueType = searchParams.get('issueType');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeEvidence = searchParams.get('includeEvidence') === 'true';

    // Build where clause
    const where: any = {};

    if (project) {
      where.key = { startsWith: `${project}-` };
    }

    if (userRole) {
      where.userRole = userRole;
    }

    if (issueType) {
      where.issueType = issueType;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.resolvedAt = {};
      if (startDate) where.resolvedAt.gte = new Date(startDate);
      if (endDate) where.resolvedAt.lte = new Date(endDate);
    }

    // Fetch tickets with optional evidence
    const tickets = await prisma.jiraTicket.findMany({
      where,
      include: includeEvidence
        ? {
            evidence: {
              include: {
                criteria: {
                  include: {
                    criterion: true,
                  },
                },
              },
            },
            prLinks: {
              include: {
                pr: true,
              },
            },
          }
        : undefined,
      orderBy: {
        resolvedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const totalCount = await prisma.jiraTicket.count({ where });

    return NextResponse.json({
      success: true,
      count: tickets.length,
      totalCount,
      hasMore: offset + tickets.length < totalCount,
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        key: ticket.key,
        summary: ticket.summary,
        description: ticket.description,
        issueType: ticket.issueType,
        status: ticket.status,
        priority: ticket.priority,
        storyPoints: ticket.storyPoints,
        durationDays: ticket.durationDays,
        sprint: ticket.sprint,
        epicKey: ticket.epicKey,
        epicSummary: ticket.epicSummary,
        userRole: ticket.userRole,
        commentCount: ticket.commentCount,
        commentSummary: ticket.commentSummary,
        figmaLinks: ticket.figmaLinks ? JSON.parse(ticket.figmaLinks) : [],
        confluenceLinks: ticket.confluenceLinks ? JSON.parse(ticket.confluenceLinks) : [],
        otherLinks: ticket.otherLinks ? JSON.parse(ticket.otherLinks) : [],
        createdAt: ticket.createdAt.toISOString(),
        resolvedAt: ticket.resolvedAt?.toISOString(),
        evidence: includeEvidence && 'evidence' in ticket
          ? (ticket.evidence as any[]).map((e: any) => ({
              id: e.id,
              type: e.type,
              summary: e.summary,
              category: e.category,
              scope: e.scope,
              criteria: e.criteria.map((c: any) => ({
                id: c.criterion.id,
                area: c.criterion.areaOfConcentration,
                subarea: c.criterion.subarea,
                confidence: c.confidence,
              })),
            }))
          : undefined,
        prLinks: includeEvidence && 'prLinks' in ticket
          ? (ticket.prLinks as any[]).map((link: any) => ({
              prId: link.prId,
              repo: link.pr.repo,
              number: link.pr.number,
              title: link.pr.title,
            }))
          : undefined,
      })),
    });
  } catch (error) {
    console.error('Error fetching Jira tickets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Jira tickets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/data/jira-tickets - Get statistics about Jira tickets
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'stats') {
      const startDate = body.startDate ? new Date(body.startDate) : undefined;
      const endDate = body.endDate ? new Date(body.endDate) : undefined;

      const where: any = {};
      if (startDate || endDate) {
        where.resolvedAt = {};
        if (startDate) where.resolvedAt.gte = startDate;
        if (endDate) where.resolvedAt.lte = endDate;
      }

      // Get counts by role
      const [assigneeCount, reviewerCount, totalTickets] = await Promise.all([
        prisma.jiraTicket.count({ where: { ...where, userRole: 'ASSIGNEE' } }),
        prisma.jiraTicket.count({ where: { ...where, userRole: 'REVIEWER' } }),
        prisma.jiraTicket.count({ where }),
      ]);

      // Get counts by issue type
      const issueTypes = await prisma.jiraTicket.groupBy({
        by: ['issueType'],
        where,
        _count: true,
      });

      // Get aggregate stats
      const stats = await prisma.jiraTicket.aggregate({
        where: { ...where, userRole: 'ASSIGNEE' },
        _sum: {
          storyPoints: true,
          durationDays: true,
        },
        _avg: {
          storyPoints: true,
          durationDays: true,
        },
      });

      // Get unique projects
      const tickets = await prisma.jiraTicket.findMany({
        where,
        select: { key: true },
      });
      const projects = [...new Set(tickets.map(t => t.key.split('-')[0]))];

      return NextResponse.json({
        success: true,
        stats: {
          totalTickets,
          assigneeCount,
          reviewerCount,
          projectCount: projects.length,
          projects,
          byIssueType: Object.fromEntries(
            issueTypes.map(it => [it.issueType, it._count])
          ),
          owned: {
            totalStoryPoints: stats._sum.storyPoints || 0,
            totalDurationDays: stats._sum.durationDays || 0,
            avgStoryPoints: Math.round((stats._avg.storyPoints || 0) * 10) / 10,
            avgDurationDays: Math.round((stats._avg.durationDays || 0) * 10) / 10,
          },
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error processing Jira ticket request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
