/**
 * GitHub Discovery and Enrichment Tools
 *
 * Tools for AI agents to discover and fetch GitHub data:
 * - searchUserPRs: Find PRs by user role (author, reviewer)
 * - searchUserIssues: Find issues created by user
 * - fetchPRDetails: Get full PR details with code stats
 */

import { tool } from 'ai';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { prisma } from '@/lib/db/prisma';

// Get GitHub client from config
async function getGitHubClient(): Promise<Octokit> {
  const config = await prisma.config.findUnique({
    where: { key: 'github_token' },
  });

  if (!config?.value) {
    throw new Error('GitHub token not configured');
  }

  const token = JSON.parse(config.value);
  return new Octokit({ auth: token });
}

// Get GitHub username from config or API
async function getGitHubUsername(): Promise<string> {
  // Try to get from config first
  const usernameConfig = await prisma.config.findUnique({
    where: { key: 'github_username' },
  });

  if (usernameConfig?.value) {
    return JSON.parse(usernameConfig.value);
  }

  // Fallback: fetch from GitHub API using the token
  const octokit = await getGitHubClient();
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

/**
 * Tool: Search User PRs
 * Find GitHub PRs where the user is author, reviewer, or assignee
 */
export const searchUserPRsTool = tool({
  description:
    'Search for GitHub Pull Requests where the user is the author, reviewer, or assignee. Returns a list of PRs with basic metadata. If username is not provided, it will be auto-detected from configuration.',
  inputSchema: z.object({
    role: z
      .enum(['author', 'reviewer', 'assignee'])
      .describe('The user role to search for'),
    username: z.string().optional().describe('GitHub username to search for (auto-detected if not provided)'),
    startDate: z
      .string()
      .optional()
      .describe('Start date for filtering (ISO format)'),
    endDate: z
      .string()
      .optional()
      .describe('End date for filtering (ISO format)'),
    repo: z
      .string()
      .optional()
      .describe('Filter by specific repository (owner/repo format)'),
    state: z
      .enum(['open', 'closed', 'merged', 'all'])
      .default('merged')
      .describe('PR state to filter'),
    limit: z.number().optional().default(500).describe('Maximum PRs to return'),
  }),
  execute: async ({ role, username: providedUsername, startDate, endDate, repo, state, limit }) => {
    try {
      const octokit = await getGitHubClient();

      // Auto-detect username if not provided
      const username = providedUsername || await getGitHubUsername();

      // Build search query
      let q = `is:pr`;

      // Add role filter
      if (role === 'author') {
        q += ` author:${username}`;
      } else if (role === 'reviewer') {
        q += ` reviewed-by:${username}`;
      } else if (role === 'assignee') {
        q += ` assignee:${username}`;
      }

      // Add state filter
      if (state === 'merged') {
        q += ` is:merged`;
      } else if (state === 'open') {
        q += ` is:open`;
      } else if (state === 'closed') {
        q += ` is:closed is:unmerged`;
      }

      // Add date range
      if (startDate && endDate) {
        q += ` merged:${startDate}..${endDate}`;
      } else if (startDate) {
        q += ` merged:>=${startDate}`;
      } else if (endDate) {
        q += ` merged:<=${endDate}`;
      }

      // Add repo filter
      if (repo) {
        q += ` repo:${repo}`;
      }

      const response = await octokit.rest.search.issuesAndPullRequests({
        q,
        sort: 'updated',
        order: 'desc',
        per_page: Math.min(limit, 100),
      });

      const prs = response.data.items.map((pr) => ({
        number: pr.number,
        title: pr.title,
        repo: pr.repository_url.replace('https://api.github.com/repos/', ''),
        state: pr.state,
        createdAt: pr.created_at,
        closedAt: pr.closed_at,
        url: pr.html_url,
        user: pr.user?.login,
      }));

      return {
        success: true,
        username,
        count: prs.length,
        totalCount: response.data.total_count,
        query: q,
        prs,
        // Debug info for logging
        _debug: {
          apiTotalCount: response.data.total_count,
          apiItemsCount: response.data.items.length,
          queryUsed: q,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to search PRs: ${errorMsg}`,
        // Include error details for debugging
        _debug: {
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          errorMessage: errorMsg,
          errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') : undefined,
        },
      };
    }
  },
});

/**
 * Tool: Search User Issues
 * Find GitHub issues created by the user
 */
export const searchUserIssuesTool = tool({
  description:
    'Search for GitHub Issues created by the user. Returns a list of issues with basic metadata.',
  inputSchema: z.object({
    username: z.string().describe('GitHub username to search for'),
    startDate: z
      .string()
      .optional()
      .describe('Start date for filtering (ISO format)'),
    endDate: z
      .string()
      .optional()
      .describe('End date for filtering (ISO format)'),
    repo: z
      .string()
      .optional()
      .describe('Filter by specific repository (owner/repo format)'),
    state: z.enum(['open', 'closed', 'all']).default('all').describe('Issue state'),
    limit: z.number().optional().default(500).describe('Maximum issues to return'),
  }),
  execute: async ({ username, startDate, endDate, repo, state, limit }) => {
    try {
      const octokit = await getGitHubClient();

      // Build search query
      let q = `is:issue author:${username}`;

      if (state !== 'all') {
        q += ` is:${state}`;
      }

      if (startDate && endDate) {
        q += ` created:${startDate}..${endDate}`;
      } else if (startDate) {
        q += ` created:>=${startDate}`;
      } else if (endDate) {
        q += ` created:<=${endDate}`;
      }

      if (repo) {
        q += ` repo:${repo}`;
      }

      const response = await octokit.rest.search.issuesAndPullRequests({
        q,
        sort: 'created',
        order: 'desc',
        per_page: Math.min(limit, 100),
      });

      const issues = response.data.items
        .filter((item) => !item.pull_request) // Exclude PRs
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          repo: issue.repository_url.replace('https://api.github.com/repos/', ''),
          state: issue.state,
          createdAt: issue.created_at,
          closedAt: issue.closed_at,
          url: issue.html_url,
          labels: issue.labels.map((l: any) =>
            typeof l === 'string' ? l : l.name
          ),
        }));

      return {
        success: true,
        count: issues.length,
        totalCount: response.data.total_count,
        query: q,
        issues,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search issues: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Fetch PR Details
 * Get full PR details including code stats, files, and reviews
 */
export const fetchPRDetailsTool = tool({
  description:
    'Fetch full details for a specific Pull Request including code statistics, changed files, and review information.',
  inputSchema: z.object({
    repo: z.string().describe('Repository in owner/repo format'),
    number: z.number().describe('PR number'),
    includeFiles: z
      .boolean()
      .default(true)
      .describe('Include list of changed files'),
    includeReviews: z
      .boolean()
      .default(true)
      .describe('Include review information'),
  }),
  execute: async ({ repo, number, includeFiles, includeReviews }) => {
    try {
      const octokit = await getGitHubClient();
      const [owner, repoName] = repo.split('/');

      // Fetch PR details
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo: repoName,
        pull_number: number,
      });

      // Fetch files if requested
      let files: Array<{
        filename: string;
        additions: number;
        deletions: number;
        status: string;
      }> = [];
      if (includeFiles) {
        const filesResponse = await octokit.rest.pulls.listFiles({
          owner,
          repo: repoName,
          pull_number: number,
          per_page: 100,
        });
        files = filesResponse.data.map((f) => ({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          status: f.status,
        }));
      }

      // Fetch reviews if requested
      let reviews: Array<{
        user: string;
        state: string;
        body: string | null;
        submittedAt: string | null;
      }> = [];
      if (includeReviews) {
        const reviewsResponse = await octokit.rest.pulls.listReviews({
          owner,
          repo: repoName,
          pull_number: number,
        });
        reviews = reviewsResponse.data.map((r) => ({
          user: r.user?.login || 'unknown',
          state: r.state,
          body: r.body,
          submittedAt: r.submitted_at || null,
        }));
      }

      return {
        success: true,
        pr: {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          merged: pr.merged,
          url: pr.html_url,
          user: pr.user?.login,

          // Code stats
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,

          // Dates
          createdAt: pr.created_at,
          mergedAt: pr.merged_at,
          closedAt: pr.closed_at,

          // Branch info
          base: pr.base.ref,
          head: pr.head.ref,

          // Files
          files: includeFiles ? files : undefined,

          // Reviews
          reviews: includeReviews ? reviews : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch PR details: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Tool: Get Existing GitHub PR
 * Check if a PR already exists in our database
 */
export const getExistingGitHubPRTool = tool({
  description:
    'Check if a GitHub PR already exists in the database and retrieve its details.',
  inputSchema: z.object({
    repo: z.string().describe('Repository in owner/repo format'),
    number: z.number().describe('PR number'),
    userRole: z
      .enum(['AUTHOR', 'REVIEWER', 'ASSIGNEE'])
      .optional()
      .describe('Filter by user role'),
  }),
  execute: async ({ repo, number, userRole }) => {
    try {
      const where: any = { repo, number };
      if (userRole) {
        where.userRole = userRole;
      }

      const existingPR = await prisma.gitHubPR.findFirst({
        where,
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
          jiraLinks: {
            include: {
              jira: true,
            },
          },
        },
      });

      if (!existingPR) {
        return {
          success: true,
          exists: false,
          pr: null,
        };
      }

      return {
        success: true,
        exists: true,
        pr: {
          id: existingPR.id,
          number: existingPR.number,
          repo: existingPR.repo,
          title: existingPR.title,
          userRole: existingPR.userRole,
          additions: existingPR.additions,
          deletions: existingPR.deletions,
          changedFiles: existingPR.changedFiles,
          mergedAt: existingPR.mergedAt?.toISOString(),
          evidence: existingPR.evidence.map((e) => ({
            id: e.id,
            type: e.type,
            summary: e.summary,
            category: e.category,
            scope: e.scope,
            criteria: e.criteria.map((c) => ({
              id: c.criterion.id,
              area: c.criterion.areaOfConcentration,
              subarea: c.criterion.subarea,
              confidence: c.confidence,
            })),
          })),
          jiraLinks: existingPR.jiraLinks.map((link) => ({
            jiraKey: link.jiraKey,
            summary: link.jira.summary,
            issueType: link.jira.issueType,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to check existing PR: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export const githubTools = {
  searchUserPRs: searchUserPRsTool,
  searchUserIssues: searchUserIssuesTool,
  fetchPRDetails: fetchPRDetailsTool,
  getExistingGitHubPR: getExistingGitHubPRTool,
};
