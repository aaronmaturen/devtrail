import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { adfToText } from '@/lib/utils/adf-to-text';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

// Map internal types to display types
const typeDisplayMap: Record<string, string> = {
  PR_AUTHORED: 'PR',
  PR_REVIEWED: 'PR',
  JIRA_OWNED: 'JIRA',
  JIRA_REVIEWED: 'JIRA',
  ISSUE_CREATED: 'PR',
  SLACK: 'SLACK',
  MANUAL: 'MANUAL',
};

/**
 * GET /api/reviews/interactive
 *
 * Loads all data needed for the interactive review page:
 * - User config and context
 * - Presence Way framework
 * - Performance criteria
 * - Evidence entries with criteria matching
 * - Goals and progress
 * - Past review documents
 * - Component analysis data
 */
export async function GET() {
  try {
    // Load Presence Way framework from root directory
    const presenceWayPath = path.join(process.cwd(), '..', 'presence_way.md');
    let presenceWayContent = null;

    if (fs.existsSync(presenceWayPath)) {
      presenceWayContent = fs.readFileSync(presenceWayPath, 'utf8');
    }

    // Get user config from database - Config stores key/value pairs
    const configEntries = await prisma.config.findMany();
    const configMap: Record<string, any> = {};
    configEntries.forEach(entry => {
      try {
        // Try to parse JSON value, fallback to raw string
        configMap[entry.key] = JSON.parse(entry.value);
      } catch {
        configMap[entry.key] = entry.value;
      }
    });

    // Get all performance criteria
    const criteria = await prisma.criterion.findMany({
      orderBy: [
        { areaOfConcentration: 'asc' },
        { id: 'asc' },
      ],
    });

    // Get evidence entries with criteria matching (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const evidenceEntries = await prisma.evidence.findMany({
      where: {
        occurredAt: {
          gte: twelveMonthsAgo,
        },
      },
      include: {
        githubPr: true,
        jiraTicket: true,
        slackMessage: true,
        criteria: {
          include: {
            criterion: true,
          },
        },
        attachments: true,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    // Transform evidence to consistent format
    const evidence = evidenceEntries.map(e => {
      const displayType = typeDisplayMap[e.type] || 'MANUAL';

      // Build title and other fields based on source
      let title = e.summary;
      let description = e.summary;
      let prNumber: number | null = null;
      let prUrl: string | null = null;
      let repository: string | null = null;
      let slackLink: string | null = null;
      let additions: number | null = null;
      let deletions: number | null = null;
      let changedFiles: number | null = null;
      let components: string[] | null = null;

      if (e.githubPr) {
        title = e.githubPr.title;
        description = e.githubPr.body || e.summary;
        prNumber = e.githubPr.number;
        prUrl = e.githubPr.url;
        repository = e.githubPr.repo;
        additions = e.githubPr.additions;
        deletions = e.githubPr.deletions;
        changedFiles = e.githubPr.changedFiles;
        components = e.githubPr.components ? JSON.parse(e.githubPr.components) : null;
      } else if (e.jiraTicket) {
        title = `${e.jiraTicket.key}: ${e.jiraTicket.summary}`;
        description = adfToText(e.jiraTicket.description) || e.summary;
      } else if (e.slackMessage) {
        title = e.slackMessage.content.substring(0, 100);
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
        timestamp: e.occurredAt,
        prNumber,
        prUrl,
        repository,
        slackLink,
        confidence: 1.0,
        additions,
        deletions,
        changedFiles,
        components,
        criteria: e.criteria,
        attachments: e.attachments,
      };
    });

    // Get active goals
    const goals = await prisma.goal.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'COMPLETED'],
        },
      },
      include: {
        milestones: true,
        progressEntries: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 3,
        },
      },
      orderBy: [
        { priority: 'asc' },
        { targetDate: 'asc' },
      ],
    });

    // Get review documents (goals, employee reviews, manager reviews)
    const reviewDocuments = await prisma.reviewDocument.findMany({
      orderBy: {
        year: 'desc',
      },
    });

    // Get review analyses (AI-extracted insights from past reviews)
    const reviewAnalyses = await prisma.reviewAnalysis.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 10, // Last 10 analyses
    });

    // Calculate evidence stats
    const evidenceStats = {
      total: evidence.length,
      byType: evidence.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byRepository: evidence
        .filter(e => e.repository)
        .reduce((acc, e) => {
          acc[e.repository!] = (acc[e.repository!] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
    };

    // Group evidence by criterion for quick lookup
    const evidenceByCriterion: Record<number, any[]> = {};
    evidence.forEach(e => {
      e.criteria.forEach((ec: any) => {
        if (!evidenceByCriterion[ec.criterionId]) {
          evidenceByCriterion[ec.criterionId] = [];
        }
        evidenceByCriterion[ec.criterionId].push({
          id: e.id,
          type: e.type,
          title: e.title,
          description: e.description,
          timestamp: e.timestamp.toISOString(),
          prNumber: e.prNumber,
          prUrl: e.prUrl,
          repository: e.repository,
          confidence: ec.confidence,
          explanation: ec.explanation,
        });
      });
    });

    // Sort evidence by confidence within each criterion
    Object.values(evidenceByCriterion).forEach(items => {
      items.sort((a, b) => b.confidence - a.confidence);
    });

    return NextResponse.json({
      success: true,
      data: {
        presenceWay: presenceWayContent,
        userContext: configMap.user_context || null,
        githubUsername: configMap.github_username || null,
        criteria: criteria.map(c => ({
          id: c.id,
          area: c.areaOfConcentration,
          subarea: c.subarea,
          description: c.description,
          prDetectable: c.prDetectable,
        })),
        evidence: evidence.map(e => ({
          id: e.id,
          type: e.type,
          title: e.title,
          description: e.description,
          timestamp: e.timestamp.toISOString(),
          prNumber: e.prNumber,
          prUrl: e.prUrl,
          repository: e.repository,
          slackLink: e.slackLink,
          confidence: e.confidence,
          metrics: {
            additions: e.additions,
            deletions: e.deletions,
            changedFiles: e.changedFiles,
            components: e.components,
          },
          criteria: e.criteria.map((ec: any) => ({
            id: ec.criterion.id,
            area: ec.criterion.areaOfConcentration,
            subarea: ec.criterion.subarea,
            description: ec.criterion.description,
            confidence: ec.confidence,
            explanation: ec.explanation,
          })),
        })),
        evidenceByCriterion,
        evidenceStats,
        goals: goals.map(g => ({
          id: g.id,
          title: g.title,
          description: g.description,
          category: g.category,
          status: g.status,
          progressPercent: g.progressPercent,
          targetDate: g.targetDate.toISOString(),
          completedDate: g.completedDate?.toISOString(),
          smart: {
            specific: g.specific,
            measurable: g.measurable,
            achievable: g.achievable,
            relevant: g.relevant,
            timeBound: g.timeBound,
          },
          milestones: g.milestones.map(m => ({
            id: m.id,
            title: m.title,
            status: m.status,
            targetDate: m.targetDate.toISOString(),
            completedDate: m.completedDate?.toISOString(),
          })),
          recentProgress: g.progressEntries.map(p => ({
            progressPercent: p.progressPercent,
            notes: p.notes,
            createdAt: p.createdAt.toISOString(),
          })),
        })),
        reviewDocuments: reviewDocuments.map(d => ({
          id: d.id,
          year: d.year,
          type: d.type,
          content: d.content,
          weight: d.weight,
        })),
        reviewAnalyses: reviewAnalyses.map(a => ({
          id: a.id,
          title: a.title,
          year: a.year,
          reviewType: a.reviewType,
          source: a.source,
          aiSummary: a.aiSummary,
          themes: JSON.parse(a.themes),
          strengths: JSON.parse(a.strengths),
          growthAreas: JSON.parse(a.growthAreas),
          achievements: JSON.parse(a.achievements),
          confidenceScore: a.confidenceScore,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to load interactive review data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load review data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
