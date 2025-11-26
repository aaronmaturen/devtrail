import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';

// Import sync tools for re-export
import {
  searchUserPRsTool,
  searchUserIssuesTool,
  fetchPRDetailsTool,
  getExistingGitHubPRTool,
  githubTools,
} from './github-tools';

import {
  searchUserJiraTicketsTool,
  fetchJiraTicketTool,
  fetchJiraEpicTool,
  getExistingJiraTicketTool,
  jiraTools,
} from './jira-tools';

import {
  extractJiraKeyTool,
  extractLinksTool,
  extractComponentsTool,
  parsePRTitleTool,
  extractionTools,
} from './extraction-tools';

import {
  saveGitHubPRTool,
  saveJiraTicketTool,
  saveEvidenceTool,
  linkPRToJiraTool,
  saveCriteriaMatchesTool,
  updateEvidenceTool,
  storageTools,
} from './storage-tools';

import {
  summarizeTool,
  categorizeTool,
  estimateScopeTool,
  matchCriteriaTool,
  analysisTools,
} from './analysis-tools';

/**
 * AI Tools for DevTrail Agents
 *
 * These tools allow AI agents to interact with the database to:
 * - Fetch evidence entries (PRs, Slack, Reviews, Manual)
 * - Get performance criteria
 * - Retrieve user goals
 * - Analyze evidence against criteria
 * - Get statistics and insights
 */

/**
 * Tool: Get Evidence Entries
 * Fetch evidence entries with optional filters
 */
export const getEvidenceTool = tool({
  description: 'Retrieve evidence entries from the database. Can filter by type (PR, SLACK, REVIEW, MANUAL), date range, repository, or criteria.',
  inputSchema: z.object({
    type: z.enum(['PR', 'SLACK', 'REVIEW', 'MANUAL']).optional().describe('Filter by evidence type'),
    startDate: z.string().optional().describe('Start date for filtering evidence (ISO format)'),
    endDate: z.string().optional().describe('End date for filtering evidence (ISO format)'),
    repository: z.string().optional().describe('Filter by specific repository (for PRs)'),
    criterionId: z.number().optional().describe('Filter by specific criterion ID'),
    limit: z.number().optional().default(50).describe('Maximum number of entries to return'),
    offset: z.number().optional().default(0).describe('Offset for pagination'),
  }),
  execute: async ({ type, startDate, endDate, repository, criterionId, limit, offset }) => {
    try {
      const where: any = {};

      // Type filter
      if (type) {
        where.type = type;
      }

      // Date range filter
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      // Repository filter (for PRs)
      if (repository) {
        where.repository = repository;
      }

      // Handle criterion filter via EvidenceCriterion
      if (criterionId) {
        const matchingEvidence = await prisma.evidenceCriterion.findMany({
          where: { criterionId },
          select: { evidenceId: true },
        });
        where.id = { in: matchingEvidence.map(e => e.evidenceId) };
      }

      // Map display types to internal types
      const displayToInternalTypes: Record<string, string[]> = {
        PR: ['PR_AUTHORED', 'PR_REVIEWED', 'ISSUE_CREATED'],
        JIRA: ['JIRA_OWNED', 'JIRA_REVIEWED'],
        SLACK: ['SLACK'],
        MANUAL: ['MANUAL'],
        REVIEW: ['MANUAL'],
      };

      // Convert type filter to internal types
      if (where.type && displayToInternalTypes[where.type]) {
        where.type = { in: displayToInternalTypes[where.type] };
      }

      // Convert timestamp to occurredAt
      if (where.timestamp) {
        where.occurredAt = where.timestamp;
        delete where.timestamp;
      }

      const evidenceEntries = await prisma.evidence.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { occurredAt: 'desc' },
        include: {
          githubPr: true,
          jiraTicket: true,
          slackMessage: true,
          criteria: {
            include: {
              criterion: true,
            },
          },
        },
      });

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

      return {
        success: true,
        count: evidenceEntries.length,
        evidence: evidenceEntries.map(e => {
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
            description = e.jiraTicket.description || e.summary;
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
            type: typeDisplayMap[e.type] || 'MANUAL',
            internalType: e.type,
            title,
            description,
            timestamp: e.occurredAt.toISOString(),
            prNumber,
            prUrl,
            repository,
            slackLink,
            confidence: 1.0, // Default confidence
            metrics: {
              additions,
              deletions,
              changedFiles,
              components,
            },
            criteria: e.criteria.map(ec => ({
              id: ec.criterion.id,
              area: ec.criterion.areaOfConcentration,
              subarea: ec.criterion.subarea,
              description: ec.criterion.description,
              confidence: ec.confidence,
              explanation: ec.explanation,
            })),
          };
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve evidence: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Get Performance Criteria
 * Fetch all performance criteria or filter by area
 */
export const getCriteriaTool = tool({
  description: 'Retrieve performance review criteria from the database. These are the standards used to evaluate work performance.',
  inputSchema: z.object({
    areaOfConcentration: z.string().optional().describe('Filter by area of concentration (e.g., "Engineering Experience", "Delivery", "Communication")'),
    subarea: z.string().optional().describe('Filter by subarea (e.g., "Quality & testing", "Software design & architecture")'),
    prDetectable: z.boolean().optional().describe('Only show PR-detectable criteria'),
  }),
  execute: async ({ areaOfConcentration, subarea, prDetectable }) => {
    try {
      const where: any = {};

      if (areaOfConcentration) {
        where.areaOfConcentration = areaOfConcentration;
      }

      if (subarea) {
        where.subarea = subarea;
      }

      if (prDetectable !== undefined) {
        where.prDetectable = prDetectable;
      }

      const criteria = await prisma.criterion.findMany({
        where,
        orderBy: [
          { areaOfConcentration: 'asc' },
          { id: 'asc' },
        ],
      });

      // Group by area of concentration
      const grouped = criteria.reduce((acc, criterion) => {
        const area = criterion.areaOfConcentration;
        if (!acc[area]) {
          acc[area] = [];
        }
        acc[area].push({
          id: criterion.id,
          subarea: criterion.subarea,
          description: criterion.description,
          prDetectable: criterion.prDetectable,
        });
        return acc;
      }, {} as Record<string, any[]>);

      return {
        success: true,
        count: criteria.length,
        criteria: grouped,
        areas: Object.keys(grouped),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve criteria: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Analyze Evidence Against Criteria
 * Count and summarize evidence matches for each criterion
 */
export const analyzeEvidenceTool = tool({
  description: 'Analyze how evidence maps to performance criteria with match counts, confidence scores, and examples.',
  inputSchema: z.object({
    startDate: z.string().optional().describe('Start date for analysis (ISO format)'),
    endDate: z.string().optional().describe('End date for analysis (ISO format)'),
    minConfidence: z.number().min(0).max(1).default(0.5).describe('Minimum confidence threshold (0-1)'),
  }),
  execute: async ({ startDate, endDate, minConfidence }) => {
    try {
      const where: any = {};

      // Date range filter
      if (startDate || endDate) {
        where.occurredAt = {};
        if (startDate) where.occurredAt.gte = new Date(startDate);
        if (endDate) where.occurredAt.lte = new Date(endDate);
      }

      // Get all evidence entries with criteria
      const evidenceWithCriteria = await prisma.evidence.findMany({
        where,
        include: {
          githubPr: true,
          jiraTicket: true,
          slackMessage: true,
          criteria: {
            where: {
              confidence: {
                gte: minConfidence,
              },
            },
            include: {
              criterion: true,
            },
          },
        },
      });

      // Create title map
      const titleMap = new Map(evidenceWithCriteria.map(e => {
        let title = e.summary;
        if (e.githubPr) title = e.githubPr.title;
        else if (e.jiraTicket) title = `${e.jiraTicket.key}: ${e.jiraTicket.summary}`;
        else if (e.slackMessage) title = e.slackMessage.content.substring(0, 100);
        else if (e.manualTitle) title = e.manualTitle;
        return [e.id, title];
      }));

      // Aggregate by criterion
      const criterionMap = new Map<number, {
        criterion: any;
        evidenceCount: number;
        avgConfidence: number;
        totalConfidence: number;
        examples: string[];
      }>();

      evidenceWithCriteria.forEach(e => {
        e.criteria.forEach(ec => {
          const existing = criterionMap.get(ec.criterionId);
          const title = titleMap.get(e.id) || 'Unknown';
          if (existing) {
            existing.evidenceCount++;
            existing.totalConfidence += ec.confidence;
            existing.avgConfidence = existing.totalConfidence / existing.evidenceCount;
            if (existing.examples.length < 3) {
              existing.examples.push(title);
            }
          } else {
            criterionMap.set(ec.criterionId, {
              criterion: ec.criterion,
              evidenceCount: 1,
              totalConfidence: ec.confidence,
              avgConfidence: ec.confidence,
              examples: [title],
            });
          }
        });
      });

      // Convert to array and sort by evidence count
      const analysis = Array.from(criterionMap.values())
        .sort((a, b) => b.evidenceCount - a.evidenceCount)
        .map(item => ({
          criterionId: item.criterion.id,
          area: item.criterion.areaOfConcentration,
          subarea: item.criterion.subarea,
          description: item.criterion.description,
          evidenceCount: item.evidenceCount,
          avgConfidence: Math.round(item.avgConfidence * 100) / 100,
          examples: item.examples,
        }));

      // Group by area
      const byArea = analysis.reduce((acc, item) => {
        if (!acc[item.area]) {
          acc[item.area] = {
            totalEvidence: 0,
            criteria: [],
          };
        }
        acc[item.area].totalEvidence += item.evidenceCount;
        acc[item.area].criteria.push(item);
        return acc;
      }, {} as Record<string, any>);

      return {
        success: true,
        totalEvidence: evidenceWithCriteria.length,
        totalCriteria: analysis.length,
        analysis,
        byArea,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to analyze evidence: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Get Goals
 * Fetch user goals with optional filters
 */
export const getGoalsTool = tool({
  description: 'Retrieve career goals from the database, including SMART goals, progress tracking, and milestones.',
  inputSchema: z.object({
    status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED', 'ALL']).default('ACTIVE').describe('Filter by goal status'),
    category: z.string().optional().describe('Filter by category (e.g., "DEVELOPMENT", "LEADERSHIP", "TECHNICAL", "COMMUNICATION")'),
    includeProgress: z.boolean().default(true).describe('Include progress entries'),
    includeMilestones: z.boolean().default(true).describe('Include milestones'),
  }),
  execute: async ({ status, category, includeProgress, includeMilestones }) => {
    try {
      const where: any = {};

      if (status !== 'ALL') {
        where.status = status;
      }

      if (category) {
        where.category = category;
      }

      const goals = await prisma.goal.findMany({
        where,
        include: {
          milestones: includeMilestones,
          progressEntries: includeProgress ? {
            orderBy: {
              createdAt: 'desc',
            },
            take: 5, // Latest 5 progress entries
          } : false,
        },
        orderBy: [
          { priority: 'asc' },
          { targetDate: 'asc' },
        ],
      });

      return {
        success: true,
        count: goals.length,
        goals: goals.map(g => ({
          id: g.id,
          title: g.title,
          description: g.description,
          category: g.category,
          status: g.status,
          priority: g.priority,
          progressPercent: g.progressPercent,
          startDate: g.startDate.toISOString(),
          targetDate: g.targetDate.toISOString(),
          completedDate: g.completedDate?.toISOString(),
          smart: {
            specific: g.specific,
            measurable: g.measurable,
            achievable: g.achievable,
            relevant: g.relevant,
            timeBound: g.timeBound,
          },
          milestones: includeMilestones ? g.milestones.map(m => ({
            id: m.id,
            title: m.title,
            description: m.description,
            status: m.status,
            targetDate: m.targetDate.toISOString(),
            completedDate: m.completedDate?.toISOString(),
          })) : undefined,
          recentProgress: includeProgress ? g.progressEntries.map(p => ({
            id: p.id,
            progressPercent: p.progressPercent,
            notes: p.notes,
            aiSummary: p.aiSummary,
            createdAt: p.createdAt.toISOString(),
          })) : undefined,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve goals: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Get Evidence Statistics
 * Get summary statistics about evidence
 */
export const getEvidenceStatsTool = tool({
  description: 'Get summary statistics about evidence, including counts by type, repository analysis, and criteria coverage.',
  inputSchema: z.object({
    startDate: z.string().optional().describe('Start date for stats (ISO format)'),
    endDate: z.string().optional().describe('End date for stats (ISO format)'),
  }),
  execute: async ({ startDate, endDate }) => {
    try {
      const where: any = {};

      if (startDate || endDate) {
        where.occurredAt = {};
        if (startDate) where.occurredAt.gte = new Date(startDate);
        if (endDate) where.occurredAt.lte = new Date(endDate);
      }

      // Get evidence entries with all related data
      const evidenceWithCriteria = await prisma.evidence.findMany({
        where,
        include: {
          githubPr: true,
          criteria: {
            include: {
              criterion: true,
            },
          },
        },
      });
      const criteria = await prisma.criterion.findMany();

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

      // Count by display type
      const byType = evidenceWithCriteria.reduce((acc, e) => {
        const displayType = typeDisplayMap[e.type] || 'MANUAL';
        acc[displayType] = (acc[displayType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Count by repository (PRs only)
      const byRepository = evidenceWithCriteria
        .filter(e => e.githubPr?.repo)
        .reduce((acc, e) => {
          const repo = e.githubPr!.repo;
          acc[repo] = (acc[repo] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      // Criteria coverage
      const criteriaMatches = evidenceWithCriteria.flatMap(e => e.criteria);
      const coveredCriteriaIds = new Set(criteriaMatches.map(c => c.criterionId));

      // Group matches by area
      const byArea = criteriaMatches.reduce((acc, match) => {
        const area = match.criterion.areaOfConcentration;
        acc[area] = (acc[area] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        success: true,
        totalEvidence: evidenceWithCriteria.length,
        byType,
        repositoryCount: Object.keys(byRepository).length,
        byRepository,
        totalCriteriaMatches: criteriaMatches.length,
        coveragePercent: Math.round((coveredCriteriaIds.size / criteria.length) * 100),
        coveredCriteria: coveredCriteriaIds.size,
        totalCriteria: criteria.length,
        matchesByArea: byArea,
        averageMatchesPerEvidence: evidenceWithCriteria.length > 0
          ? (criteriaMatches.length / evidenceWithCriteria.length).toFixed(2)
          : '0',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Get Review Documents
 * Fetch performance review documents
 */
export const getReviewDocumentsTool = tool({
  description: 'Fetch performance review documents by year or type for context in performance analysis.',
  inputSchema: z.object({
    year: z.string().optional().describe('Filter by year (e.g., "2024" or "2024-mid")'),
    type: z.enum(['EMPLOYEE', 'MANAGER', 'ALL']).default('ALL').describe('Filter by review type'),
  }),
  execute: async ({ year, type }) => {
    try {
      const where: any = {};

      if (year) {
        where.year = year;
      }

      if (type !== 'ALL') {
        where.type = type;
      }

      const documents = await prisma.reviewDocument.findMany({
        where,
        orderBy: {
          year: 'desc',
        },
      });

      return {
        success: true,
        count: documents.length,
        documents: documents.map(d => ({
          id: d.id,
          year: d.year,
          type: d.type,
          weight: d.weight,
          contentLength: d.content.length,
          contentPreview: d.content.substring(0, 500) + '...',
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve review documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Get Review Analyses
 * Fetch AI-analyzed performance reviews with extracted insights
 */
export const getReviewAnalysesTool = tool({
  description: 'Fetch AI-analyzed performance reviews with extracted themes, strengths, growth areas, and achievements. This provides personalized context from past performance reviews.',
  inputSchema: z.object({
    year: z.string().optional().describe('Filter by year (e.g., "2024" or "2024-mid")'),
    reviewType: z.string().optional().describe('Filter by review type (EMPLOYEE, MANAGER, PEER, SELF)'),
    limit: z.number().optional().default(5).describe('Maximum number of analyses to return'),
  }),
  execute: async ({ year, reviewType, limit }) => {
    try {
      const where: any = {};

      if (year) {
        where.year = year;
      }

      if (reviewType) {
        where.reviewType = reviewType;
      }

      const analyses = await prisma.reviewAnalysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Aggregate insights
      const allStrengths = new Set<string>();
      const allGrowthAreas = new Set<string>();
      const themeMap = new Map<string, number>();

      const parsedAnalyses = analyses.map(a => {
        const themes = JSON.parse(a.themes) as string[];
        const strengths = JSON.parse(a.strengths) as string[];
        const growthAreas = JSON.parse(a.growthAreas) as string[];
        const achievements = JSON.parse(a.achievements) as string[];

        // Collect for aggregation
        strengths.forEach(s => allStrengths.add(s));
        growthAreas.forEach(g => allGrowthAreas.add(g));
        themes.forEach(t => {
          const normalized = t.toLowerCase();
          themeMap.set(normalized, (themeMap.get(normalized) || 0) + 1);
        });

        return {
          id: a.id,
          title: a.title,
          year: a.year,
          reviewType: a.reviewType,
          source: a.source,
          summary: a.aiSummary,
          themes,
          strengths,
          growthAreas,
          achievements,
          confidenceScore: a.confidenceScore,
          createdAt: a.createdAt.toISOString(),
        };
      });

      // Get top themes
      const topThemes = Array.from(themeMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme, count]) => ({ theme, count }));

      return {
        success: true,
        count: parsedAnalyses.length,
        analyses: parsedAnalyses,
        aggregatedInsights: {
          totalStrengths: allStrengths.size,
          totalGrowthAreas: allGrowthAreas.size,
          commonThemes: topThemes,
          allStrengths: Array.from(allStrengths),
          allGrowthAreas: Array.from(allGrowthAreas),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve review analyses: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Export all tools as a collection for easy use with AI SDK
 */
export const devtrailTools = {
  getEvidence: getEvidenceTool,
  getCriteria: getCriteriaTool,
  analyzeEvidence: analyzeEvidenceTool,
  getGoals: getGoalsTool,
  getEvidenceStats: getEvidenceStatsTool,
  getReviewDocuments: getReviewDocumentsTool,
  getReviewAnalyses: getReviewAnalysesTool,
};

export type DevTrailTools = typeof devtrailTools;

// ============================================================================
// Sync Tools (Phase 2+ of Sync Architecture)
// ============================================================================

// Re-export all sync tools
export {
  // GitHub
  searchUserPRsTool,
  searchUserIssuesTool,
  fetchPRDetailsTool,
  getExistingGitHubPRTool,
  githubTools,
  // Jira
  searchUserJiraTicketsTool,
  fetchJiraTicketTool,
  fetchJiraEpicTool,
  getExistingJiraTicketTool,
  jiraTools,
  // Extraction
  extractJiraKeyTool,
  extractLinksTool,
  extractComponentsTool,
  parsePRTitleTool,
  extractionTools,
  // Storage
  saveGitHubPRTool,
  saveJiraTicketTool,
  saveEvidenceTool,
  linkPRToJiraTool,
  saveCriteriaMatchesTool,
  updateEvidenceTool,
  storageTools,
  // Analysis
  summarizeTool,
  categorizeTool,
  estimateScopeTool,
  matchCriteriaTool,
  analysisTools,
};

/**
 * All sync tools combined for use with sync agents
 */
export const syncTools = {
  // GitHub
  searchUserPRs: searchUserPRsTool,
  searchUserIssues: searchUserIssuesTool,
  fetchPRDetails: fetchPRDetailsTool,
  getExistingGitHubPR: getExistingGitHubPRTool,

  // Jira
  searchUserJiraTickets: searchUserJiraTicketsTool,
  fetchJiraTicket: fetchJiraTicketTool,
  fetchJiraEpic: fetchJiraEpicTool,
  getExistingJiraTicket: getExistingJiraTicketTool,

  // Extraction
  extractJiraKey: extractJiraKeyTool,
  extractLinks: extractLinksTool,
  extractComponents: extractComponentsTool,
  parsePRTitle: parsePRTitleTool,

  // Storage
  saveGitHubPR: saveGitHubPRTool,
  saveJiraTicket: saveJiraTicketTool,
  saveEvidence: saveEvidenceTool,
  linkPRToJira: linkPRToJiraTool,
  saveCriteriaMatches: saveCriteriaMatchesTool,
  updateEvidence: updateEvidenceTool,

  // Analysis
  summarize: summarizeTool,
  categorize: categorizeTool,
  estimateScope: estimateScopeTool,
  matchCriteria: matchCriteriaTool,
};

export type SyncTools = typeof syncTools;

