import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/data/github-prs - Get GitHub PRs from the normalized schema
 *
 * Query parameters:
 * - repo: Filter by repository (owner/repo format)
 * - userRole: Filter by user role (AUTHOR, REVIEWER, ASSIGNEE)
 * - startDate: Filter by merge date (ISO format)
 * - endDate: Filter by merge date (ISO format)
 * - limit: Maximum number of results (default 50)
 * - offset: Offset for pagination
 * - includeEvidence: Include linked evidence records (default false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repo = searchParams.get('repo');
    const userRole = searchParams.get('userRole');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeEvidence = searchParams.get('includeEvidence') === 'true';

    // Build where clause
    const where: any = {};

    if (repo) {
      where.repo = repo;
    }

    if (userRole) {
      where.userRole = userRole;
    }

    if (startDate || endDate) {
      where.mergedAt = {};
      if (startDate) where.mergedAt.gte = new Date(startDate);
      if (endDate) where.mergedAt.lte = new Date(endDate);
    }

    // Fetch PRs with optional evidence
    const prs = await prisma.gitHubPR.findMany({
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
            jiraLinks: {
              include: {
                jira: true,
              },
            },
          }
        : undefined,
      orderBy: {
        mergedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const totalCount = await prisma.gitHubPR.count({ where });

    return NextResponse.json({
      success: true,
      count: prs.length,
      totalCount,
      hasMore: offset + prs.length < totalCount,
      prs: prs.map((pr) => ({
        id: pr.id,
        number: pr.number,
        repo: pr.repo,
        title: pr.title,
        body: pr.body,
        url: pr.url,
        userRole: pr.userRole,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changedFiles,
        components: JSON.parse(pr.components),
        files: JSON.parse(pr.files),
        createdAt: pr.createdAt.toISOString(),
        mergedAt: pr.mergedAt?.toISOString(),
        reviewState: pr.reviewState,
        reviewBody: pr.reviewBody,
        reviewedAt: pr.reviewedAt?.toISOString(),
        evidence: includeEvidence && 'evidence' in pr
          ? (pr.evidence as any[]).map((e: any) => ({
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
        jiraLinks: includeEvidence && 'jiraLinks' in pr
          ? (pr.jiraLinks as any[]).map((link: any) => ({
              jiraKey: link.jiraKey,
              summary: link.jira.summary,
              issueType: link.jira.issueType,
            }))
          : undefined,
      })),
    });
  } catch (error) {
    console.error('Error fetching GitHub PRs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch GitHub PRs' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/data/github-prs/stats - Get statistics about GitHub PRs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Allow POST for complex queries
    if (body.action === 'stats') {
      const startDate = body.startDate ? new Date(body.startDate) : undefined;
      const endDate = body.endDate ? new Date(body.endDate) : undefined;

      const where: any = {};
      if (startDate || endDate) {
        where.mergedAt = {};
        if (startDate) where.mergedAt.gte = startDate;
        if (endDate) where.mergedAt.lte = endDate;
      }

      // Get counts by role
      const [authoredCount, reviewedCount, totalPRs] = await Promise.all([
        prisma.gitHubPR.count({ where: { ...where, userRole: 'AUTHOR' } }),
        prisma.gitHubPR.count({ where: { ...where, userRole: 'REVIEWER' } }),
        prisma.gitHubPR.count({ where }),
      ]);

      // Get aggregate stats for authored PRs
      const authoredStats = await prisma.gitHubPR.aggregate({
        where: { ...where, userRole: 'AUTHOR' },
        _sum: {
          additions: true,
          deletions: true,
          changedFiles: true,
        },
        _avg: {
          additions: true,
          deletions: true,
          changedFiles: true,
        },
      });

      // Get unique repos
      const repos = await prisma.gitHubPR.findMany({
        where,
        select: { repo: true },
        distinct: ['repo'],
      });

      return NextResponse.json({
        success: true,
        stats: {
          totalPRs,
          authoredCount,
          reviewedCount,
          repoCount: repos.length,
          repos: repos.map((r) => r.repo),
          authored: {
            totalAdditions: authoredStats._sum.additions || 0,
            totalDeletions: authoredStats._sum.deletions || 0,
            totalChangedFiles: authoredStats._sum.changedFiles || 0,
            avgAdditions: Math.round(authoredStats._avg.additions || 0),
            avgDeletions: Math.round(authoredStats._avg.deletions || 0),
            avgChangedFiles: Math.round(authoredStats._avg.changedFiles || 0),
          },
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error processing GitHub PR request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
