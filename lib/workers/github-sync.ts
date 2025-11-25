import { Octokit } from 'octokit';
import { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '../db/prisma';

// Types
interface SyncJobConfig {
  repositories: string[];
  startDate?: string;
  endDate?: string;
  githubToken: string;
  anthropicApiKey?: string;
  userContext?: string;
  dryRun?: boolean;
}

interface PRComponent {
  name: string;
  count: number;
  depth: number;
}

interface ClaudeMatch {
  criterion_id: string;
  confidence: number;
  evidence: string;
}

interface JobProgress {
  currentRepo?: string;
  currentPR?: number;
  totalPRs?: number;
  processedPRs?: number;
}

// Extract components/domains from file paths
function extractComponents(filePaths: string[]): PRComponent[] {
  const components: Record<string, number> = {};
  const pathDepths: Record<string, number> = {};

  filePaths.forEach((filePath) => {
    if (!filePath) return;

    const segments = filePath.split('/');

    if (segments.length <= 1) {
      if (!components['root']) components['root'] = 0;
      components['root']++;
      return;
    }

    for (let i = 1; i <= segments.length - 1; i++) {
      const pathPrefix = segments.slice(0, i).join('/');
      if (!pathDepths[pathPrefix] || i > pathDepths[pathPrefix]) {
        pathDepths[pathPrefix] = i;
      }

      if (!components[pathPrefix]) components[pathPrefix] = 0;
      components[pathPrefix]++;
    }

    // Frontend component directories
    const frontendPatterns = [
      { base: 'src/components', depth: 3 },
      { base: 'app/components', depth: 3 },
      { base: 'src/pages', depth: 3 },
      { base: 'src/views', depth: 3 },
      { base: 'src/containers', depth: 3 },
      { base: 'src/features', depth: 3 },
      { base: 'components', depth: 2 },
    ];

    frontendPatterns.forEach((pattern) => {
      const baseSegments = pattern.base.split('/');
      const matchIndex = segments.findIndex((seg, i) => {
        if (i + baseSegments.length > segments.length) return false;
        return baseSegments.every((baseSeg, j) => segments[i + j] === baseSeg);
      });

      if (matchIndex >= 0 && segments.length > matchIndex + baseSegments.length) {
        const componentName = segments
          .slice(matchIndex, matchIndex + baseSegments.length + 1)
          .join('/');
        if (!components[componentName]) components[componentName] = 0;
        components[componentName] += 2;
      }
    });

    // Backend component directories
    const backendPatterns = [
      'controllers',
      'routes',
      'models',
      'services',
      'api',
      'middleware',
    ];

    backendPatterns.forEach((pattern) => {
      const index = segments.findIndex((s) => s === pattern);
      if (index >= 0 && index < segments.length - 1) {
        const componentPath = segments.slice(index, index + 2).join('/');
        if (!components[componentPath]) components[componentPath] = 0;
        components[componentPath] += 2;
      }
    });

    // Significant file extensions
    const significantFileExtensions = [
      '.component.ts',
      '.component.js',
      '.controller.ts',
      '.controller.js',
      '.service.ts',
      '.service.js',
    ];
    const lastSegment = segments[segments.length - 1];

    if (significantFileExtensions.some((ext) => lastSegment.endsWith(ext))) {
      const dirPath = segments.slice(0, segments.length - 1).join('/');
      if (!components[dirPath]) components[dirPath] = 0;
      components[dirPath] += 3;
    }
  });

  // Prioritize deeper paths and more frequent occurrences
  const weightedComponents = Object.entries(components).map(([path, count]) => {
    const depth = (path.match(/\//g) || []).length + 1;
    const weight = count * (depth * 0.5);
    return { path, count, depth, weight };
  });

  return weightedComponents
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map(({ path, count, depth }) => ({ name: path, count, depth }));
}

// Call Claude AI to analyze PR
async function callClaude({
  pr,
  comments,
  filenames,
  criteria,
  jiraInfo,
  anthropicApiKey,
  userContext,
  components,
}: {
  pr: any;
  comments: string;
  filenames: string;
  criteria: any[];
  jiraInfo: string;
  anthropicApiKey: string;
  userContext: string;
  components: PRComponent[];
}): Promise<ClaudeMatch[]> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Extract file extensions
  const fileExtensions = filenames
    .split('\n')
    .map((file) => {
      const parts = file.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    })
    .filter((ext) => ext)
    .reduce((acc: Record<string, number>, ext) => {
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {});

  const topExtensions = Object.entries(fileExtensions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext, count]) => `${ext} (${count})`)
    .join(', ');

  const prompt = `You are an expert reviewer helping a developer with the following context:

${userContext}

You need to analyze a GitHub pull request and match it against specific criteria. Be thorough in your analysis and look for concrete evidence in the PR details, file paths, components, and Jira information.

---
PR DETAILS
Title: ${pr.title}
Description: ${pr.body || 'No description provided'}

Comments:
${comments || 'No comments'}

File Types: ${topExtensions}

Changed Files:
${filenames}

Components: ${JSON.stringify(components)}

---
JIRA TICKET INFO:
${jiraInfo || 'None'}

---
REVIEW CRITERIA:
${criteria
  .map(
    (c) =>
      `${c.id}: [${c.areaOfConcentration} > ${c.subarea}] ${c.description}`
  )
  .join('\n')}

---
INSTRUCTIONS:
1. Carefully analyze the PR details, file paths, components, and Jira information
2. Look for evidence of the developer demonstrating skills related to ANY of the criteria
3. Even if the evidence is subtle, identify matches when they exist
4. Consider these common patterns that might match criteria:
   - Bug fixes often demonstrate debugging skills (criteria 5-6)
   - Code with tests shows quality focus (criteria 3-4)
   - Complex PRs with many components may show architecture skills (criteria 7-8)
   - PRs with security fixes match security criteria (criterion 9)
   - PRs with mentoring in comments match staff engineer criteria (criteria 1-2)
5. Assign a confidence score (0-100) for each match
6. Try to find at least one matching criterion if possible
7. Return up to 3 of the strongest matches

Reply in this exact JSON format:
{
  "matches": [
    {
      "criterion_id": "<id>",
      "confidence": <score 0-100>,
      "evidence": "<detailed explanation with specific evidence>"
    },
    ...
  ]
}

If no criteria match, return an empty array for matches: {"matches": []}`;

  const completion = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  let matches: ClaudeMatch[] = [];
  try {
    const firstContent = completion.content[0];
    if (firstContent.type !== 'text') {
      return matches;
    }

    let responseText = firstContent.text.trim();

    // Extract JSON if embedded in other text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/m);
    if (jsonMatch) {
      responseText = jsonMatch[0];
    }

    const response = JSON.parse(responseText);

    if (response && Array.isArray(response.matches)) {
      matches = response.matches;
    } else if (response && response.criterion_id) {
      // Handle old format for backward compatibility
      matches = [
        {
          criterion_id: response.criterion_id,
          confidence: 100,
          evidence: response.evidence,
        },
      ];
    }
  } catch (e) {
    console.error('Failed to parse Claude response:', e);
    matches = [];
  }

  return matches;
}

// Add log to job
async function addJobLog(
  jobId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  const logs = JSON.parse(job.logs || '[]');
  logs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
  });

  await prisma.job.update({
    where: { id: jobId },
    data: { logs: JSON.stringify(logs) },
  });
}

// Update job progress
async function updateJobProgress(
  jobId: string,
  progress: number,
  progressData?: JobProgress
) {
  const updates: any = { progress };

  if (progressData) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (job?.config) {
      const config = JSON.parse(job.config);
      config._progress = progressData;
      updates.config = JSON.stringify(config);
    }
  }

  await prisma.job.update({
    where: { id: jobId },
    data: updates,
  });
}

// Main GitHub sync worker function
export async function processGitHubSyncJob(jobId: string): Promise<void> {
  let job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== 'PENDING') {
    throw new Error(`Job ${jobId} is not in PENDING state`);
  }

  const config: SyncJobConfig = JSON.parse(job.config || '{}');

  if (!config.githubToken) {
    throw new Error('GitHub token is required');
  }

  // Mark job as running
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  await addJobLog(jobId, 'info', 'Starting GitHub sync job');

  try {
    const octokit = new Octokit({ auth: config.githubToken });

    // Get authenticated user
    await addJobLog(jobId, 'info', 'Authenticating with GitHub');
    const me = await octokit.rest.users.getAuthenticated();
    const myLogin = me.data.login;
    await addJobLog(jobId, 'info', `Authenticated as ${myLogin}`);

    // Load PR-detectable criteria
    const criteria = await prisma.criterion.findMany({
      where: { prDetectable: true },
    });
    await addJobLog(jobId, 'info', `Loaded ${criteria.length} PR-detectable criteria`);

    // Calculate date range
    const endDate = config.endDate ? new Date(config.endDate) : new Date();
    const startDate = config.startDate
      ? new Date(config.startDate)
      : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

    await addJobLog(
      jobId,
      'info',
      `Filtering PRs between ${startDate.toISOString()} and ${endDate.toISOString()}`
    );

    let totalProcessed = 0;
    let totalSkipped = 0;
    const repoResults: Record<string, number> = {};

    // Process each repository
    for (let repoIndex = 0; repoIndex < config.repositories.length; repoIndex++) {
      const repo = config.repositories[repoIndex];
      await addJobLog(jobId, 'info', `Processing repository: ${repo}`);

      const [owner, repoName] = repo.split('/');
      repoResults[repo] = 0;

      try {
        // Fetch merged PRs
        let prs = await octokit.paginate(octokit.rest.pulls.list, {
          owner,
          repo: repoName,
          state: 'closed',
          per_page: 100,
        });

        // Filter to merged PRs within date range
        prs = prs.filter((pr: any) => {
          return (
            pr.state === 'closed' &&
            pr.merged_at &&
            new Date(pr.merged_at) >= startDate &&
            new Date(pr.merged_at) <= endDate
          );
        });

        // Sort by most recently merged
        prs = prs.sort((a: any, b: any) => {
          const aTime = a.merged_at ? new Date(a.merged_at).getTime() : 0;
          const bTime = b.merged_at ? new Date(b.merged_at).getTime() : 0;
          return bTime - aTime;
        });

        // Apply dry run limit
        if (config.dryRun && prs.length > 5) {
          await addJobLog(
            jobId,
            'info',
            `Dry run: limiting to 5 most recent PRs (from ${prs.length})`
          );
          prs = prs.slice(0, 5);
        }

        await addJobLog(jobId, 'info', `Found ${prs.length} merged PRs in ${repo}`);

        // Process each PR
        for (let prIndex = 0; prIndex < prs.length; prIndex++) {
          const pr = prs[prIndex];

          // Update progress
          const overallProgress = Math.round(
            ((repoIndex * 100 + (prIndex / prs.length) * 100) /
              config.repositories.length)
          );
          await updateJobProgress(jobId, overallProgress, {
            currentRepo: repo,
            currentPR: pr.number,
            totalPRs: prs.length,
            processedPRs: prIndex + 1,
          });

          // Check if PR already exists
          const existingEvidence = await prisma.evidenceEntry.findFirst({
            where: {
              type: 'PR',
              prNumber: pr.number,
              repository: repo,
            },
          });

          if (existingEvidence) {
            await addJobLog(
              jobId,
              'debug',
              `PR #${pr.number} already exists, skipping`
            );
            totalSkipped++;
            continue;
          }

          // Fetch comments
          const commentsResp = await octokit.rest.issues.listComments({
            owner,
            repo: repoName,
            issue_number: pr.number,
            per_page: 100,
          });
          const commentsArr = commentsResp.data;
          const comments = commentsArr.map((c: any) => c.body || '').join('\n');

          // Check if user interacted with this PR
          const interacted =
            (pr.user && pr.user.login === myLogin) ||
            commentsArr.some((c: any) => c.user && c.user.login === myLogin);

          if (!interacted) {
            await addJobLog(
              jobId,
              'debug',
              `PR #${pr.number}: No interaction by ${myLogin}, skipping`
            );
            totalSkipped++;
            continue;
          }

          // Fetch files
          const filesResp = await octokit.rest.pulls.listFiles({
            owner,
            repo: repoName,
            pull_number: pr.number,
            per_page: 100,
          });
          const filenames = filesResp.data.map((f: any) => f.filename).join('\n');
          const filePathsArray = filesResp.data.map((f: any) => f.filename);
          const components = extractComponents(filePathsArray);

          // Calculate PR metrics
          const prCreatedAt = new Date(pr.created_at);
          const prMergedAt = pr.merged_at ? new Date(pr.merged_at) : new Date();
          const prDurationDays = Math.round(
            (prMergedAt.getTime() - prCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Analyze with Claude if API key provided
          let matches: ClaudeMatch[] = [];
          if (config.anthropicApiKey) {
            await addJobLog(
              jobId,
              'info',
              `Analyzing PR #${pr.number} with Claude AI`
            );

            try {
              matches = await callClaude({
                pr,
                comments,
                filenames,
                criteria,
                jiraInfo: '', // TODO: Add Jira integration if needed
                anthropicApiKey: config.anthropicApiKey,
                userContext:
                  config.userContext ||
                  'I am a senior developer content in my job with a great manager that supports me.',
                components,
              });
            } catch (error) {
              await addJobLog(
                jobId,
                'warn',
                `Claude analysis failed for PR #${pr.number}: ${error}`
              );
            }
          }

          // Store evidence in database
          const evidenceContent = {
            body: pr.body || '',
            comments: comments,
            files: filePathsArray,
            duration_days: prDurationDays,
            user: pr.user?.login || '',
            state: pr.state,
          };

          // Calculate PR size metrics
          const additions = filesResp.data.reduce((sum: number, f: any) => sum + (f.additions || 0), 0);
          const deletions = filesResp.data.reduce((sum: number, f: any) => sum + (f.deletions || 0), 0);
          const changedFiles = filesResp.data.length;

          const evidenceEntry = await prisma.evidenceEntry.create({
            data: {
              type: 'PR',
              title: pr.title,
              description: pr.body || '',
              content: JSON.stringify(evidenceContent),
              timestamp: prMergedAt,
              prNumber: pr.number,
              prUrl: pr.html_url,
              repository: repo,
              mergedAt: prMergedAt,
              additions,
              deletions,
              changedFiles,
              components: JSON.stringify(components),
            },
          });

          // Link criteria
          for (const match of matches) {
            const criterionId = parseInt(match.criterion_id);
            if (isNaN(criterionId)) continue;

            await prisma.evidenceCriterion.create({
              data: {
                evidenceId: evidenceEntry.id,
                criterionId,
                confidence: match.confidence / 100, // Store as 0-1
                explanation: match.evidence,
              },
            });
          }

          await addJobLog(
            jobId,
            'info',
            `Processed PR #${pr.number}: ${pr.title} | Criteria: ${
              matches.length > 0
                ? matches.map((m) => m.criterion_id).join(', ')
                : 'None'
            }`
          );

          totalProcessed++;
          repoResults[repo]++;

          // Rate limiting delay
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        await addJobLog(
          jobId,
          'error',
          `Error processing repository ${repo}: ${error}`
        );
      }
    }

    // Mark job as completed
    const result = {
      totalProcessed,
      totalSkipped,
      repositories: repoResults,
      user: myLogin,
    };

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify(result),
      },
    });

    await addJobLog(
      jobId,
      'info',
      `Sync completed: ${totalProcessed} PRs processed, ${totalSkipped} skipped`
    );
  } catch (error) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });

    await addJobLog(
      jobId,
      'error',
      `Job failed: ${error instanceof Error ? error.message : String(error)}`
    );

    throw error;
  }
}
