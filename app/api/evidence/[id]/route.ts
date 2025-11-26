import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { adfToText } from '@/lib/utils/adf-to-text';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

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

/**
 * GET /api/evidence/[id]
 * Get single evidence entry by ID
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const evidence = await prisma.evidence.findUnique({
      where: { id },
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
    });

    if (!evidence) {
      return NextResponse.json(
        { error: 'Evidence not found' },
        { status: 404 }
      );
    }

    const displayType = typeDisplayMap[evidence.type] || 'MANUAL';

    // Build response with all details
    let title = evidence.summary;
    let description = evidence.summary;
    let repository: string | null = null;
    let prNumber: number | null = null;
    let prUrl: string | null = null;
    let slackLink: string | null = null;
    let additions: number | null = null;
    let deletions: number | null = null;
    let changedFiles: number | null = null;
    let components: string | null = null;
    let mergedAt: Date | null = null;
    let content = '{}';

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

    if (evidence.githubPr) {
      title = evidence.githubPr.title;
      description = evidence.githubPr.body || evidence.summary;
      repository = evidence.githubPr.repo;
      prNumber = evidence.githubPr.number;
      prUrl = evidence.githubPr.url;
      additions = evidence.githubPr.additions;
      deletions = evidence.githubPr.deletions;
      changedFiles = evidence.githubPr.changedFiles;
      components = evidence.githubPr.components;
      mergedAt = evidence.githubPr.mergedAt;

      if (evidence.githubPr.jiraLinks) {
        linkedJiraTickets = evidence.githubPr.jiraLinks.map(link => ({
          key: link.jira.key,
          summary: link.jira.summary,
          issueType: link.jira.issueType,
          status: link.jira.status,
        }));
      }
    } else if (evidence.jiraTicket) {
      title = `${evidence.jiraTicket.key}: ${evidence.jiraTicket.summary}`;
      description = adfToText(evidence.jiraTicket.description) || evidence.summary;
      content = JSON.stringify({
        key: evidence.jiraTicket.key,
        issueType: evidence.jiraTicket.issueType,
        status: evidence.jiraTicket.status,
        storyPoints: evidence.jiraTicket.storyPoints,
        priority: evidence.jiraTicket.priority,
        sprint: evidence.jiraTicket.sprint,
        epicKey: evidence.jiraTicket.epicKey,
        epicSummary: evidence.jiraTicket.epicSummary,
      });

      if (evidence.jiraTicket.prLinks) {
        linkedPRs = evidence.jiraTicket.prLinks.map(link => ({
          repo: link.pr.repo,
          number: link.pr.number,
          title: link.pr.title,
          url: link.pr.url,
        }));
      }
    } else if (evidence.slackMessage) {
      title = evidence.slackMessage.content.substring(0, 100) + (evidence.slackMessage.content.length > 100 ? '...' : '');
      description = evidence.slackMessage.content;
      slackLink = evidence.slackMessage.permalink;
      content = JSON.stringify({
        channel: evidence.slackMessage.channel,
        author: evidence.slackMessage.author,
        reactions: evidence.slackMessage.reactions,
      });
    } else if (evidence.manualTitle) {
      title = evidence.manualTitle;
      description = evidence.manualContent || evidence.summary;
      content = evidence.manualContent || '{}';
    }

    return NextResponse.json({
      id: evidence.id,
      type: displayType,
      internalType: evidence.type,
      title,
      description,
      content,
      summary: evidence.summary,
      category: evidence.category,
      scope: evidence.scope,
      timestamp: evidence.occurredAt,
      repository,
      prNumber,
      prUrl,
      slackLink,
      additions,
      deletions,
      changedFiles,
      components,
      mergedAt,
      criteria: evidence.criteria,
      attachments: evidence.attachments,
      linkedJiraTickets,
      linkedPRs,
      createdAt: evidence.createdAt,
      updatedAt: evidence.updatedAt,
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
 * PUT /api/evidence/[id]
 * Update evidence entry
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      description,
      summary,
      category,
      scope,
      criteriaIds,
    } = body;

    // Check if evidence exists
    const existing = await prisma.evidence.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Evidence not found' },
        { status: 404 }
      );
    }

    // Update evidence
    const updateData: any = {};
    if (summary !== undefined) updateData.summary = summary;
    if (category !== undefined) updateData.category = category;
    if (scope !== undefined) updateData.scope = scope;

    // If manual evidence, update manual fields
    if (existing.type === 'MANUAL') {
      if (title !== undefined) updateData.manualTitle = title;
      if (description !== undefined) updateData.manualContent = description;
    }

    const evidence = await prisma.evidence.update({
      where: { id },
      data: updateData,
    });

    // Update criteria relationships if provided
    if (criteriaIds && Array.isArray(criteriaIds)) {
      // Delete existing criteria relationships
      await prisma.evidenceCriterion.deleteMany({
        where: { evidenceId: id },
      });

      // Create new relationships
      await Promise.all(
        criteriaIds.map((item: { criterionId: number; confidence: number; explanation?: string }) =>
          prisma.evidenceCriterion.create({
            data: {
              evidenceId: id,
              criterionId: item.criterionId,
              confidence: item.confidence,
              explanation: item.explanation,
            },
          })
        )
      );
    }

    // Fetch updated evidence with relationships
    const updatedEvidence = await prisma.evidence.findUnique({
      where: { id },
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

    return NextResponse.json(updatedEvidence);
  } catch (error) {
    console.error('Error updating evidence:', error);
    return NextResponse.json(
      { error: 'Failed to update evidence' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/evidence/[id]
 * Delete evidence entry
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Check if evidence exists
    const existing = await prisma.evidence.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Evidence not found' },
        { status: 404 }
      );
    }

    // Delete evidence (cascade will delete criteria relationships and attachments)
    await prisma.evidence.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting evidence:', error);
    return NextResponse.json(
      { error: 'Failed to delete evidence' },
      { status: 500 }
    );
  }
}
