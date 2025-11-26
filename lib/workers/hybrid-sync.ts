/**
 * Hybrid Sync Worker
 *
 * Uses direct API calls for fetching/saving (no AI overhead)
 * Only uses AI for analysis: summarize, categorize, matchCriteria
 * Batches AI calls for efficiency
 */

import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { Version3Client } from 'jira.js';
import { Octokit } from '@octokit/rest';
import { prisma } from '@/lib/db/prisma';
import { JobLogger } from './utils/job-logger';

// ============================================================================
// Types
// ============================================================================

interface JiraTicketRaw {
  key: string;
  summary: string;
  description: string;
  status: string;
  issueType: string;
  priority: string | null;
  storyPoints: number | null;
  assignee: string | null;
  reporter: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  durationDays: number | null;
  epicKey: string | null;
  epicSummary: string | null;
  comments: Array<{ author: string; body: string; created: string }>;
}

interface TicketAnalysis {
  key: string;
  summary: string;
  category: 'feature' | 'bug' | 'refactor' | 'devex' | 'docs' | 'test' | 'other';
  scope: 'small' | 'medium' | 'large';
  criteriaIds: number[];
}

interface SyncConfig {
  startDate?: string;
  endDate?: string;
  projects?: string[];
  repositories?: string[];
  updateExisting?: boolean;
  dryRun?: boolean;
}

interface GitHubPRRaw {
  repo: string;
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  merged: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: Array<{ filename: string; additions: number; deletions: number }>;
  createdAt: string;
  mergedAt: string | null;
  author: string;
  reviewers: string[];
  jiraKey: string | null;
  role: 'author' | 'reviewer';
}

interface PRAnalysis {
  repo: string;
  number: number;
  summary: string;
  category: 'feature' | 'bug' | 'refactor' | 'devex' | 'docs' | 'test' | 'other';
  scope: 'small' | 'medium' | 'large';
  components: string[];
  criteriaIds: number[];
}

// ============================================================================
// Direct API Fetchers (No AI)
// ============================================================================

/**
 * Fetch ALL Jira tickets with full pagination
 */
async function fetchAllJiraTickets(
  jira: Version3Client,
  email: string,
  projects: string[],
  startDate?: string,
  endDate?: string,
  limit?: number,
  logger?: JobLogger
): Promise<JiraTicketRaw[]> {
  const tickets: JiraTicketRaw[] = [];
  const storyPointsField = 'customfield_10028'; // Common field ID

  // Build JQL for assignee
  const jqlParts: string[] = [`assignee = "${email}"`];
  if (projects.length > 0) {
    jqlParts.push(`project IN (${projects.join(', ')})`);
  }
  if (startDate) {
    jqlParts.push(`updated >= "${startDate.split('T')[0]}"`);
  }
  if (endDate) {
    jqlParts.push(`updated <= "${endDate.split('T')[0]}"`);
  }

  const jql = jqlParts.join(' AND ') + ' ORDER BY updated DESC';
  await logger?.info(`JQL: ${jql}`);
  if (limit) {
    await logger?.info(`Limit: ${limit} tickets`);
  }

  const maxResults = limit ? Math.min(100, limit) : 100;
  let nextPageToken: string | undefined;
  let pageNum = 1;

  while (true) {
    // Check if we've hit the limit
    if (limit && tickets.length >= limit) {
      await logger?.info(`Reached limit of ${limit} tickets`);
      break;
    }

    await logger?.info(`Fetching tickets page ${pageNum}...`);

    // Use Enhanced Search API - the old /rest/api/3/search is deprecated (410 Gone)
    const response = await jira.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      nextPageToken,
      maxResults,
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
        'comment',
        'parent',
        storyPointsField,
      ],
    });

    if (!response.issues || response.issues.length === 0) {
      break;
    }

    for (const issue of response.issues) {
      const fields = issue.fields as Record<string, unknown>;

      // Calculate duration
      let durationDays: number | null = null;
      const created = fields.created as string | undefined;
      const resolved = fields.resolutiondate as string | undefined;
      if (created && resolved) {
        durationDays = Math.round(
          (new Date(resolved).getTime() - new Date(created).getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      // Extract description text
      const desc = fields.description;
      const descriptionText = typeof desc === 'string' ? desc : JSON.stringify(desc || '');

      // Extract comments
      const commentField = fields.comment as { comments?: Array<{ author?: { displayName?: string }; body?: string; created?: string }> } | undefined;
      const comments = (commentField?.comments || []).map((c) => ({
        author: c.author?.displayName || 'Unknown',
        body: typeof c.body === 'string' ? c.body : JSON.stringify(c.body || ''),
        created: c.created || '',
      }));

      // Extract epic info
      const parent = fields.parent as { key?: string; fields?: { summary?: string } } | undefined;

      tickets.push({
        key: issue.key || '',
        summary: (fields.summary as string) || '',
        description: descriptionText,
        status: (fields.status as { name?: string })?.name || '',
        issueType: (fields.issuetype as { name?: string })?.name || '',
        priority: (fields.priority as { name?: string })?.name || null,
        storyPoints: (fields[storyPointsField] as number) || null,
        assignee: (fields.assignee as { displayName?: string })?.displayName || null,
        reporter: (fields.reporter as { displayName?: string })?.displayName || null,
        createdAt: (fields.created as string) || '',
        updatedAt: (fields.updated as string) || '',
        resolvedAt: (fields.resolutiondate as string) || null,
        durationDays,
        epicKey: parent?.key || null,
        epicSummary: parent?.fields?.summary || null,
        comments,
      });
    }

    await logger?.info(`Fetched ${tickets.length} tickets so far`);

    // Check for next page using token-based pagination
    if (response.nextPageToken) {
      nextPageToken = response.nextPageToken;
      pageNum++;
    } else {
      break;
    }
  }

  return tickets;
}

// Lightweight PR reference from search (no details yet)
interface PRRef {
  repo: string;
  number: number;
  title: string;
  role: 'author' | 'reviewer';
}

/**
 * Phase 1: Quick search to discover PRs (no detail fetching)
 */
async function discoverGitHubPRs(
  octokit: Octokit,
  username: string,
  repos: string[],
  startDate?: string,
  endDate?: string,
  limit?: number,
  logger?: JobLogger
): Promise<PRRef[]> {
  const prRefs: PRRef[] = [];

  // Build date filter for search
  let dateFilter = '';
  if (startDate && endDate) {
    dateFilter = ` merged:${startDate.split('T')[0]}..${endDate.split('T')[0]}`;
  } else if (startDate) {
    dateFilter = ` merged:>=${startDate.split('T')[0]}`;
  }

  await logger?.info('=== Phase 1: Discovering PRs (quick search) ===');

  // Search for authored PRs
  await logger?.info('Searching for authored PRs...');
  const authoredRefs = await searchPRRefs(
    octokit,
    `is:pr is:merged author:${username}${dateFilter}`,
    repos,
    'author',
    limit,
    logger
  );
  await logger?.info(`Found ${authoredRefs.length} authored PRs`);
  prRefs.push(...authoredRefs);

  // Search for reviewed PRs (if we haven't hit limit)
  if (!limit || prRefs.length < limit) {
    await logger?.info('Searching for reviewed PRs...');
    const remainingLimit = limit ? limit - prRefs.length : undefined;
    const reviewedRefs = await searchPRRefs(
      octokit,
      `is:pr is:merged reviewed-by:${username}${dateFilter}`,
      repos,
      'reviewer',
      remainingLimit,
      logger
    );

    // Dedupe
    let added = 0;
    for (const ref of reviewedRefs) {
      const exists = prRefs.some((p) => p.repo === ref.repo && p.number === ref.number);
      if (!exists) {
        prRefs.push(ref);
        added++;
        if (limit && prRefs.length >= limit) break;
      }
    }
    await logger?.info(`Found ${reviewedRefs.length} reviewed PRs, added ${added} new`);
  }

  await logger?.info(`Total discovered: ${prRefs.length} PRs`);
  return prRefs;
}

/**
 * Quick search that only returns PR references (no API calls per PR)
 */
async function searchPRRefs(
  octokit: Octokit,
  query: string,
  repos: string[],
  role: 'author' | 'reviewer',
  limit?: number,
  logger?: JobLogger
): Promise<PRRef[]> {
  const refs: PRRef[] = [];

  const repoQueries = repos.length > 0
    ? repos.map((repo) => `${query} repo:${repo}`)
    : [query];

  for (const q of repoQueries) {
    if (limit && refs.length >= limit) break;

    let page = 1;
    let hasMore = true;
    const perRepoLimit = limit ? Math.ceil(limit / repos.length) : undefined;

    while (hasMore) {
      await logger?.info(`  Searching: ${q.split(' ').slice(0, 4).join(' ')}... (page ${page})`);

      const response = await octokit.search.issuesAndPullRequests({
        q,
        per_page: Math.min(100, perRepoLimit || 100),
        page,
        sort: 'updated',
        order: 'desc',
      });

      if (response.data.items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of response.data.items) {
        if (limit && refs.length >= limit) {
          hasMore = false;
          break;
        }

        const [owner, repo] = item.repository_url.split('/').slice(-2);
        refs.push({
          repo: `${owner}/${repo}`,
          number: item.number,
          title: item.title,
          role,
        });
      }

      if (response.data.items.length < 100 || (perRepoLimit && refs.length >= perRepoLimit)) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  return refs;
}

/**
 * Phase 3: Fetch full details for specific PRs
 */
async function fetchPRDetails(
  octokit: Octokit,
  prRefs: PRRef[],
  logger?: JobLogger
): Promise<GitHubPRRaw[]> {
  await logger?.info(`=== Phase 3: Fetching full details for ${prRefs.length} PRs ===`);

  const prs: GitHubPRRaw[] = [];

  for (let i = 0; i < prRefs.length; i++) {
    const ref = prRefs[i];
    const [owner, repo] = ref.repo.split('/');

    try {
      await logger?.info(`  [${i + 1}/${prRefs.length}] Fetching ${ref.repo}#${ref.number}...`);

      // Fetch PR details, files, and reviews in parallel
      const [prDetails, filesResponse, reviewsResponse] = await Promise.all([
        octokit.pulls.get({ owner, repo, pull_number: ref.number }),
        octokit.pulls.listFiles({ owner, repo, pull_number: ref.number, per_page: 100 }),
        octokit.pulls.listReviews({ owner, repo, pull_number: ref.number }),
      ]);

      const reviewers = [...new Set(reviewsResponse.data.map((r) => r.user?.login).filter(Boolean))] as string[];
      const jiraKeyMatch = (prDetails.data.title + ' ' + (prDetails.data.body || '')).match(/([A-Z]+-\d+)/);

      prs.push({
        repo: ref.repo,
        number: ref.number,
        title: prDetails.data.title,
        body: prDetails.data.body || '',
        url: prDetails.data.html_url,
        state: prDetails.data.state,
        merged: prDetails.data.merged || false,
        additions: prDetails.data.additions || 0,
        deletions: prDetails.data.deletions || 0,
        changedFiles: prDetails.data.changed_files || 0,
        files: filesResponse.data.map((f) => ({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
        })),
        createdAt: prDetails.data.created_at,
        mergedAt: prDetails.data.merged_at,
        author: prDetails.data.user?.login || 'unknown',
        reviewers,
        jiraKey: jiraKeyMatch?.[1] || null,
        role: ref.role,
      });
    } catch (error) {
      await logger?.info(`  Failed to fetch ${ref.repo}#${ref.number}: ${error}`);
    }
  }

  await logger?.info(`Fetched details for ${prs.length}/${prRefs.length} PRs`);
  return prs;
}

/**
 * Extract component/area from file paths
 */
function extractComponents(files: Array<{ filename: string }>): string[] {
  const components = new Set<string>();

  for (const file of files) {
    const parts = file.filename.split('/');

    // Common patterns
    if (parts[0] === 'src' && parts[1]) {
      components.add(parts[1]);
    } else if (parts[0] === 'lib' && parts[1]) {
      components.add(parts[1]);
    } else if (parts[0] === 'packages' && parts[1]) {
      components.add(parts[1]);
    } else if (parts[0] === 'apps' && parts[1]) {
      components.add(parts[1]);
    } else if (parts.length >= 2) {
      components.add(parts[0]);
    }
  }

  return [...components].slice(0, 5); // Max 5 components
}

// ============================================================================
// AI Analysis (Batched)
// ============================================================================

/**
 * Analyze a batch of tickets using AI
 * Returns summaries, categories, and matched criteria
 */
async function analyzeTicketsBatch(
  tickets: JiraTicketRaw[],
  criteria: Array<{ id: number; area: string; subarea: string; description: string }>,
  anthropicApiKey: string,
  model: string,
  logger?: JobLogger
): Promise<TicketAnalysis[]> {
  if (tickets.length === 0) return [];

  await logger?.info(`Analyzing batch of ${tickets.length} tickets with AI...`);

  const anthropic = createAnthropic({ apiKey: anthropicApiKey });

  // Build criteria reference for the prompt
  const criteriaRef = criteria
    .map((c) => `[${c.id}] ${c.area} > ${c.subarea}: ${c.description.slice(0, 100)}...`)
    .join('\n');

  const ticketSummaries = tickets.map((t) => ({
    key: t.key,
    title: t.summary,
    type: t.issueType,
    status: t.status,
    description: t.description.slice(0, 500),
    storyPoints: t.storyPoints,
    durationDays: t.durationDays,
  }));

  const result = await generateObject({
    model: anthropic(model),
    schema: z.object({
      analyses: z.array(
        z.object({
          key: z.string(),
          summary: z.string().describe('1-2 sentence summary of the work done'),
          category: z.enum(['feature', 'bug', 'refactor', 'devex', 'docs', 'test', 'other']),
          scope: z.enum(['small', 'medium', 'large']),
          criteriaIds: z.array(z.number()).describe('IDs of matching performance criteria (max 3)'),
        })
      ),
    }),
    prompt: `Analyze these Jira tickets and for each one provide:
1. A concise summary (1-2 sentences) of the work accomplished
2. Category: feature, bug, refactor, devex, docs, test, or other
3. Scope: small (< 1 day), medium (1-3 days), large (> 3 days)
4. Up to 3 most relevant performance criteria IDs from the list below

TICKETS:
${JSON.stringify(ticketSummaries, null, 2)}

PERFORMANCE CRITERIA:
${criteriaRef}

Return analysis for each ticket in the same order.`,
  });

  await logger?.info(`AI analysis complete for ${result.object.analyses.length} tickets`);

  return result.object.analyses;
}

/**
 * Analyze a batch of PRs using AI
 */
async function analyzePRsBatch(
  prs: GitHubPRRaw[],
  criteria: Array<{ id: number; area: string; subarea: string; description: string }>,
  anthropicApiKey: string,
  model: string,
  logger?: JobLogger
): Promise<PRAnalysis[]> {
  if (prs.length === 0) return [];

  await logger?.info(`Analyzing batch of ${prs.length} PRs with AI...`);

  const anthropic = createAnthropic({ apiKey: anthropicApiKey });

  const criteriaRef = criteria
    .map((c) => `[${c.id}] ${c.area} > ${c.subarea}: ${c.description.slice(0, 100)}...`)
    .join('\n');

  const prSummaries = prs.map((pr) => ({
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    body: pr.body.slice(0, 300),
    additions: pr.additions,
    deletions: pr.deletions,
    files: pr.files.slice(0, 10).map((f) => f.filename),
    role: pr.role,
  }));

  const result = await generateObject({
    model: anthropic(model),
    schema: z.object({
      analyses: z.array(
        z.object({
          repo: z.string(),
          number: z.number(),
          summary: z.string().describe('1-2 sentence summary of the work done'),
          category: z.enum(['feature', 'bug', 'refactor', 'devex', 'docs', 'test', 'other']),
          scope: z.enum(['small', 'medium', 'large']),
          components: z.array(z.string()).describe('Code areas/components affected'),
          criteriaIds: z.array(z.number()).describe('IDs of matching performance criteria (max 3)'),
        })
      ),
    }),
    prompt: `Analyze these GitHub Pull Requests and for each one provide:
1. A concise summary (1-2 sentences) of the work accomplished
2. Category: feature, bug, refactor, devex (developer experience), docs, test, or other
3. Scope based on changes: small (< 50 lines), medium (50-200 lines), large (> 200 lines)
4. Components/areas affected based on file paths
5. Up to 3 most relevant performance criteria IDs from the list below

PULL REQUESTS:
${JSON.stringify(prSummaries, null, 2)}

PERFORMANCE CRITERIA:
${criteriaRef}

Return analysis for each PR in the same order.`,
  });

  await logger?.info(`AI analysis complete for ${result.object.analyses.length} PRs`);

  return result.object.analyses;
}

// ============================================================================
// Database Operations (No AI)
// ============================================================================

/**
 * Save a Jira ticket and its evidence to the database
 */
async function saveTicketWithEvidence(
  ticket: JiraTicketRaw,
  analysis: TicketAnalysis,
  userRole: 'assignee' | 'reviewer',
  logger?: JobLogger
): Promise<void> {
  // Upsert the Jira ticket
  const savedTicket = await prisma.jiraTicket.upsert({
    where: { key: ticket.key },
    update: {
      summary: ticket.summary,
      description: ticket.description,
      issueType: ticket.issueType,
      status: ticket.status,
      priority: ticket.priority,
      storyPoints: ticket.storyPoints,
      durationDays: ticket.durationDays,
      userRole,
      epicKey: ticket.epicKey,
      epicSummary: ticket.epicSummary,
      createdAt: new Date(ticket.createdAt),
      resolvedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt) : null,
    },
    create: {
      key: ticket.key,
      summary: ticket.summary,
      description: ticket.description,
      issueType: ticket.issueType,
      status: ticket.status,
      priority: ticket.priority,
      storyPoints: ticket.storyPoints,
      durationDays: ticket.durationDays,
      userRole,
      epicKey: ticket.epicKey,
      epicSummary: ticket.epicSummary,
      createdAt: new Date(ticket.createdAt),
      resolvedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt) : null,
    },
  });

  // Create or update evidence
  const existingEvidence = await prisma.evidence.findFirst({
    where: { jiraTicketId: savedTicket.id },
  });

  const occurredAt = ticket.resolvedAt
    ? new Date(ticket.resolvedAt)
    : new Date(ticket.updatedAt);

  if (existingEvidence) {
    await prisma.evidence.update({
      where: { id: existingEvidence.id },
      data: {
        summary: analysis.summary,
        category: analysis.category,
        scope: analysis.scope,
        occurredAt,
      },
    });
  } else {
    const newEvidence = await prisma.evidence.create({
      data: {
        type: 'JIRA',
        summary: analysis.summary,
        category: analysis.category,
        scope: analysis.scope,
        occurredAt,
        jiraTicketId: savedTicket.id,
      },
    });

    // Link criteria
    if (analysis.criteriaIds.length > 0) {
      for (const criterionId of analysis.criteriaIds) {
        await prisma.evidenceCriterion.upsert({
          where: {
            evidenceId_criterionId: {
              evidenceId: newEvidence.id,
              criterionId,
            },
          },
          update: {},
          create: {
            evidenceId: newEvidence.id,
            criterionId,
            confidence: 0.8,
          },
        });
      }
    }
  }

  await logger?.info(`Saved: ${ticket.key} - ${analysis.category} - ${analysis.scope}`);
}

/**
 * Save a GitHub PR and its evidence to the database
 */
async function savePRWithEvidence(
  pr: GitHubPRRaw,
  analysis: PRAnalysis,
  logger?: JobLogger
): Promise<void> {
  // Upsert the GitHub PR
  const savedPR = await prisma.gitHubPR.upsert({
    where: {
      repo_number_userRole: { repo: pr.repo, number: pr.number, userRole: pr.role },
    },
    update: {
      title: pr.title,
      body: pr.body,
      url: pr.url,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      files: JSON.stringify(pr.files),
      components: JSON.stringify(analysis.components),
      createdAt: new Date(pr.createdAt),
      mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : null,
    },
    create: {
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.url,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      files: JSON.stringify(pr.files),
      userRole: pr.role,
      components: JSON.stringify(analysis.components),
      createdAt: new Date(pr.createdAt),
      mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : null,
    },
  });

  // Create or update evidence
  const existingEvidence = await prisma.evidence.findFirst({
    where: { githubPrId: savedPR.id },
  });

  const occurredAt = pr.mergedAt ? new Date(pr.mergedAt) : new Date(pr.createdAt);

  if (existingEvidence) {
    await prisma.evidence.update({
      where: { id: existingEvidence.id },
      data: {
        summary: analysis.summary,
        category: analysis.category,
        scope: analysis.scope,
        occurredAt,
      },
    });
  } else {
    const newEvidence = await prisma.evidence.create({
      data: {
        type: 'GITHUB_PR',
        summary: analysis.summary,
        category: analysis.category,
        scope: analysis.scope,
        occurredAt,
        githubPrId: savedPR.id,
      },
    });

    // Link criteria
    if (analysis.criteriaIds.length > 0) {
      for (const criterionId of analysis.criteriaIds) {
        await prisma.evidenceCriterion.upsert({
          where: {
            evidenceId_criterionId: {
              evidenceId: newEvidence.id,
              criterionId,
            },
          },
          update: {},
          create: {
            evidenceId: newEvidence.id,
            criterionId,
            confidence: 0.8,
          },
        });
      }
    }
  }

  // Link to Jira if key found
  if (pr.jiraKey) {
    const jiraTicket = await prisma.jiraTicket.findUnique({
      where: { key: pr.jiraKey },
    });
    if (jiraTicket) {
      await prisma.pRJiraLink.upsert({
        where: {
          prId_jiraKey: { prId: savedPR.id, jiraKey: pr.jiraKey },
        },
        update: {},
        create: {
          prId: savedPR.id,
          jiraKey: pr.jiraKey,
        },
      });
    }
  }

  await logger?.info(`Saved: ${pr.repo}#${pr.number} - ${analysis.category} - ${analysis.scope}`);
}

// ============================================================================
// Main Hybrid Sync Functions
// ============================================================================

export async function processHybridJiraSync(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.config) throw new Error(`Job ${jobId} not found`);

  const config = JSON.parse(job.config) as SyncConfig;
  const logger = new JobLogger(jobId);

  // Dry run limits total tickets processed
  const DRY_RUN_LIMIT = 20;

  try {
    await logger.setStatus('RUNNING');
    await logger.info('=== Starting Hybrid Jira Sync ===');
    if (config.dryRun) {
      await logger.info(`DRY RUN MODE: Limited to ${DRY_RUN_LIMIT} tickets total`);
    }
    await logger.updateProgress(5, 'Initializing...');

    // Load configuration
    const [jiraHostConfig, jiraEmailConfig, jiraTokenConfig, projectsConfig, apiKeyConfig, modelConfig] =
      await Promise.all([
        prisma.config.findUnique({ where: { key: 'jira_host' } }),
        prisma.config.findUnique({ where: { key: 'jira_email' } }),
        prisma.config.findUnique({ where: { key: 'jira_api_token' } }),
        prisma.config.findUnique({ where: { key: 'selected_projects' } }),
        prisma.config.findUnique({ where: { key: 'anthropic_api_key' } }),
        prisma.config.findUnique({ where: { key: 'selected_model' } }),
      ]);

    if (!jiraHostConfig?.value || !jiraEmailConfig?.value || !jiraTokenConfig?.value) {
      throw new Error('Jira credentials not configured');
    }
    if (!apiKeyConfig?.value) {
      throw new Error('Anthropic API key not configured');
    }

    const jiraHost = JSON.parse(jiraHostConfig.value);
    const jiraEmail = JSON.parse(jiraEmailConfig.value);
    const jiraToken = JSON.parse(jiraTokenConfig.value);
    const projects = config.projects || (projectsConfig?.value ? JSON.parse(projectsConfig.value) : []);
    const anthropicApiKey = JSON.parse(apiKeyConfig.value);
    const model = modelConfig?.value ? JSON.parse(modelConfig.value) : 'claude-sonnet-4-5-20250929';

    await logger.info(`User: ${jiraEmail}`);
    await logger.info(`Projects: ${projects.join(', ') || 'all'}`);
    await logger.updateProgress(10, 'Connecting to Jira...');

    // Create Jira client
    const jira = new Version3Client({
      host: `https://${jiraHost}`,
      authentication: { basic: { email: jiraEmail, apiToken: jiraToken } },
    });

    // Phase 1: Fetch tickets (direct API, with pagination)
    await logger.info('=== Phase 1: Fetching Jira Tickets ===');
    await logger.setStatusMessage('Fetching tickets...');
    const fetchLimit = config.dryRun ? DRY_RUN_LIMIT : undefined;
    const allTickets = await fetchAllJiraTickets(
      jira,
      jiraEmail,
      projects,
      config.startDate,
      config.endDate,
      fetchLimit,
      logger
    );
    await logger.info(`Fetched ${allTickets.length} total tickets`);
    await logger.updateProgress(40, `Fetched ${allTickets.length} tickets`);

    // Phase 2: Filter out existing tickets if not updating
    await logger.info('=== Phase 2: Filtering to New Tickets ===');
    let ticketsToProcess = allTickets;
    if (!config.updateExisting) {
      const existingKeys = await prisma.jiraTicket.findMany({
        where: { key: { in: allTickets.map((t) => t.key) } },
        select: { key: true },
      });
      const existingKeySet = new Set(existingKeys.map((e) => e.key));
      ticketsToProcess = allTickets.filter((t) => !existingKeySet.has(t.key));
      await logger.info(`${ticketsToProcess.length} new tickets to process (${existingKeys.length} already exist)`);
    }

    // Apply dry run limit
    if (config.dryRun && ticketsToProcess.length > DRY_RUN_LIMIT) {
      await logger.info(`Limiting to ${DRY_RUN_LIMIT} tickets for dry run`);
      ticketsToProcess = ticketsToProcess.slice(0, DRY_RUN_LIMIT);
    }

    if (ticketsToProcess.length === 0) {
      await logger.info('No new tickets to process');
      await logger.updateProgress(100);
      await logger.setStatus('COMPLETED');
      return { ticketsFetched: allTickets.length, ticketsProcessed: 0 };
    }

    // Load criteria for AI matching
    await logger.info('Loading performance criteria...');
    const criteria = await prisma.criterion.findMany();
    const criteriaForAI = criteria.map((c) => ({
      id: c.id,
      area: c.areaOfConcentration,
      subarea: c.subarea,
      description: c.description,
    }));
    await logger.info(`Loaded ${criteria.length} criteria`);

    // Phase 3: AI Analysis in batches
    await logger.info('=== Phase 3: AI Analysis ===');
    await logger.setStatusMessage('Analyzing tickets with AI...');
    const BATCH_SIZE = 10;
    const analyses: TicketAnalysis[] = [];

    for (let i = 0; i < ticketsToProcess.length; i += BATCH_SIZE) {
      const batch = ticketsToProcess.slice(i, i + BATCH_SIZE);
      await logger.info(`Analyzing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ticketsToProcess.length / BATCH_SIZE)} (${batch.length} tickets)...`);
      const batchAnalyses = await analyzeTicketsBatch(batch, criteriaForAI, anthropicApiKey, model, logger);
      analyses.push(...batchAnalyses);

      const progress = 40 + Math.floor((i / ticketsToProcess.length) * 40);
      await logger.updateProgress(progress, `Analyzed ${analyses.length}/${ticketsToProcess.length} tickets`);
    }

    // Phase 4: Save to database
    await logger.info('=== Phase 4: Saving to Database ===');
    await logger.setStatusMessage('Saving to database...');
    let saved = 0;
    for (let i = 0; i < ticketsToProcess.length; i++) {
      const ticket = ticketsToProcess[i];
      const analysis = analyses.find((a) => a.key === ticket.key);
      if (analysis) {
        await saveTicketWithEvidence(ticket, analysis, 'assignee', logger);
        saved++;
      }
      const progress = 80 + Math.floor((i / ticketsToProcess.length) * 18);
      await logger.updateProgress(progress);
    }

    await logger.updateProgress(100);
    await logger.setStatus('COMPLETED');
    await logger.info('=== Sync Complete ===');
    await logger.info(`Fetched: ${allTickets.length}, Processed: ${ticketsToProcess.length}, Saved: ${saved}`);

    return {
      ticketsFetched: allTickets.length,
      ticketsProcessed: ticketsToProcess.length,
      ticketsSkipped: allTickets.length - ticketsToProcess.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.error(`Hybrid sync failed: ${message}`);
    await logger.setError(message);
    await logger.setStatus('FAILED');
    throw error;
  }
}

export async function processHybridGitHubSync(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.config) throw new Error(`Job ${jobId} not found`);

  const config = JSON.parse(job.config) as SyncConfig;
  const logger = new JobLogger(jobId);

  // Dry run limits to 5 PRs per repo
  const DRY_RUN_LIMIT = 20; // Total limit for dry run

  try {
    await logger.setStatus('RUNNING');
    await logger.info('=== Starting Hybrid GitHub Sync ===');
    if (config.dryRun) {
      await logger.info(`DRY RUN MODE: Limited to ${DRY_RUN_LIMIT} PRs total`);
    }
    await logger.updateProgress(5, 'Initializing...');

    // Load configuration
    await logger.info('Loading configuration from database...');
    const [githubTokenConfig, reposConfig, usernameConfig, apiKeyConfig, modelConfig] = await Promise.all([
      prisma.config.findUnique({ where: { key: 'github_token' } }),
      prisma.config.findUnique({ where: { key: 'selected_repos' } }),
      prisma.config.findUnique({ where: { key: 'github_username' } }),
      prisma.config.findUnique({ where: { key: 'anthropic_api_key' } }),
      prisma.config.findUnique({ where: { key: 'selected_model' } }),
    ]);

    if (!githubTokenConfig?.value) {
      throw new Error('GitHub token not configured');
    }
    if (!apiKeyConfig?.value) {
      throw new Error('Anthropic API key not configured');
    }

    const githubToken = JSON.parse(githubTokenConfig.value);
    const repos = config.repositories || (reposConfig?.value ? JSON.parse(reposConfig.value) : []);
    const anthropicApiKey = JSON.parse(apiKeyConfig.value);
    const model = modelConfig?.value ? JSON.parse(modelConfig.value) : 'claude-sonnet-4-5-20250929';

    // Get username from config or API
    let username = usernameConfig?.value ? JSON.parse(usernameConfig.value) : null;
    const octokit = new Octokit({ auth: githubToken });

    if (!username) {
      await logger.info('Fetching GitHub username from API...');
      const { data } = await octokit.users.getAuthenticated();
      username = data.login;
    }

    await logger.info(`User: ${username}`);
    await logger.info(`Repositories: ${repos.join(', ') || 'all'}`);
    await logger.info(`Date range: ${config.startDate || '1 year ago'} to ${config.endDate || 'now'}`);
    await logger.updateProgress(10, 'Discovering PRs...');

    // Phase 1: Quick discovery (search only, no details)
    await logger.setStatusMessage('Discovering PRs...');
    const discoveryLimit = config.dryRun ? DRY_RUN_LIMIT : undefined;
    const discoveredPRs = await discoverGitHubPRs(
      octokit,
      username,
      repos,
      config.startDate,
      config.endDate,
      discoveryLimit,
      logger
    );
    await logger.updateProgress(20, `Discovered ${discoveredPRs.length} PRs`);

    // Phase 2: Filter to new PRs only
    await logger.info('=== Phase 2: Filtering to new PRs ===');
    let prsToProcess = discoveredPRs;
    if (!config.updateExisting && discoveredPRs.length > 0) {
      await logger.info('Checking database for existing PRs...');
      const existingPRs = await prisma.gitHubPR.findMany({
        where: {
          OR: discoveredPRs.map((pr) => ({ repo: pr.repo, number: pr.number })),
        },
        select: { repo: true, number: true },
      });
      const existingSet = new Set(existingPRs.map((p) => `${p.repo}#${p.number}`));
      prsToProcess = discoveredPRs.filter((pr) => !existingSet.has(`${pr.repo}#${pr.number}`));
      await logger.info(`${prsToProcess.length} new PRs to process (${existingPRs.length} already in DB)`);
    }

    if (prsToProcess.length === 0) {
      await logger.info('No new PRs to process - sync complete');
      await logger.updateProgress(100);
      await logger.setStatus('COMPLETED');
      return { prsDiscovered: discoveredPRs.length, prsProcessed: 0 };
    }

    await logger.updateProgress(25, `${prsToProcess.length} PRs to process`);

    // Phase 3: Fetch full details only for PRs we'll process
    await logger.setStatusMessage('Fetching PR details...');
    const prsWithDetails = await fetchPRDetails(octokit, prsToProcess, logger);
    await logger.updateProgress(50, `Fetched details for ${prsWithDetails.length} PRs`);

    // Load criteria for AI matching
    await logger.info('Loading performance criteria...');
    const criteria = await prisma.criterion.findMany();
    const criteriaForAI = criteria.map((c) => ({
      id: c.id,
      area: c.areaOfConcentration,
      subarea: c.subarea,
      description: c.description,
    }));
    await logger.info(`Loaded ${criteria.length} criteria`);

    // Phase 4: AI Analysis in batches
    await logger.info('=== Phase 4: AI Analysis ===');
    await logger.setStatusMessage('Analyzing PRs with AI...');
    const BATCH_SIZE = 10;
    const analyses: PRAnalysis[] = [];

    for (let i = 0; i < prsWithDetails.length; i += BATCH_SIZE) {
      const batch = prsWithDetails.slice(i, i + BATCH_SIZE);
      await logger.info(`Analyzing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(prsWithDetails.length / BATCH_SIZE)} (${batch.length} PRs)...`);
      const batchAnalyses = await analyzePRsBatch(batch, criteriaForAI, anthropicApiKey, model, logger);
      analyses.push(...batchAnalyses);

      const progress = 50 + Math.floor((i / prsWithDetails.length) * 30);
      await logger.updateProgress(progress, `Analyzed ${analyses.length}/${prsWithDetails.length} PRs`);
    }

    // Phase 5: Save to database
    await logger.info('=== Phase 5: Saving to Database ===');
    await logger.setStatusMessage('Saving to database...');
    let saved = 0;
    for (let i = 0; i < prsWithDetails.length; i++) {
      const pr = prsWithDetails[i];
      const analysis = analyses.find((a) => a.repo === pr.repo && a.number === pr.number);
      if (analysis) {
        await savePRWithEvidence(pr, analysis, logger);
        saved++;
      }
      const progress = 80 + Math.floor((i / prsWithDetails.length) * 18);
      await logger.updateProgress(progress);
    }

    await logger.updateProgress(100);
    await logger.setStatus('COMPLETED');
    await logger.info(`=== Sync Complete ===`);
    await logger.info(`Discovered: ${discoveredPRs.length}, Processed: ${prsWithDetails.length}, Saved: ${saved}`);

    return {
      prsDiscovered: discoveredPRs.length,
      prsProcessed: prsWithDetails.length,
      prsSaved: saved,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.error(`Hybrid sync failed: ${message}`);
    await logger.setError(message);
    await logger.setStatus('FAILED');
    throw error;
  }
}
