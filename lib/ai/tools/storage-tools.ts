/**
 * Storage Tools
 *
 * Tools for saving data to the database:
 * - saveGitHubPR: Save a GitHub PR record
 * - saveJiraTicket: Save a Jira ticket record
 * - saveEvidence: Create an evidence entry
 * - linkPRToJira: Create a PR-Jira link
 * - saveCriteriaMatches: Save criteria match results
 * - updateEvidence: Update an existing evidence entry
 */

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';

/**
 * Tool: Save GitHub PR
 * Save a GitHub PR record to the database
 */
export const saveGitHubPRTool = tool({
  description:
    'Save a GitHub Pull Request to the database. Returns the created PR ID.',
  inputSchema: z.object({
    number: z.number().describe('PR number'),
    repo: z.string().describe('Repository in owner/repo format'),
    title: z.string().describe('PR title'),
    body: z.string().nullable().optional().describe('PR body/description'),
    url: z.string().describe('PR URL'),
    additions: z.number().describe('Lines added'),
    deletions: z.number().describe('Lines deleted'),
    changedFiles: z.number().describe('Number of files changed'),
    createdAt: z.string().describe('PR creation date (ISO format)'),
    mergedAt: z.string().nullable().optional().describe('PR merge date (ISO format)'),
    components: z.array(z.string()).default([]).describe('Code components touched'),
    files: z.array(z.string()).default([]).describe('Files changed'),
    userRole: z
      .enum(['AUTHOR', 'REVIEWER', 'ASSIGNEE'])
      .describe('User relationship to this PR'),
    reviewState: z
      .enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'PENDING'])
      .nullable()
      .optional()
      .describe('Review state if user is reviewer'),
    reviewBody: z.string().nullable().optional().describe('Review comment'),
    reviewedAt: z
      .string()
      .nullable()
      .optional()
      .describe('Review date (ISO format)'),
  }),
  execute: async ({
    number,
    repo,
    title,
    body,
    url,
    additions,
    deletions,
    changedFiles,
    createdAt,
    mergedAt,
    components,
    files,
    userRole,
    reviewState,
    reviewBody,
    reviewedAt,
  }) => {
    try {
      // Check if PR already exists
      const existing = await prisma.gitHubPR.findFirst({
        where: { repo, number, userRole },
      });

      if (existing) {
        // Update existing
        const updated = await prisma.gitHubPR.update({
          where: { id: existing.id },
          data: {
            title,
            body,
            url,
            additions,
            deletions,
            changedFiles,
            mergedAt: mergedAt ? new Date(mergedAt) : null,
            components: JSON.stringify(components),
            files: JSON.stringify(files),
            reviewState,
            reviewBody,
            reviewedAt: reviewedAt ? new Date(reviewedAt) : null,
          },
        });

        return {
          success: true,
          action: 'updated',
          id: updated.id,
        };
      }

      // Create new
      const pr = await prisma.gitHubPR.create({
        data: {
          number,
          repo,
          title,
          body,
          url,
          additions,
          deletions,
          changedFiles,
          createdAt: new Date(createdAt),
          mergedAt: mergedAt ? new Date(mergedAt) : null,
          components: JSON.stringify(components),
          files: JSON.stringify(files),
          userRole,
          reviewState,
          reviewBody,
          reviewedAt: reviewedAt ? new Date(reviewedAt) : null,
        },
      });

      return {
        success: true,
        action: 'created',
        id: pr.id,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save PR: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Save Jira Ticket
 * Save a Jira ticket record to the database
 */
export const saveJiraTicketTool = tool({
  description:
    'Save a Jira ticket to the database. Returns the created ticket ID.',
  inputSchema: z.object({
    key: z.string().describe('Jira ticket key (e.g., PRO-1234)'),
    summary: z.string().describe('Ticket summary'),
    description: z.string().nullable().optional().describe('Ticket description'),
    issueType: z.string().describe('Issue type (Story, Bug, Task, etc.)'),
    status: z.string().describe('Current status'),
    priority: z.string().nullable().optional().describe('Priority level'),
    storyPoints: z.number().nullable().optional().describe('Story points'),
    createdAt: z.string().describe('Creation date (ISO format)'),
    resolvedAt: z
      .string()
      .nullable()
      .optional()
      .describe('Resolution date (ISO format)'),
    sprint: z.string().nullable().optional().describe('Sprint name'),
    epicKey: z.string().nullable().optional().describe('Parent epic key'),
    epicSummary: z.string().nullable().optional().describe('Parent epic summary'),
    figmaLinks: z.array(z.string()).default([]).describe('Figma design links'),
    confluenceLinks: z
      .array(z.string())
      .default([])
      .describe('Confluence doc links'),
    otherLinks: z.array(z.string()).default([]).describe('Other notable links'),
    userRole: z.enum(['ASSIGNEE', 'REVIEWER']).describe('User relationship'),
    commentCount: z.number().default(0).describe('Number of comments'),
    commentSummary: z
      .string()
      .nullable()
      .optional()
      .describe('AI summary of comments'),
  }),
  execute: async ({
    key,
    summary,
    description,
    issueType,
    status,
    priority,
    storyPoints,
    createdAt,
    resolvedAt,
    sprint,
    epicKey,
    epicSummary,
    figmaLinks,
    confluenceLinks,
    otherLinks,
    userRole,
    commentCount,
    commentSummary,
  }) => {
    try {
      // Calculate duration days
      let durationDays: number | null = null;
      if (resolvedAt && createdAt) {
        const created = new Date(createdAt);
        const resolved = new Date(resolvedAt);
        durationDays = Math.round(
          (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      // Check if ticket already exists
      const existing = await prisma.jiraTicket.findUnique({
        where: { key },
      });

      if (existing) {
        // Update existing
        const updated = await prisma.jiraTicket.update({
          where: { key },
          data: {
            summary,
            description,
            issueType,
            status,
            priority,
            storyPoints,
            resolvedAt: resolvedAt ? new Date(resolvedAt) : null,
            durationDays,
            sprint,
            epicKey,
            epicSummary,
            figmaLinks: JSON.stringify(figmaLinks),
            confluenceLinks: JSON.stringify(confluenceLinks),
            otherLinks: JSON.stringify(otherLinks),
            userRole,
            commentCount,
            commentSummary,
          },
        });

        return {
          success: true,
          action: 'updated',
          id: updated.id,
        };
      }

      // Create new
      const ticket = await prisma.jiraTicket.create({
        data: {
          key,
          summary,
          description,
          issueType,
          status,
          priority,
          storyPoints,
          createdAt: new Date(createdAt),
          resolvedAt: resolvedAt ? new Date(resolvedAt) : null,
          durationDays,
          sprint,
          epicKey,
          epicSummary,
          figmaLinks: JSON.stringify(figmaLinks),
          confluenceLinks: JSON.stringify(confluenceLinks),
          otherLinks: JSON.stringify(otherLinks),
          userRole,
          commentCount,
          commentSummary,
        },
      });

      return {
        success: true,
        action: 'created',
        id: ticket.id,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save Jira ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Save Evidence
 * Create an evidence entry linking to source data
 */
export const saveEvidenceTool = tool({
  description:
    'Create an evidence entry in the database, linking to source data (PR, Jira, Slack).',
  inputSchema: z.object({
    type: z
      .enum([
        'PR_AUTHORED',
        'PR_REVIEWED',
        'GITHUB_PR',
        'GITHUB_ISSUE',
        'JIRA_OWNED',
        'JIRA_REVIEWED',
        'JIRA',
        'ISSUE_CREATED',
        'SLACK',
        'MANUAL',
      ])
      .describe('Type of evidence. For GitHub PRs use GITHUB_PR, for Jira tickets use JIRA_OWNED or JIRA.'),
    summary: z.string().describe('2-3 sentence summary of the work'),
    category: z
      .enum(['feature', 'bug', 'refactor', 'docs', 'devex', 'recognition', 'help'])
      .describe('Category of work'),
    scope: z.enum(['small', 'medium', 'large']).describe('Scope/impact of work'),
    occurredAt: z.string().describe('When the work occurred (ISO format)'),
    githubPrId: z.string().nullable().optional().describe('Link to GitHubPR record'),
    githubIssueId: z
      .string()
      .nullable()
      .optional()
      .describe('Link to GitHubIssue record'),
    jiraTicketId: z
      .string()
      .nullable()
      .optional()
      .describe('Link to JiraTicket record'),
    slackMessageId: z
      .string()
      .nullable()
      .optional()
      .describe('Link to SlackMessage record'),
    manualTitle: z
      .string()
      .nullable()
      .optional()
      .describe('Title for manual evidence'),
    manualContent: z
      .string()
      .nullable()
      .optional()
      .describe('Content for manual evidence'),
  }),
  execute: async ({
    type,
    summary,
    category,
    scope,
    occurredAt,
    githubPrId,
    githubIssueId,
    jiraTicketId,
    slackMessageId,
    manualTitle,
    manualContent,
  }) => {
    try {
      const evidence = await prisma.evidence.create({
        data: {
          type,
          summary,
          category,
          scope,
          occurredAt: new Date(occurredAt),
          githubPrId,
          githubIssueId,
          jiraTicketId,
          slackMessageId,
          manualTitle,
          manualContent,
        },
      });

      return {
        success: true,
        id: evidence.id,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save evidence: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Link PR to Jira
 * Create a many-to-many link between PR and Jira ticket
 */
export const linkPRToJiraTool = tool({
  description: 'Create a link between a GitHub PR and a Jira ticket.',
  inputSchema: z.object({
    prId: z.string().describe('GitHubPR record ID'),
    jiraKey: z.string().describe('Jira ticket key'),
  }),
  execute: async ({ prId, jiraKey }) => {
    try {
      // Check if Jira ticket exists
      const jiraTicket = await prisma.jiraTicket.findUnique({
        where: { key: jiraKey },
      });

      if (!jiraTicket) {
        return {
          success: false,
          error: `Jira ticket ${jiraKey} not found in database. Save the ticket first.`,
        };
      }

      // Check if link already exists
      const existing = await prisma.pRJiraLink.findFirst({
        where: { prId, jiraKey },
      });

      if (existing) {
        return {
          success: true,
          action: 'exists',
          id: existing.id,
        };
      }

      // Create link
      const link = await prisma.pRJiraLink.create({
        data: {
          prId,
          jiraKey,
        },
      });

      return {
        success: true,
        action: 'created',
        id: link.id,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create link: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Save Criteria Matches
 * Save the results of AI criteria matching
 */
export const saveCriteriaMatchesTool = tool({
  description:
    'Save criteria match results for an evidence entry. Links evidence to performance criteria with confidence scores.',
  inputSchema: z.object({
    evidenceId: z.string().describe('Evidence record ID'),
    matches: z
      .array(
        z.object({
          criterionId: z.number().describe('Criterion ID'),
          confidence: z
            .number()
            .min(0)
            .max(1)
            .describe('Confidence score (0-1)'),
          explanation: z.string().describe('Explanation of the match'),
        })
      )
      .describe('Array of criteria matches'),
  }),
  execute: async ({ evidenceId, matches }) => {
    try {
      // Delete existing matches for this evidence
      await prisma.evidenceCriterion.deleteMany({
        where: { evidenceId },
      });

      // Create new matches
      const created = await prisma.evidenceCriterion.createMany({
        data: matches.map((m) => ({
          evidenceId,
          criterionId: m.criterionId,
          confidence: m.confidence,
          explanation: m.explanation,
        })),
      });

      return {
        success: true,
        count: created.count,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save criteria matches: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Update Evidence
 * Update an existing evidence entry
 */
export const updateEvidenceTool = tool({
  description: 'Update an existing evidence entry with new information.',
  inputSchema: z.object({
    id: z.string().describe('Evidence ID to update'),
    summary: z.string().optional().describe('Updated summary'),
    category: z
      .enum(['feature', 'bug', 'refactor', 'docs', 'devex', 'recognition', 'help'])
      .optional()
      .describe('Updated category'),
    scope: z.enum(['small', 'medium', 'large']).optional().describe('Updated scope'),
    jiraTicketId: z
      .string()
      .nullable()
      .optional()
      .describe('Link to JiraTicket record'),
  }),
  execute: async ({ id, summary, category, scope, jiraTicketId }) => {
    try {
      const updateData: any = {};

      if (summary !== undefined) updateData.summary = summary;
      if (category !== undefined) updateData.category = category;
      if (scope !== undefined) updateData.scope = scope;
      if (jiraTicketId !== undefined) updateData.jiraTicketId = jiraTicketId;

      const updated = await prisma.evidence.update({
        where: { id },
        data: updateData,
      });

      return {
        success: true,
        id: updated.id,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update evidence: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export const storageTools = {
  saveGitHubPR: saveGitHubPRTool,
  saveJiraTicket: saveJiraTicketTool,
  saveEvidence: saveEvidenceTool,
  linkPRToJira: linkPRToJiraTool,
  saveCriteriaMatches: saveCriteriaMatchesTool,
  updateEvidence: updateEvidenceTool,
};
