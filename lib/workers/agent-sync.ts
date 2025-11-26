/**
 * Agent-Based Sync Worker
 *
 * Executes sync operations using AI agents with tools rather than hardcoded logic.
 * This allows for intelligent, adaptive syncing that can handle edge cases and
 * make decisions about what data to collect.
 */

import { generateText, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { Octokit } from '@octokit/rest';
import { prisma } from '@/lib/db/prisma';
import { githubSyncAgent, jiraSyncAgent } from '@/lib/ai/agents';
import { JobLogger } from './utils/job-logger';

/**
 * Progress tracker for sync operations
 * Tracks total expected items and processed items to calculate real progress
 */
class SyncProgressTracker {
  private totalItems: number = 0;
  private processedItems: number = 0;
  private logger: JobLogger;
  private baseProgress: number; // Starting progress (after discovery phase)
  private maxProgress: number;  // Max progress before completion
  private itemType: string = 'items'; // "PRs" or "tickets"

  constructor(logger: JobLogger, baseProgress: number = 30, maxProgress: number = 90) {
    this.logger = logger;
    this.baseProgress = baseProgress;
    this.maxProgress = maxProgress;
  }

  setTotalItems(count: number, itemType: string = 'items') {
    this.totalItems = Math.max(1, count); // Avoid division by zero
    this.itemType = itemType;
  }

  getTotalItems(): number {
    return this.totalItems;
  }

  getProcessedItems(): number {
    return this.processedItems;
  }

  async incrementProcessed(currentItem?: string) {
    this.processedItems++;
    await this.updateProgress(currentItem);
  }

  private async updateProgress(currentItem?: string) {
    if (this.totalItems === 0) return;

    // Calculate progress between baseProgress and maxProgress
    const progressRange = this.maxProgress - this.baseProgress;
    const percentComplete = this.processedItems / this.totalItems;
    const progress = Math.min(
      this.maxProgress,
      this.baseProgress + Math.floor(progressRange * percentComplete)
    );

    // Build status message
    const statusMessage = currentItem
      ? `Processing ${this.itemType} (${this.processedItems}/${this.totalItems}): ${currentItem}`
      : `Processing ${this.itemType} (${this.processedItems}/${this.totalItems})`;

    await this.logger.updateProgress(progress, statusMessage);
  }
}

/**
 * Format tool call for logging with useful context
 */
function formatToolLog(toolName: string, args: Record<string, unknown>, result?: unknown): string {
  const argSummary = getArgSummary(toolName, args);
  const resultSummary = getResultSummary(toolName, result);

  if (resultSummary) {
    return `${toolName}: ${argSummary} → ${resultSummary}`;
  }
  return `${toolName}: ${argSummary}`;
}

function getArgSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'searchUserPRs':
      return `${args.username || 'unknown'} | ${args.role || 'author'} | ${args.repo || 'all repos'}`;
    case 'getExistingGitHubPR':
      return `${args.repo}#${args.number}`;
    case 'fetchPRDetails':
      return `${args.repo}#${args.number}`;
    case 'extractJiraKey':
      return truncate(String(args.title || args.text || ''), 40);
    case 'extractComponents':
      return `${(args.files as string[])?.length || 0} files`;
    case 'categorize':
      return truncate(String(args.title || args.summary || ''), 40);
    case 'estimateScope':
      return `+${args.additions}/-${args.deletions}`;
    case 'summarize':
      return truncate(String(args.title || ''), 40);
    case 'saveGitHubPR':
      return `${args.repo}#${args.number}`;
    case 'saveEvidence':
      return truncate(String(args.summary || ''), 40);
    case 'searchUserJiraTickets':
      return `${args.project || 'all'} | ${args.role || 'assignee'} | ${args.email || 'no email'}`;
    case 'getExistingJiraTicket':
      return String(args.key);
    case 'fetchJiraTicket':
      return String(args.key);
    case 'fetchJiraEpic':
      return String(args.key);
    case 'saveJiraTicket':
      return String(args.key);
    case 'linkPRToJira':
      return `${args.prRepo}#${args.prNumber} → ${args.jiraKey}`;
    default:
      // Generic: show first string arg
      const firstArg = Object.values(args).find(v => typeof v === 'string');
      return firstArg ? truncate(String(firstArg), 30) : '...';
  }
}

function getResultSummary(toolName: string, result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;

  const res = result as Record<string, unknown>;

  // Check for errors first
  if (res.success === false && res.error) {
    return `ERROR: ${truncate(String(res.error), 80)}`;
  }

  switch (toolName) {
    case 'searchUserPRs':
      const prCount = (res.prs as unknown[])?.length || 0;
      const prUser = res.username ? `[${res.username}] ` : '';
      const prQuery = res.query ? ` | Query: ${truncate(String(res.query), 60)}` : '';
      const prDebug = res._debug as Record<string, unknown> | undefined;
      const debugInfo = prDebug ? ` | API: ${prDebug.apiTotalCount} total, ${prDebug.apiItemsCount} returned` : '';
      const errorInfo = res.error ? ` | ERROR: ${res.error}` : '';
      return `${prUser}found ${prCount} PRs${prQuery}${debugInfo}${errorInfo}`;
    case 'getExistingGitHubPR':
      return res.exists ? 'exists (skipping)' : 'new (will process)';
    case 'fetchPRDetails':
      // Result is nested under res.pr
      const prData = res.pr as Record<string, unknown> | undefined;
      if (prData) {
        return `+${prData.additions}/-${prData.deletions}, ${(prData.files as unknown[])?.length || 0} files`;
      }
      return 'fetched';
    case 'extractJiraKey':
      // Tool returns 'key', not 'jiraKey'
      return res.key ? String(res.key) : 'no key found';
    case 'categorize':
      return String(res.category || 'unknown');
    case 'estimateScope':
      return String(res.scope || 'unknown');
    case 'saveGitHubPR':
    case 'saveJiraTicket':
      if (res.success) {
        return res.action === 'updated' ? 'updated existing' : 'created new';
      }
      return 'save failed';
    case 'saveEvidence':
      return res.success ? 'saved successfully' : 'save failed';
    case 'searchUserJiraTickets':
      const ticketCount = (res.tickets as unknown[])?.length || 0;
      const jiraUser = res.email ? `[${res.email}] ` : '';
      const jql = res.jql ? ` | JQL: ${truncate(String(res.jql), 50)}` : '';
      return `${jiraUser}found ${ticketCount} tickets${jql}`;
    case 'getExistingJiraTicket':
      return res.exists ? 'exists (skipping)' : 'new (will process)';
    case 'fetchJiraTicket':
      const ticket = res.ticket as Record<string, unknown> | undefined;
      if (ticket) {
        return `${ticket.issueType} | ${ticket.status} | ${ticket.storyPoints || 'no'} pts`;
      }
      return 'fetched';
    case 'fetchJiraEpic':
      const summary = res.summary as Record<string, unknown> | undefined;
      if (summary) {
        return `${summary.totalChildren} children, ${summary.completionPercent}% done`;
      }
      return 'fetched';
    case 'linkPRToJira':
      return res.success ? 'linked' : 'link failed';
    case 'summarize':
      return res.summary ? `"${truncate(String(res.summary), 50)}"` : 'generated';
    default:
      return null;
  }
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

/**
 * Get GitHub username from token using the API
 */
async function getGitHubUsername(token: string): Promise<string> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

/**
 * Query GitHub API to get total count of PRs for a user
 */
async function getGitHubPRCount(
  token: string,
  username: string,
  repos: string[],
  startDate?: string
): Promise<{ authored: number; reviewed: number; total: number }> {
  const octokit = new Octokit({ auth: token });

  // Build date filter
  const dateFilter = startDate ? ` merged:>=${startDate}` : '';

  // Count authored PRs
  let authoredCount = 0;
  let reviewedCount = 0;

  if (repos.length > 0) {
    // Query each repo
    for (const repo of repos) {
      try {
        const authorQ = `is:pr is:merged author:${username} repo:${repo}${dateFilter}`;
        const authorRes = await octokit.rest.search.issuesAndPullRequests({
          q: authorQ,
          per_page: 1,
        });
        authoredCount += authorRes.data.total_count;

        const reviewQ = `is:pr is:merged reviewed-by:${username} repo:${repo}${dateFilter}`;
        const reviewRes = await octokit.rest.search.issuesAndPullRequests({
          q: reviewQ,
          per_page: 1,
        });
        reviewedCount += reviewRes.data.total_count;
      } catch (error) {
        // Continue if one repo fails
        console.error(`Error counting PRs for ${repo}:`, error);
      }
    }
  } else {
    // Query all repos
    try {
      const authorQ = `is:pr is:merged author:${username}${dateFilter}`;
      const authorRes = await octokit.rest.search.issuesAndPullRequests({
        q: authorQ,
        per_page: 1,
      });
      authoredCount = authorRes.data.total_count;

      const reviewQ = `is:pr is:merged reviewed-by:${username}${dateFilter}`;
      const reviewRes = await octokit.rest.search.issuesAndPullRequests({
        q: reviewQ,
        per_page: 1,
      });
      reviewedCount = reviewRes.data.total_count;
    } catch (error) {
      console.error('Error counting PRs:', error);
    }
  }

  return {
    authored: authoredCount,
    reviewed: reviewedCount,
    total: authoredCount + reviewedCount,
  };
}

/**
 * Query Jira API to get total count of tickets for a user
 */
async function getJiraTicketCount(
  host: string,
  email: string,
  token: string,
  projects: string[],
  startDate?: string
): Promise<{ assigned: number; total: number }> {
  try {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    // Build JQL query
    let jql = `assignee = "${email}"`;
    if (projects.length > 0) {
      jql += ` AND project IN (${projects.join(', ')})`;
    }
    if (startDate) {
      jql += ` AND updated >= "${startDate}"`;
    }

    const response = await fetch(
      `https://${host}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=0`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      assigned: data.total || 0,
      total: data.total || 0,
    };
  } catch (error) {
    console.error('Error counting Jira tickets:', error);
    return { assigned: 0, total: 0 };
  }
}

/**
 * Get Anthropic configuration from database (API key and model)
 */
async function getAnthropicConfig() {
  const [apiKeyConfig, modelConfig] = await Promise.all([
    prisma.config.findUnique({ where: { key: 'anthropic_api_key' } }),
    prisma.config.findUnique({ where: { key: 'anthropic_model' } }),
  ]);

  if (!apiKeyConfig?.value) {
    throw new Error('Anthropic API key not configured. Please configure in Settings.');
  }

  const apiKey = JSON.parse(apiKeyConfig.value);
  const model = modelConfig?.value ? JSON.parse(modelConfig.value) : 'claude-sonnet-4-5-20250929';

  const anthropic = createAnthropic({ apiKey });
  return { anthropic, model };
}

interface AgentSyncConfig {
  agentType: 'github' | 'jira';
  startDate?: string;
  endDate?: string;
  username?: string;
  repositories?: string[];
  projects?: string[];
  dryRun?: boolean;
  updateExisting?: boolean;
}

/**
 * Process an agent-based GitHub sync job
 */
export async function processAgentGitHubSync(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.config) {
    throw new Error(`Job ${jobId} not found or has no config`);
  }

  const config = JSON.parse(job.config) as AgentSyncConfig;
  const logger = new JobLogger(jobId);
  const progressTracker = new SyncProgressTracker(logger, 25, 90);

  try {
    await logger.setStatus('RUNNING');
    await logger.info('Starting agent-based GitHub sync');
    await logger.updateProgress(5, 'Initializing...');

    // Load configuration from database
    const [githubConfig, reposConfig, userContextConfig, githubUsernameConfig] = await Promise.all([
      prisma.config.findUnique({ where: { key: 'github_token' } }),
      prisma.config.findUnique({ where: { key: 'selected_repos' } }),
      prisma.config.findUnique({ where: { key: 'user_context' } }),
      prisma.config.findUnique({ where: { key: 'github_username' } }),
    ]);

    if (!githubConfig?.value) {
      throw new Error('GitHub token not configured');
    }

    const githubToken = JSON.parse(githubConfig.value);

    // Parse config values
    const repositories =
      config.repositories ||
      (reposConfig?.value ? JSON.parse(reposConfig.value) : []);
    const userContext = userContextConfig?.value
      ? JSON.parse(userContextConfig.value)
      : '';

    // Get username from config, user context, or fetch from GitHub API
    let username = config.username ||
      (githubUsernameConfig?.value ? JSON.parse(githubUsernameConfig.value) : null) ||
      extractUsername(userContext);

    if (!username || username === 'unknown') {
      await logger.info('Fetching GitHub username from token...');
      username = await getGitHubUsername(githubToken);
    }

    await logger.info(`Syncing for user: ${username}`);
    await logger.info(`Repositories: ${repositories.join(', ') || 'all'}`);
    await logger.updateProgress(10, 'Loading configuration...');

    // Query GitHub to get total count of PRs to sync
    await logger.info('Discovering PRs to sync...');
    await logger.setStatusMessage('Discovering PRs...');
    const prCounts = await getGitHubPRCount(
      githubToken,
      username,
      repositories,
      config.startDate
    );
    await logger.info(`Found ${prCounts.authored} authored PRs, ${prCounts.reviewed} reviewed PRs (${prCounts.total} total)`);
    progressTracker.setTotalItems(prCounts.total, 'PRs');
    await logger.updateProgress(20, `Found ${prCounts.total} PRs to sync`);

    // Build the prompt for the agent
    const prompt = buildGitHubSyncPrompt({
      username,
      repositories,
      startDate: config.startDate,
      endDate: config.endDate,
      dryRun: config.dryRun,
      updateExisting: config.updateExisting,
    });

    await logger.info('Invoking GitHub sync agent...');
    await logger.updateProgress(25, 'Starting AI agent...');

    // Get Anthropic client and model from database config
    const { anthropic, model } = await getAnthropicConfig();
    await logger.info(`Using model: ${model}`);
    await logger.setStatusMessage('Syncing PRs...');

    // Run the agent
    // Each PR needs ~8 tool calls, so allow enough steps for all PRs
    const maxSteps = Math.max(500, prCounts.total * 10);
    const result = await generateText({
      model: anthropic(model),
      system: githubSyncAgent.system,
      tools: githubSyncAgent.tools,
      stopWhen: stepCountIs(maxSteps),
      prompt,
      onStepFinish: async ({ toolCalls, toolResults }) => {
        // Log progress as agent works with context
        if (toolCalls && toolCalls.length > 0) {
          for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i] as { toolName: string; args?: Record<string, unknown>; input?: Record<string, unknown> };
            const callResultWrapper = toolResults?.[i] as { output?: unknown } | undefined;
            // In AI SDK v5/v6, toolResults items are wrapped: { type, toolCallId, toolName, input, output, dynamic }
            // The actual result is in .output
            const callResult = callResultWrapper?.output;

            // Try both 'input' (v5+) and 'args' (v4) for compatibility
            const toolInput = call.input || call.args || {};
            const logMessage = formatToolLog(call.toolName, toolInput, callResult);
            await logger.info(logMessage);

            // Update progress when a PR is saved (main progress indicator)
            if (call.toolName === 'saveGitHubPR' || call.toolName === 'saveEvidence') {
              const res = callResult as Record<string, unknown> | undefined;
              if (res?.success) {
                await progressTracker.incrementProcessed();
              }
            }
          }
        }
      },
    });

    await logger.updateProgress(90);

    // Parse and store results
    const syncResults = {
      agentResponse: result.text,
      toolCalls: result.steps?.flatMap((s) => s.toolCalls) || [],
      usage: result.usage,
    };

    await logger.setResult(syncResults);
    await logger.updateProgress(100);
    await logger.setStatus('COMPLETED');
    await logger.info('Agent-based GitHub sync completed');

    return syncResults;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.error(`Agent sync failed: ${message}`);
    await logger.setError(message);
    await logger.setStatus('FAILED');
    throw error;
  }
}

/**
 * Process an agent-based Jira sync job
 */
export async function processAgentJiraSync(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.config) {
    throw new Error(`Job ${jobId} not found or has no config`);
  }

  const config = JSON.parse(job.config) as AgentSyncConfig;
  const logger = new JobLogger(jobId);
  const progressTracker = new SyncProgressTracker(logger, 25, 90);

  try {
    await logger.setStatus('RUNNING');
    await logger.info('Starting agent-based Jira sync');
    await logger.updateProgress(5, 'Initializing...');

    // Load configuration from database
    const [jiraHostConfig, jiraEmailConfig, jiraTokenConfig, projectsConfig] =
      await Promise.all([
        prisma.config.findUnique({ where: { key: 'jira_host' } }),
        prisma.config.findUnique({ where: { key: 'jira_email' } }),
        prisma.config.findUnique({ where: { key: 'jira_api_token' } }),
        prisma.config.findUnique({ where: { key: 'jira_projects' } }),
      ]);

    if (!jiraHostConfig?.value || !jiraEmailConfig?.value || !jiraTokenConfig?.value) {
      throw new Error('Jira credentials not fully configured');
    }

    const jiraHost = JSON.parse(jiraHostConfig.value);
    const jiraEmail = JSON.parse(jiraEmailConfig.value);
    const jiraToken = JSON.parse(jiraTokenConfig.value);
    const projects =
      config.projects ||
      (projectsConfig?.value ? JSON.parse(projectsConfig.value) : []);

    await logger.info(`User email: ${jiraEmail}`);
    await logger.info(`Projects: ${projects.join(', ') || 'all'}`);
    await logger.updateProgress(10, 'Loading configuration...');

    // Query Jira to get total count of tickets to sync
    await logger.info('Discovering Jira tickets to sync...');
    await logger.setStatusMessage('Discovering tickets...');
    const ticketCounts = await getJiraTicketCount(
      jiraHost,
      jiraEmail,
      jiraToken,
      projects,
      config.startDate
    );
    await logger.info(`Found ${ticketCounts.total} tickets to sync`);
    progressTracker.setTotalItems(ticketCounts.total, 'tickets');
    await logger.updateProgress(20, `Found ${ticketCounts.total} tickets to sync`);

    // Build the prompt for the agent
    const prompt = buildJiraSyncPrompt({
      email: jiraEmail,
      projects,
      startDate: config.startDate,
      endDate: config.endDate,
      dryRun: config.dryRun,
      updateExisting: config.updateExisting,
    });

    await logger.info('Invoking Jira sync agent...');
    await logger.updateProgress(25, 'Starting AI agent...');

    // Get Anthropic client and model from database config
    const { anthropic, model } = await getAnthropicConfig();
    await logger.info(`Using model: ${model}`);
    await logger.setStatusMessage('Syncing tickets...');

    // Run the agent
    // Each ticket needs ~8 tool calls, so allow enough steps for all tickets
    const maxSteps = Math.max(500, ticketCounts.total * 10);
    const result = await generateText({
      model: anthropic(model),
      system: jiraSyncAgent.system,
      tools: jiraSyncAgent.tools,
      stopWhen: stepCountIs(maxSteps),
      prompt,
      onStepFinish: async ({ toolCalls, toolResults }) => {
        if (toolCalls && toolCalls.length > 0) {
          for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i] as { toolName: string; args?: Record<string, unknown>; input?: Record<string, unknown> };
            const callResultWrapper = toolResults?.[i] as { output?: unknown } | undefined;
            // In AI SDK v5/v6, toolResults items are wrapped: { type, toolCallId, toolName, input, output, dynamic }
            // The actual result is in .output
            const callResult = callResultWrapper?.output;

            // Try both 'input' (v5+) and 'args' (v4) for compatibility
            const toolInput = call.input || call.args || {};
            const logMessage = formatToolLog(call.toolName, toolInput, callResult);
            await logger.info(logMessage);

            // Update progress when a ticket is saved (main progress indicator)
            if (call.toolName === 'saveJiraTicket' || call.toolName === 'saveEvidence') {
              const res = callResult as Record<string, unknown> | undefined;
              if (res?.success) {
                await progressTracker.incrementProcessed();
              }
            }
          }
        }
      },
    });

    await logger.updateProgress(90);

    const syncResults = {
      agentResponse: result.text,
      toolCalls: result.steps?.flatMap((s) => s.toolCalls) || [],
      usage: result.usage,
    };

    await logger.setResult(syncResults);
    await logger.updateProgress(100);
    await logger.setStatus('COMPLETED');
    await logger.info('Agent-based Jira sync completed');

    return syncResults;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.error(`Agent sync failed: ${message}`);
    await logger.setError(message);
    await logger.setStatus('FAILED');
    throw error;
  }
}

/**
 * Build the prompt for GitHub sync agent
 */
function buildGitHubSyncPrompt(options: {
  username: string;
  repositories: string[];
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
  updateExisting?: boolean;
}): string {
  const dateRange = options.startDate && options.endDate
    ? `from ${options.startDate} to ${options.endDate}`
    : options.startDate
      ? `since ${options.startDate}`
      : 'for the last year';

  const existingBehavior = options.updateExisting
    ? 'If a PR already exists in the database, re-fetch its details and UPDATE the existing record with fresh data.'
    : 'If a PR already exists in the database, SKIP it and move to the next one.';

  return `Please sync GitHub data for user "${options.username}" ${dateRange}.

${options.repositories.length > 0
    ? `Focus on these repositories: ${options.repositories.join(', ')}`
    : 'Search across all repositories the user has contributed to.'}

${options.dryRun ? 'This is a DRY RUN - do not save any data to the database, just report what would be synced.' : ''}

**Existing Records:** ${existingBehavior}

Steps to follow:
1. Search for PRs authored by the user in the date range
2. Search for PRs reviewed by the user in the date range
3. For each PR found, check if it already exists in our database
4. ${options.updateExisting ? 'For ALL PRs (new and existing)' : 'For new PRs only'}, fetch full details including code stats and files
5. Extract Jira keys from PR titles and bodies
6. Extract component areas from file paths
7. Generate a summary and categorize the work
8. Estimate the scope (small/medium/large)
9. Save the PR record with saveGitHubPR (note the returned prId)
10. Save the evidence record with saveEvidence (note the returned evidenceId)
11. **CRITICAL: Run matchCriteria** with the summary, category, prTitle, and prBody to find performance criteria matches
12. **CRITICAL: Run saveCriteriaMatches** with the evidenceId and matches array from matchCriteria
13. Link PRs to Jira tickets if applicable

IMPORTANT: Steps 11 and 12 are REQUIRED for every PR. Performance criteria matching is essential for evidence to be useful in reviews.

Please proceed with the sync and report your progress.`;
}

/**
 * Build the prompt for Jira sync agent
 */
function buildJiraSyncPrompt(options: {
  email: string;
  projects: string[];
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
  updateExisting?: boolean;
}): string {
  const dateRange = options.startDate && options.endDate
    ? `from ${options.startDate} to ${options.endDate}`
    : options.startDate
      ? `since ${options.startDate}`
      : 'for the last year';

  const existingBehavior = options.updateExisting
    ? 'If a ticket already exists in the database, re-fetch its details and UPDATE the existing record with fresh data.'
    : 'If a ticket already exists in the database, SKIP it and move to the next one.';

  return `Please sync Jira ticket data for user "${options.email}" ${dateRange}.

${options.projects.length > 0
    ? `Focus on these projects: ${options.projects.join(', ')}`
    : 'Search across all accessible projects.'}

${options.dryRun ? 'This is a DRY RUN - do not save any data to the database, just report what would be synced.' : ''}

**Existing Records:** ${existingBehavior}

IMPORTANT: When searching for tickets, use the email "${options.email}" as the user identifier.

Steps to follow:
1. Search for tickets assigned to the user (email: ${options.email}) in the date range
2. Search for tickets where the user is a reviewer/watcher
3. For each ticket, check if it already exists in our database
4. ${options.updateExisting ? 'For ALL tickets (new and existing)' : 'For new tickets only'}, fetch full details including story points and epic context
5. Extract links (Figma, Confluence, etc.) from descriptions
6. Generate a summary and categorize the work
7. Calculate duration from created to resolved
8. Estimate scope based on story points and duration
9. Save the ticket record with saveJiraTicket (note the returned ticketId)
10. Save the evidence record with saveEvidence (note the returned evidenceId)
11. **CRITICAL: Run matchCriteria** with the summary, category, jiraSummary, and jiraDescription to find performance criteria matches
12. **CRITICAL: Run saveCriteriaMatches** with the evidenceId and matches array from matchCriteria
13. Link tickets to related PRs if found

IMPORTANT: Steps 11 and 12 are REQUIRED for every ticket. Performance criteria matching is essential for evidence to be useful in reviews.

Please proceed with the sync and report your progress.`;
}

/**
 * Extract GitHub username from user context string
 */
function extractUsername(userContext: string): string {
  // Try to extract username from common patterns
  const patterns = [
    /github\.com\/([a-zA-Z0-9-]+)/,
    /username[:\s]+([a-zA-Z0-9-]+)/i,
    /github[:\s]+([a-zA-Z0-9-]+)/i,
    /@([a-zA-Z0-9-]+)/,
  ];

  for (const pattern of patterns) {
    const match = userContext.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return 'unknown';
}
