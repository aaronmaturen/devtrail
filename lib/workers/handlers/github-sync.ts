import { PrismaClient } from '@prisma/client';
import { Octokit } from '@octokit/rest';
import { Anthropic } from '@anthropic-ai/sdk';
import { JobLogger } from '../utils/job-logger';
import { extractComponents } from '../utils/component-extractor';

const prisma = new PrismaClient();

interface GitHubSyncConfig {
  repositories: string[];
  startDate?: string;
  endDate?: string;
  githubToken: string;
  anthropicApiKey?: string;
  userContext?: string;
  dryRun?: boolean;
}

export async function handleGitHubSync(jobId: string, config: GitHubSyncConfig) {
  const logger = new JobLogger(jobId);

  try {
    await logger.setStatus('RUNNING');
    await logger.info(`Starting GitHub sync for ${config.repositories.length} repositories`);
    await logger.info(`Repositories: ${config.repositories.join(', ')}`);
    await logger.info(`Dry run: ${config.dryRun ? 'Yes' : 'No'}`);
    await logger.updateProgress(0);

    // Initialize clients
    const octokit = new Octokit({ auth: config.githubToken });
    const anthropic = config.anthropicApiKey
      ? new Anthropic({ apiKey: config.anthropicApiKey })
      : null;

    // Load criteria from database
    await logger.info('Loading performance review criteria');
    const criteria = await prisma.criterion.findMany({
      where: { prDetectable: true },
      select: {
        id: true,
        areaOfConcentration: true,
        subarea: true,
        description: true,
      },
    });
    await logger.info(`Loaded ${criteria.length} criteria`);

    // Calculate date range
    const endDate = config.endDate ? new Date(config.endDate) : new Date();
    const startDate = config.startDate
      ? new Date(config.startDate)
      : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

    await logger.info(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const results: any = {
      totalPRs: 0,
      totalEvidence: 0,
      repositories: {},
    };

    // Process each repository
    for (let repoIndex = 0; repoIndex < config.repositories.length; repoIndex++) {
      const repoFullName = config.repositories[repoIndex];
      const [owner, repo] = repoFullName.split('/');

      await logger.info(`[${repoIndex + 1}/${config.repositories.length}] Processing ${repoFullName}`);

      try {
        // Fetch merged PRs
        const prs = await fetchMergedPRs(octokit, owner, repo, startDate, endDate, config.dryRun || false, logger);
        await logger.info(`Found ${prs.length} merged PRs in ${repoFullName}`);

        results.repositories[repoFullName] = {
          prs: prs.length,
          evidence: 0,
        };

        // Process each PR
        for (let prIndex = 0; prIndex < prs.length; prIndex++) {
          const pr = prs[prIndex];
          const overallProgress = ((repoIndex * 100 + (prIndex / prs.length) * 100) / config.repositories.length);
          await logger.updateProgress(Math.round(overallProgress));

          await logger.info(`[${repoFullName}#${pr.number}] Analyzing: ${pr.title}`);

          // Fetch full PR details to get code change statistics
          const prDetails = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: pr.number,
          });

          // Get PR files
          const files = await fetchPRFiles(octokit, owner, repo, pr.number);
          const components = extractComponents(files.map((f: any) => f.filename));

          // Calculate metrics
          const prDurationDays = pr.merged_at && pr.created_at
            ? Math.round((new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          // Extract Jira key from title or description
          const jiraKeyMatch = (pr.title + ' ' + (pr.body || '')).match(/[A-Z]+-\d+/);
          const jiraKey = jiraKeyMatch ? jiraKeyMatch[0] : null;

          // Build metadata object
          const metadata: any = {};
          if (jiraKey) {
            metadata.jira_key = jiraKey;
            // Note: jira_type would need to be fetched from Jira API
          }

          // Analyze PR with AI if available
          let evidenceCriteria: Array<{ criterionId: number; confidence: number; explanation: string }> = [];
          if (anthropic && criteria.length > 0) {
            evidenceCriteria = await analyzePRWithAI(
              anthropic,
              pr,
              criteria,
              config.userContext || '',
              logger
            );
            await logger.info(`[${repoFullName}#${pr.number}] Matched ${evidenceCriteria.length} criteria`);
          }

          // Create evidence entry in database
          if (!config.dryRun) {
            const evidenceEntry = await prisma.evidenceEntry.create({
              data: {
                type: 'PR',
                title: pr.title,
                description: pr.body || '',
                content: JSON.stringify({
                  owner,
                  repo,
                  pr_number: pr.number,
                  url: pr.html_url,
                  user: pr.user?.login,
                }),
                confidence: evidenceCriteria.length > 0
                  ? evidenceCriteria.reduce((sum, e) => sum + e.confidence, 0) / evidenceCriteria.length
                  : 0,
                prNumber: pr.number,
                prUrl: pr.html_url,
                repository: repoFullName,
                mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
                additions: prDetails.data.additions || 0,
                deletions: prDetails.data.deletions || 0,
                changedFiles: prDetails.data.changed_files || 0,
                components: JSON.stringify(components),
                metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
                timestamp: pr.merged_at ? new Date(pr.merged_at) : new Date(),
              },
            });

            // Create evidence criteria relationships
            for (const ec of evidenceCriteria) {
              await prisma.evidenceCriterion.create({
                data: {
                  evidenceId: evidenceEntry.id,
                  criterionId: ec.criterionId,
                  confidence: ec.confidence,
                  explanation: ec.explanation,
                },
              });
            }

            results.totalEvidence += evidenceCriteria.length;
            results.repositories[repoFullName].evidence += evidenceCriteria.length;
          }

          results.totalPRs++;
        }
      } catch (error: any) {
        await logger.error(`Error processing ${repoFullName}: ${error.message}`);
      }
    }

    await logger.updateProgress(100);
    await logger.setResult(results);
    await logger.setStatus('COMPLETED');
    await logger.info(`Sync completed: ${results.totalPRs} PRs processed, ${results.totalEvidence} evidence entries created`);

    return results;
  } catch (error: any) {
    await logger.error(`GitHub sync failed: ${error.message}`);
    await logger.setError(error.message);
    await logger.setStatus('FAILED');
    throw error;
  }
}

async function fetchMergedPRs(
  octokit: Octokit,
  owner: string,
  repo: string,
  since: Date,
  until: Date,
  dryRun: boolean,
  logger: JobLogger
): Promise<any[]> {
  const prs: any[] = [];
  const perPage = dryRun ? 5 : 100; // Limit to 5 in dry run mode
  let page = 1;

  while (true) {
    const response = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: perPage,
      page,
    });

    if (response.data.length === 0) break;

    for (const pr of response.data) {
      if (!pr.merged_at) continue;

      const mergedDate = new Date(pr.merged_at);
      if (mergedDate < since) {
        return prs; // Stop if we've gone past the start date
      }
      if (mergedDate <= until) {
        prs.push(pr);
      }
    }

    if (dryRun && prs.length >= 5) break; // Dry run limit
    if (response.data.length < perPage) break;

    page++;
  }

  return prs;
}

async function fetchPRFiles(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<any[]> {
  const files: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: perPage,
      page,
    });

    files.push(...response.data);

    if (response.data.length < perPage) break;
    page++;
  }

  return files;
}

async function analyzePRWithAI(
  anthropic: Anthropic,
  pr: any,
  criteria: Array<{ id: number; areaOfConcentration: string; subarea: string; description: string }>,
  userContext: string,
  logger: JobLogger
): Promise<Array<{ criterionId: number; confidence: number; explanation: string }>> {
  const prompt = `You are analyzing a GitHub Pull Request for a software engineer's performance review.

${userContext ? `Context about the engineer: ${userContext}\n` : ''}
PR Title: ${pr.title}
PR Description: ${pr.body || 'No description provided'}
PR URL: ${pr.html_url}
Additions: ${pr.additions || 0} lines
Deletions: ${pr.deletions || 0} lines
Changed Files: ${pr.changed_files || 0}

Review Criteria:
${criteria.map((c) => `${c.id}. [${c.areaOfConcentration} - ${c.subarea}] ${c.description}`).join('\n')}

For each criterion that this PR provides evidence for, respond with a JSON array of objects:
[
  {
    "criterion_id": <number>,
    "confidence": <0-100>,
    "explanation": "<brief explanation of how this PR demonstrates this criterion>"
  }
]

Only include criteria where there is clear evidence (confidence > 40). If no criteria match, return an empty array [].

Return ONLY the JSON array, no additional text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return [];
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      await logger.warn(`No JSON array found in AI response for PR #${pr.number}`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: any) => ({
      criterionId: item.criterion_id,
      confidence: item.confidence / 100, // Convert to 0-1 range
      explanation: item.explanation,
    }));
  } catch (error: any) {
    await logger.error(`AI analysis failed for PR #${pr.number}: ${error.message}`);
    return [];
  }
}
