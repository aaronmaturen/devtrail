import { Anthropic } from '@anthropic-ai/sdk';
import { Version3Client } from 'jira.js';
import { prisma } from '../db/prisma';

// Types
interface SyncJobConfig {
  projects: string[];
  startDate?: string;
  endDate?: string;
  jiraHost: string;
  jiraEmail: string;
  jiraApiToken: string;
  anthropicApiKey?: string;
  userContext?: string;
  dryRun?: boolean;
}

interface ClaudeMatch {
  criterion_id: string;
  confidence: number;
  evidence: string;
}

interface JobProgress {
  currentProject?: string;
  currentIssue?: string;
  totalIssues?: number;
  processedIssues?: number;
}

// Call Claude AI to analyze Jira issue
async function callClaude({
  issue,
  criteria,
  anthropicApiKey,
  userContext,
}: {
  issue: any;
  criteria: any[];
  anthropicApiKey: string;
  userContext: string;
}): Promise<ClaudeMatch[]> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const prompt = `You are an expert reviewer helping a developer with the following context:

${userContext}

You need to analyze a Jira issue and match it against specific criteria. Be thorough in your analysis and look for concrete evidence in the issue details, description, and comments.

---
ISSUE DETAILS
Key: ${issue.key}
Type: ${issue.fields.issuetype?.name}
Status: ${issue.fields.status?.name}
Priority: ${issue.fields.priority?.name || 'None'}
Summary: ${issue.fields.summary}

Description:
${issue.fields.description || 'No description provided'}

Comments:
${issue.comments || 'No comments'}

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
1. Carefully analyze the issue details, description, and comments
2. Look for evidence of the developer demonstrating skills related to ANY of the criteria
3. Even if the evidence is subtle, identify matches when they exist
4. Consider these common patterns that might match criteria:
   - Bug fixes often demonstrate debugging skills (criteria 5-6)
   - Issues with documentation show communication skills
   - Complex issues may show architecture or design skills (criteria 7-8)
   - Security-related issues match security criteria (criterion 9)
   - Issues involving team coordination match leadership criteria
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

// Main Jira sync worker function
export async function processJiraSyncJob(jobId: string): Promise<void> {
  let job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== 'PENDING') {
    throw new Error(`Job ${jobId} is not in PENDING state`);
  }

  const config: SyncJobConfig = JSON.parse(job.config || '{}');

  if (!config.jiraHost || !config.jiraEmail || !config.jiraApiToken) {
    throw new Error('Jira credentials are required');
  }

  if (!config.projects || config.projects.length === 0) {
    throw new Error('At least one Jira project is required');
  }

  // Mark job as running
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  await addJobLog(jobId, 'info', 'Starting Jira sync job');

  try {
    // Initialize Jira client
    const jira = new Version3Client({
      host: `https://${config.jiraHost}`,
      authentication: {
        basic: {
          email: config.jiraEmail,
          apiToken: config.jiraApiToken,
        },
      },
    });

    // Load PR-detectable criteria (same criteria used for GitHub PRs)
    const criteria = await prisma.criterion.findMany({
      where: { prDetectable: true },
    });
    await addJobLog(jobId, 'info', `Loaded ${criteria.length} detectable criteria`);

    // Calculate date range
    const endDate = config.endDate ? new Date(config.endDate) : new Date();
    const startDate = config.startDate
      ? new Date(config.startDate)
      : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

    await addJobLog(
      jobId,
      'info',
      `Filtering issues between ${startDate.toISOString()} and ${endDate.toISOString()}`
    );

    let totalProcessed = 0;
    let totalSkipped = 0;
    const projectResults: Record<string, number> = {};

    // Process each project
    for (let projectIndex = 0; projectIndex < config.projects.length; projectIndex++) {
      const projectKey = config.projects[projectIndex];
      await addJobLog(jobId, 'info', `Processing Jira project: ${projectKey}`);

      projectResults[projectKey] = 0;

      try {
        // Build JQL query to fetch issues
        // We want issues that were updated in the date range
        const jql = `project = ${projectKey} AND updated >= "${startDate.toISOString().split('T')[0]}" AND updated <= "${endDate.toISOString().split('T')[0]}" ORDER BY updated DESC`;

        let allIssues: any[] = [];
        const maxResults = 50;
        const fields = [
          'summary',
          'description',
          'status',
          'issuetype',
          'priority',
          'created',
          'updated',
          'assignee',
          'creator',
          'comment',
        ];

        // Paginate through all issues using nextPageToken
        let nextPageToken: string | undefined;

        while (true) {
          const response = await jira.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
            jql,
            maxResults,
            fields,
            nextPageToken,
          });

          allIssues = allIssues.concat(response.issues || []);

          if (!response.nextPageToken) {
            break;
          }

          nextPageToken = response.nextPageToken;
        }

        await addJobLog(jobId, 'info', `Found ${allIssues.length} issues in ${projectKey}`);

        // Apply dry run limit
        let issues = allIssues;
        if (config.dryRun && issues.length > 5) {
          await addJobLog(
            jobId,
            'info',
            `Dry run: limiting to 5 most recent issues (from ${issues.length})`
          );
          issues = issues.slice(0, 5);
        }

        // Process each issue
        for (let issueIndex = 0; issueIndex < issues.length; issueIndex++) {
          const issue = issues[issueIndex];

          // Update progress
          const overallProgress = Math.round(
            ((projectIndex * 100 + (issueIndex / issues.length) * 100) /
              config.projects.length)
          );
          await updateJobProgress(jobId, overallProgress, {
            currentProject: projectKey,
            currentIssue: issue.key,
            totalIssues: issues.length,
            processedIssues: issueIndex + 1,
          });

          // Check if issue already exists
          const existingEvidence = await prisma.evidenceEntry.findFirst({
            where: {
              type: 'JIRA',
              title: issue.key,
            },
          });

          if (existingEvidence) {
            await addJobLog(
              jobId,
              'debug',
              `Issue ${issue.key} already exists, skipping`
            );
            totalSkipped++;
            continue;
          }

          // Extract comments
          const comments = issue.fields.comment?.comments
            ?.map((c: any) => c.body || '')
            .join('\n\n') || '';

          // Analyze with Claude if API key provided
          let matches: ClaudeMatch[] = [];
          if (config.anthropicApiKey) {
            await addJobLog(
              jobId,
              'info',
              `Analyzing issue ${issue.key} with Claude AI`
            );

            try {
              matches = await callClaude({
                issue: {
                  ...issue,
                  comments,
                },
                criteria,
                anthropicApiKey: config.anthropicApiKey,
                userContext:
                  config.userContext ||
                  'I am a senior developer content in my job with a great manager that supports me.',
              });
            } catch (error) {
              await addJobLog(
                jobId,
                'warn',
                `Claude analysis failed for issue ${issue.key}: ${error}`
              );
            }
          }

          // Store evidence in database
          const evidenceContent = {
            key: issue.key,
            summary: issue.fields.summary,
            description: issue.fields.description || '',
            status: issue.fields.status?.name,
            issuetype: issue.fields.issuetype?.name,
            priority: issue.fields.priority?.name,
            comments: comments,
            assignee: issue.fields.assignee?.displayName,
            creator: issue.fields.creator?.displayName,
            created: issue.fields.created,
            updated: issue.fields.updated,
          };

          const evidenceEntry = await prisma.evidenceEntry.create({
            data: {
              type: 'JIRA',
              title: issue.key,
              description: issue.fields.summary,
              content: JSON.stringify(evidenceContent),
              timestamp: new Date(issue.fields.updated),
              // Store Jira-specific fields in content, but use title for the key
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
            `Processed issue ${issue.key}: ${issue.fields.summary} | Criteria: ${
              matches.length > 0
                ? matches.map((m) => m.criterion_id).join(', ')
                : 'None'
            }`
          );

          totalProcessed++;
          projectResults[projectKey]++;

          // Rate limiting delay
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        await addJobLog(
          jobId,
          'error',
          `Error processing project ${projectKey}: ${error}`
        );
      }
    }

    // Mark job as completed
    const result = {
      totalProcessed,
      totalSkipped,
      projects: projectResults,
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
      `Sync completed: ${totalProcessed} issues processed, ${totalSkipped} skipped`
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
