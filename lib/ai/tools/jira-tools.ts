/**
 * Jira Discovery and Enrichment Tools
 *
 * Tools for AI agents to discover and fetch Jira data:
 * - searchUserJiraTickets: Find tickets by user role (assignee, reviewer)
 * - fetchJiraTicket: Get full ticket details with comments
 * - fetchJiraEpic: Get epic with child tickets
 */

import { tool } from 'ai';
import { z } from 'zod';
import { Version3Client } from 'jira.js';
import { prisma } from '@/lib/db/prisma';
import { adfToText } from '@/lib/utils/adf-to-text';

// Get Jira client from config
async function getJiraClient(): Promise<Version3Client> {
  const [hostConfig, emailConfig, tokenConfig] = await Promise.all([
    prisma.config.findUnique({ where: { key: 'jira_host' } }),
    prisma.config.findUnique({ where: { key: 'jira_email' } }),
    prisma.config.findUnique({ where: { key: 'jira_api_token' } }),
  ]);

  if (!hostConfig?.value || !emailConfig?.value || !tokenConfig?.value) {
    throw new Error('Jira credentials not configured');
  }

  const host = JSON.parse(hostConfig.value);
  const email = JSON.parse(emailConfig.value);
  const apiToken = JSON.parse(tokenConfig.value);

  return new Version3Client({
    host: `https://${host}`,
    authentication: {
      basic: {
        email,
        apiToken,
      },
    },
  });
}

// Get story points field ID from config (defaults to common field ID)
async function getStoryPointsFieldId(): Promise<string> {
  const config = await prisma.config.findUnique({
    where: { key: 'jira_story_points_field' },
  });

  if (config?.value) {
    return JSON.parse(config.value);
  }

  // Default to common Jira field IDs - customfield_10028 is common for Story Points
  return 'customfield_10028';
}

// Get Jira email from config
async function getJiraEmail(): Promise<string> {
  const emailConfig = await prisma.config.findUnique({
    where: { key: 'jira_email' },
  });

  if (!emailConfig?.value) {
    throw new Error('Jira email not configured');
  }

  return JSON.parse(emailConfig.value);
}

/**
 * Tool: Search User Jira Tickets
 * Find Jira tickets where user is assignee or reviewer
 */
export const searchUserJiraTicketsTool = tool({
  description:
    'Search for Jira tickets where the user is assignee or reviewer. Returns a list of tickets with basic metadata. If email is not provided, it will be auto-detected from configuration.',
  inputSchema: z.object({
    role: z.enum(['assignee', 'reviewer']).describe('The user role to search for'),
    email: z.string().optional().describe('User email to search for (auto-detected if not provided)'),
    startDate: z
      .string()
      .optional()
      .describe('Start date for filtering (ISO format or YYYY-MM-DD)'),
    endDate: z
      .string()
      .optional()
      .describe('End date for filtering (ISO format or YYYY-MM-DD)'),
    project: z.string().optional().describe('Filter by Jira project key (e.g., PRO)'),
    status: z
      .string()
      .optional()
      .describe('Filter by status (e.g., "Done", "In Progress")'),
    issueType: z
      .string()
      .optional()
      .describe('Filter by issue type (e.g., "Story", "Bug", "Task")'),
    limit: z.number().optional().default(500).describe('Maximum tickets to return'),
  }),
  execute: async ({
    role,
    email: providedEmail,
    startDate,
    endDate,
    project,
    status,
    issueType,
    limit,
  }) => {
    try {
      const jira = await getJiraClient();
      const storyPointsField = await getStoryPointsFieldId();

      // Auto-detect email if not provided
      const email = providedEmail || await getJiraEmail();

      // Build JQL query
      const jqlParts: string[] = [];

      // Role filter
      if (role === 'assignee') {
        jqlParts.push(`assignee = "${email}"`);
      } else if (role === 'reviewer') {
        // Assuming there's a custom field for reviewer - adjust field name as needed
        jqlParts.push(`"Reviewer[User Picker (single user)]" = "${email}"`);
      }

      // Date range
      if (startDate) {
        const start = startDate.split('T')[0];
        jqlParts.push(`updated >= "${start}"`);
      }
      if (endDate) {
        const end = endDate.split('T')[0];
        jqlParts.push(`updated <= "${end}"`);
      }

      // Project filter
      if (project) {
        jqlParts.push(`project = ${project}`);
      }

      // Status filter
      if (status) {
        jqlParts.push(`status = "${status}"`);
      }

      // Issue type filter
      if (issueType) {
        jqlParts.push(`issuetype = "${issueType}"`);
      }

      const jql = jqlParts.join(' AND ') + ' ORDER BY updated DESC';

      const tickets: Array<{
        key: string;
        summary: string;
        status: string;
        issueType: string;
        priority: string | null;
        storyPoints: number | null;
        createdAt: string;
        updatedAt: string;
        resolvedAt: string | null;
      }> = [];

      let nextPageToken: string | undefined;

      while (tickets.length < limit) {
        const response =
          await jira.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
            jql,
            maxResults: Math.min(limit - tickets.length, 50),
            fields: [
              'summary',
              'status',
              'issuetype',
              'priority',
              'created',
              'updated',
              'resolutiondate',
              storyPointsField,
            ],
            nextPageToken,
          });

        if (!response.issues || response.issues.length === 0) break;

        for (const issue of response.issues) {
          tickets.push({
            key: issue.key || '',
            summary: issue.fields?.summary || '',
            status: issue.fields?.status?.name || '',
            issueType: issue.fields?.issuetype?.name || '',
            priority: issue.fields?.priority?.name || null,
            storyPoints: (issue.fields as Record<string, unknown>)?.[storyPointsField] as number | null || null,
            createdAt: issue.fields?.created || '',
            updatedAt: issue.fields?.updated || '',
            resolvedAt: issue.fields?.resolutiondate || null,
          });
        }

        if (!response.nextPageToken) break;
        nextPageToken = response.nextPageToken;
      }

      return {
        success: true,
        email,
        count: tickets.length,
        jql,
        tickets,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search Jira tickets: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Fetch Jira Ticket Details
 * Get full ticket details including description and comments
 */
export const fetchJiraTicketTool = tool({
  description:
    'Fetch full details for a specific Jira ticket including description, comments, story points, and linked issues.',
  inputSchema: z.object({
    key: z.string().describe('Jira ticket key (e.g., PRO-1234)'),
    includeComments: z
      .boolean()
      .default(true)
      .describe('Include ticket comments'),
  }),
  execute: async ({ key, includeComments }) => {
    try {
      const jira = await getJiraClient();
      const storyPointsField = await getStoryPointsFieldId();

      // Fetch issue details
      const issue = await jira.issues.getIssue({
        issueIdOrKey: key,
        fields: [
          'summary',
          'description',
          'status',
          'issuetype',
          'priority',
          'assignee',
          'reporter',
          'created',
          'updated',
          'resolutiondate',
          storyPointsField,
          'customfield_10020', // Sprint - adjust as needed
          'parent', // Epic link
          'comment',
          'issuelinks',
        ],
      });

      // Extract comments if requested
      let comments: Array<{
        author: string;
        body: string;
        created: string;
      }> = [];

      if (includeComments && issue.fields?.comment?.comments) {
        comments = issue.fields.comment.comments.map((c: any) => ({
          author: c.author?.displayName || 'Unknown',
          body: adfToText(c.body),
          created: c.created || '',
        }));
      }

      // Convert description from ADF to plain text
      const description = issue.fields?.description || '';
      const descriptionText = adfToText(description);

      // Calculate duration if resolved
      let durationDays: number | null = null;
      if (issue.fields?.resolutiondate && issue.fields?.created) {
        const created = new Date(issue.fields.created);
        const resolved = new Date(issue.fields.resolutiondate);
        durationDays = Math.round(
          (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      // Get epic info if available
      let epicKey: string | null = null;
      let epicSummary: string | null = null;
      if (issue.fields?.parent) {
        epicKey = issue.fields.parent.key;
        epicSummary = issue.fields.parent.fields?.summary || null;
      }

      // Get sprint info
      let sprint: string | null = null;
      const sprintField = issue.fields?.customfield_10020;
      if (Array.isArray(sprintField) && sprintField.length > 0) {
        const latestSprint = sprintField[sprintField.length - 1];
        sprint =
          typeof latestSprint === 'string' ? latestSprint : latestSprint?.name;
      }

      // Get linked issues
      const linkedIssues =
        issue.fields?.issuelinks?.map((link: any) => ({
          type: link.type?.name,
          inward: link.inwardIssue?.key,
          outward: link.outwardIssue?.key,
        })) || [];

      return {
        success: true,
        ticket: {
          key: issue.key,
          summary: issue.fields?.summary,
          description: descriptionText,
          status: issue.fields?.status?.name,
          issueType: issue.fields?.issuetype?.name,
          priority: issue.fields?.priority?.name,
          assignee: issue.fields?.assignee?.displayName,
          reporter: issue.fields?.reporter?.displayName,

          // Metrics
          storyPoints: (issue.fields as Record<string, unknown>)?.[storyPointsField] as number | null || null,
          durationDays,

          // Dates
          createdAt: issue.fields?.created,
          updatedAt: issue.fields?.updated,
          resolvedAt: issue.fields?.resolutiondate,

          // Context
          sprint,
          epicKey,
          epicSummary,
          linkedIssues,

          // Comments
          commentCount: comments.length,
          comments: includeComments ? comments : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch Jira ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Fetch Jira Epic
 * Get epic details with child tickets summary
 */
export const fetchJiraEpicTool = tool({
  description:
    'Fetch Jira epic details along with a summary of all child tickets.',
  inputSchema: z.object({
    key: z.string().describe('Epic key (e.g., PRO-100)'),
  }),
  execute: async ({ key }) => {
    try {
      const jira = await getJiraClient();
      const storyPointsField = await getStoryPointsFieldId();

      // Fetch epic details
      const epic = await jira.issues.getIssue({
        issueIdOrKey: key,
        fields: [
          'summary',
          'description',
          'status',
          'priority',
          'assignee',
          'created',
          'updated',
          'resolutiondate',
        ],
      });

      // Fetch child issues
      const childrenResponse =
        await jira.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
          jql: `parent = ${key} ORDER BY status ASC`,
          maxResults: 100,
          fields: ['summary', 'status', 'issuetype', storyPointsField],
        });

      const children = (childrenResponse.issues || []).map((issue: any) => ({
        key: issue.key,
        summary: issue.fields?.summary,
        status: issue.fields?.status?.name,
        issueType: issue.fields?.issuetype?.name,
        storyPoints: issue.fields?.[storyPointsField] || null,
      }));

      // Calculate summary stats
      const totalStoryPoints = children.reduce(
        (sum: number, c: any) => sum + (c.storyPoints || 0),
        0
      );
      const completedCount = children.filter(
        (c: any) => c.status === 'Done'
      ).length;
      const statusCounts = children.reduce((acc: any, c: any) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
      }, {});

      return {
        success: true,
        epic: {
          key: epic.key,
          summary: epic.fields?.summary,
          description: epic.fields?.description,
          status: epic.fields?.status?.name,
          priority: epic.fields?.priority?.name,
          assignee: epic.fields?.assignee?.displayName,
          createdAt: epic.fields?.created,
          updatedAt: epic.fields?.updated,
          resolvedAt: epic.fields?.resolutiondate,
        },
        children,
        summary: {
          totalChildren: children.length,
          completedChildren: completedCount,
          completionPercent:
            children.length > 0
              ? Math.round((completedCount / children.length) * 100)
              : 0,
          totalStoryPoints,
          statusCounts,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch Jira epic: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Get Existing Jira Ticket
 * Check if a Jira ticket already exists in our database
 */
export const getExistingJiraTicketTool = tool({
  description:
    'Check if a Jira ticket already exists in the database and retrieve its details.',
  inputSchema: z.object({
    key: z.string().describe('Jira ticket key (e.g., PRO-1234)'),
  }),
  execute: async ({ key }) => {
    try {
      const existingTicket = await prisma.jiraTicket.findUnique({
        where: { key },
        include: {
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
        },
      });

      if (!existingTicket) {
        return {
          success: true,
          exists: false,
          ticket: null,
        };
      }

      return {
        success: true,
        exists: true,
        ticket: {
          id: existingTicket.id,
          key: existingTicket.key,
          summary: existingTicket.summary,
          issueType: existingTicket.issueType,
          status: existingTicket.status,
          storyPoints: existingTicket.storyPoints,
          durationDays: existingTicket.durationDays,
          userRole: existingTicket.userRole,
          evidence: existingTicket.evidence.map((e) => ({
            id: e.id,
            type: e.type,
            summary: e.summary,
            category: e.category,
            scope: e.scope,
            criteria: e.criteria.map((c) => ({
              id: c.criterion.id,
              area: c.criterion.areaOfConcentration,
              confidence: c.confidence,
            })),
          })),
          linkedPRs: existingTicket.prLinks.map((link) => ({
            prId: link.prId,
            repo: link.pr.repo,
            number: link.pr.number,
            title: link.pr.title,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to check existing ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export const jiraTools = {
  searchUserJiraTickets: searchUserJiraTicketsTool,
  fetchJiraTicket: fetchJiraTicketTool,
  fetchJiraEpic: fetchJiraEpicTool,
  getExistingJiraTicket: getExistingJiraTicketTool,
};
