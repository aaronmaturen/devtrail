import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { adfToText } from '@/lib/utils/adf-to-text';

// Map new Evidence types to display types
const typeDisplayMap: Record<string, string> = {
  // GitHub types
  PR_AUTHORED: 'PR',
  PR_REVIEWED: 'PR',
  ISSUE_CREATED: 'PR',
  GITHUB_PR: 'PR',
  GITHUB_ISSUE: 'PR',
  // Jira types
  JIRA_OWNED: 'JIRA',
  JIRA_REVIEWED: 'JIRA',
  JIRA: 'JIRA',
  // Other types
  SLACK: 'SLACK',
  MANUAL: 'MANUAL',
};

// Map display types to internal types
const displayToInternalTypes: Record<string, string[]> = {
  PR: ['PR_AUTHORED', 'PR_REVIEWED', 'ISSUE_CREATED', 'GITHUB_PR', 'GITHUB_ISSUE'],
  JIRA: ['JIRA_OWNED', 'JIRA_REVIEWED', 'JIRA'],
  SLACK: ['SLACK'],
  MANUAL: ['MANUAL'],
};

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

    // Map display type to internal types
    if (type && displayToInternalTypes[type]) {
      where.type = { in: displayToInternalTypes[type] };
    }

    if (search) {
      where.OR = [
        { summary: { contains: search } },
        { manualTitle: { contains: search } },
        { manualContent: { contains: search } },
        { githubPr: { title: { contains: search } } },
        { jiraTicket: { summary: { contains: search } } },
      ];
    }

    if (criterionId) {
      const matchingEvidence = await prisma.evidenceCriterion.findMany({
        where: { criterionId: parseInt(criterionId) },
        select: { evidenceId: true },
      });
      where.id = { in: matchingEvidence.map(e => e.evidenceId) };
    }

    // Fetch evidence with all related data
    const [evidence, total] = await Promise.all([
      prisma.evidence.findMany({
        where,
        include: {
          githubPr: {
            include: {
              jiraLinks: {
                include: { jira: true },
              },
            },
          },
          jiraTicket: {
            include: {
              prLinks: {
                include: { pr: true },
              },
            },
          },
          slackMessage: true,
          criteria: {
            include: { criterion: true },
          },
          attachments: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.evidence.count({ where }),
    ]);

    // Get statistics by type
    const stats = await prisma.evidence.groupBy({
      by: ['type'],
      _count: { type: true },
    });

    // Transform evidence to consistent display format
    const transformedEvidence = evidence.map(e => {
      const displayType = typeDisplayMap[e.type] || 'MANUAL';

      // Build title and description based on source
      let title = e.summary;
      let description = e.summary;
      let repository: string | null = null;
      let prNumber: number | null = null;
      let prUrl: string | null = null;
      let slackLink: string | null = null;
      let additions: number | null = null;
      let deletions: number | null = null;
      let changedFiles: number | null = null;
      let components: string | null = null;
      let mergedAt: Date | null = null;

      // Linked items
      let linkedJiraTickets: Array<{
        key: string;
        summary: string;
        issueType: string;
        status: string;
      }> = [];
      let linkedPRs: Array<{
        repo: string;
        number: number;
        title: string;
        url: string;
      }> = [];

      if (e.githubPr) {
        title = e.githubPr.title;
        repository = e.githubPr.repo;
        prNumber = e.githubPr.number;
        prUrl = e.githubPr.url;
        additions = e.githubPr.additions;
        deletions = e.githubPr.deletions;
        changedFiles = e.githubPr.changedFiles;
        components = e.githubPr.components;
        mergedAt = e.githubPr.mergedAt;

        // Get linked Jira tickets
        if (e.githubPr.jiraLinks) {
          linkedJiraTickets = e.githubPr.jiraLinks.map(link => ({
            key: link.jira.key,
            summary: link.jira.summary,
            issueType: link.jira.issueType,
            status: link.jira.status,
          }));
        }
      } else if (e.jiraTicket) {
        title = `${e.jiraTicket.key}: ${e.jiraTicket.summary}`;
        description = adfToText(e.jiraTicket.description) || e.summary;

        // Get linked PRs
        if (e.jiraTicket.prLinks) {
          linkedPRs = e.jiraTicket.prLinks.map(link => ({
            repo: link.pr.repo,
            number: link.pr.number,
            title: link.pr.title,
            url: link.pr.url,
          }));
        }
      } else if (e.slackMessage) {
        title = e.slackMessage.content.substring(0, 100) + (e.slackMessage.content.length > 100 ? '...' : '');
        description = e.slackMessage.content;
        slackLink = e.slackMessage.permalink;
      } else if (e.manualTitle) {
        title = e.manualTitle;
        description = e.manualContent || e.summary;
      }

      return {
        id: e.id,
        type: displayType,
        internalType: e.type,
        title,
        description,
        summary: e.summary,
        category: e.category,
        scope: e.scope,
        timestamp: e.occurredAt,
        repository,
        prNumber,
        prUrl,
        slackLink,
        additions,
        deletions,
        changedFiles,
        components,
        mergedAt,
        criteria: e.criteria,
        attachments: e.attachments,
        linkedJiraTickets,
        linkedPRs,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      };
    });

    // Build statistics object
    const statistics = {
      github: stats
        .filter(s => ['PR_AUTHORED', 'PR_REVIEWED', 'ISSUE_CREATED', 'GITHUB_PR', 'GITHUB_ISSUE'].includes(s.type))
        .reduce((acc, s) => acc + s._count.type, 0),
      slack: stats.find(s => s.type === 'SLACK')?._count.type || 0,
      reviews: 0, // Reviews are now part of manual or separate
      manual: stats.find(s => s.type === 'MANUAL')?._count.type || 0,
      jira: stats
        .filter(s => ['JIRA_OWNED', 'JIRA_REVIEWED', 'JIRA'].includes(s.type))
        .reduce((acc, s) => acc + s._count.type, 0),
    };

    return NextResponse.json({
      evidence: transformedEvidence,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      statistics,
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
      criteriaIds,
    } = body;

    // Validate required fields
    if (!type || !title) {
      return NextResponse.json(
        { error: 'Type and title are required' },
        { status: 400 }
      );
    }

    // Map display type to internal type
    const internalTypeMap: Record<string, string> = {
      PR: 'PR_AUTHORED',
      SLACK: 'SLACK',
      REVIEW: 'MANUAL',
      MANUAL: 'MANUAL',
      JIRA: 'JIRA_OWNED',
    };

    const internalType = internalTypeMap[type] || 'MANUAL';

    // Create evidence with appropriate source data
    let evidenceData: any = {
      type: internalType,
      summary: description || title,
      category: 'feature',
      scope: 'medium',
      occurredAt: new Date(),
    };

    // For PR type, try to find or create GitHubPR
    if (type === 'PR' && repository && prNumber) {
      let githubPr = await prisma.gitHubPR.findFirst({
        where: { repo: repository, number: prNumber, userRole: 'AUTHOR' },
      });

      if (!githubPr) {
        githubPr = await prisma.gitHubPR.create({
          data: {
            number: prNumber,
            repo: repository,
            title,
            body: description,
            url: prUrl || `https://github.com/${repository}/pull/${prNumber}`,
            additions: additions || 0,
            deletions: deletions || 0,
            changedFiles: changedFiles || 0,
            createdAt: new Date(),
            mergedAt: mergedAt ? new Date(mergedAt) : null,
            components: components ? JSON.stringify(components) : '[]',
            files: '[]',
            userRole: 'AUTHOR',
          },
        });
      }

      evidenceData.githubPrId = githubPr.id;
    } else if (type === 'SLACK' && slackLink) {
      // For Slack type, create SlackMessage
      const slackMessage = await prisma.slackMessage.create({
        data: {
          channel: 'unknown',
          author: 'unknown',
          content: description || title,
          timestamp: new Date(),
          permalink: slackLink,
        },
      });
      evidenceData.slackMessageId = slackMessage.id;
    } else {
      // For Manual/other types
      evidenceData.manualTitle = title;
      evidenceData.manualContent = description || content;
    }

    // Create evidence
    const evidence = await prisma.evidence.create({
      data: evidenceData,
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
    const createdEvidence = await prisma.evidence.findUnique({
      where: { id: evidence.id },
      include: {
        githubPr: true,
        jiraTicket: true,
        slackMessage: true,
        criteria: {
          include: { criterion: true },
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
