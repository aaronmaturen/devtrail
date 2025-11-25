import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';

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
  parameters: z.object({
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

      // Criterion filter
      if (criterionId) {
        where.criteria = {
          some: {
            criterionId: criterionId,
          },
        };
      }

      const evidence = await prisma.evidenceEntry.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { timestamp: 'desc' },
        include: {
          criteria: {
            include: {
              criterion: true,
            },
          },
        },
      });

      return {
        success: true,
        count: evidence.length,
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
            components: e.components ? JSON.parse(e.components) : null,
          },
          criteria: e.criteria.map(ec => ({
            id: ec.criterion.id,
            area: ec.criterion.areaOfConcentration,
            subarea: ec.criterion.subarea,
            description: ec.criterion.description,
            confidence: ec.confidence,
            explanation: ec.explanation,
          })),
        })),
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
  parameters: z.object({
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
  parameters: z.object({
    startDate: z.string().optional().describe('Start date for analysis (ISO format)'),
    endDate: z.string().optional().describe('End date for analysis (ISO format)'),
    minConfidence: z.number().min(0).max(1).default(0.5).describe('Minimum confidence threshold (0-1)'),
  }),
  execute: async ({ startDate, endDate, minConfidence }) => {
    try {
      const where: any = {};

      // Date range filter
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      // Get all evidence with criteria
      const evidence = await prisma.evidenceEntry.findMany({
        where,
        include: {
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

      // Aggregate by criterion
      const criterionMap = new Map<number, {
        criterion: any;
        evidenceCount: number;
        avgConfidence: number;
        totalConfidence: number;
        examples: string[];
      }>();

      evidence.forEach(e => {
        e.criteria.forEach(ec => {
          const existing = criterionMap.get(ec.criterionId);
          if (existing) {
            existing.evidenceCount++;
            existing.totalConfidence += ec.confidence;
            existing.avgConfidence = existing.totalConfidence / existing.evidenceCount;
            if (existing.examples.length < 3) {
              existing.examples.push(e.title);
            }
          } else {
            criterionMap.set(ec.criterionId, {
              criterion: ec.criterion,
              evidenceCount: 1,
              totalConfidence: ec.confidence,
              avgConfidence: ec.confidence,
              examples: [e.title],
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
        totalEvidence: evidence.length,
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
  parameters: z.object({
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
  parameters: z.object({
    startDate: z.string().optional().describe('Start date for stats (ISO format)'),
    endDate: z.string().optional().describe('End date for stats (ISO format)'),
  }),
  execute: async ({ startDate, endDate }) => {
    try {
      const where: any = {};

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate);
        if (endDate) where.timestamp.lte = new Date(endDate);
      }

      const [evidence, criteria] = await Promise.all([
        prisma.evidenceEntry.findMany({
          where,
          include: {
            criteria: {
              include: {
                criterion: true,
              },
            },
          },
        }),
        prisma.criterion.findMany(),
      ]);

      // Count by type
      const byType = evidence.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Count by repository (PRs only)
      const byRepository = evidence
        .filter(e => e.repository)
        .reduce((acc, e) => {
          acc[e.repository!] = (acc[e.repository!] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      // Criteria coverage
      const criteriaMatches = evidence.flatMap(e => e.criteria);
      const coveredCriteriaIds = new Set(criteriaMatches.map(c => c.criterionId));

      // Group matches by area
      const byArea = criteriaMatches.reduce((acc, match) => {
        const area = match.criterion.areaOfConcentration;
        acc[area] = (acc[area] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        success: true,
        totalEvidence: evidence.length,
        byType,
        repositoryCount: Object.keys(byRepository).length,
        byRepository,
        totalCriteriaMatches: criteriaMatches.length,
        coveragePercent: Math.round((coveredCriteriaIds.size / criteria.length) * 100),
        coveredCriteria: coveredCriteriaIds.size,
        totalCriteria: criteria.length,
        matchesByArea: byArea,
        averageMatchesPerEvidence: evidence.length > 0
          ? (criteriaMatches.length / evidence.length).toFixed(2)
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
  parameters: z.object({
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
  parameters: z.object({
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
