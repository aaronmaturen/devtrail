import { PrismaClient } from '@prisma/client';
import { Version3Client } from 'jira.js';
import { Anthropic } from '@anthropic-ai/sdk';
import { JobLogger } from '../utils/job-logger';

const prisma = new PrismaClient();

interface JiraSyncConfig {
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

export async function handleJiraSync(jobId: string, config: JiraSyncConfig) {
  const logger = new JobLogger(jobId);

  try {
    await logger.setStatus('RUNNING');
    await logger.info(`Starting Jira sync for ${config.projects.length} projects`);
    await logger.info(`Jira host: ${config.jiraHost}`);
    await logger.info(`Projects: ${config.projects.join(', ')}`);
    await logger.info(`Dry run: ${config.dryRun ? 'Yes' : 'No'}`);
    await logger.updateProgress(0);

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

    // Initialize Anthropic client if available
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
      totalIssues: 0,
      totalEvidence: 0,
      projects: {},
    };

    // Process each project
    for (let projectIndex = 0; projectIndex < config.projects.length; projectIndex++) {
      const projectKey = config.projects[projectIndex];

      await logger.info(`[${projectIndex + 1}/${config.projects.length}] Processing project ${projectKey}`);

      try {
        // Fetch issues from Jira
        const issues = await fetchJiraIssues(
          jira,
          projectKey,
          startDate,
          endDate,
          config.dryRun || false,
          logger
        );
        await logger.info(`Found ${issues.length} issues in project ${projectKey}`);

        results.projects[projectKey] = {
          issues: issues.length,
          evidence: 0,
        };

        // Process each issue
        for (let issueIndex = 0; issueIndex < issues.length; issueIndex++) {
          const issue = issues[issueIndex];
          const overallProgress = ((projectIndex * 100 + (issueIndex / issues.length) * 100) / config.projects.length);
          await logger.updateProgress(Math.round(overallProgress));

          await logger.info(`[${issue.key}] Analyzing: ${issue.fields.summary}`);

          // Analyze issue with AI if available
          let evidenceCriteria: Array<{ criterionId: number; confidence: number; explanation: string }> = [];
          if (anthropic && criteria.length > 0) {
            evidenceCriteria = await analyzeIssueWithAI(
              anthropic,
              issue,
              criteria,
              config.userContext || '',
              logger
            );
            await logger.info(`[${issue.key}] Matched ${evidenceCriteria.length} criteria`);
          }

          // Create evidence entry in database
          if (!config.dryRun) {
            const evidenceEntry = await prisma.evidenceEntry.create({
              data: {
                type: 'JIRA',
                title: `${issue.key}: ${issue.fields.summary}`,
                description: issue.fields.description || '',
                content: JSON.stringify({
                  key: issue.key,
                  project: projectKey,
                  type: issue.fields.issuetype?.name,
                  status: issue.fields.status?.name,
                  priority: issue.fields.priority?.name,
                  assignee: issue.fields.assignee?.displayName,
                  reporter: issue.fields.reporter?.displayName,
                  url: `https://${config.jiraHost}/browse/${issue.key}`,
                }),
                confidence: evidenceCriteria.length > 0
                  ? evidenceCriteria.reduce((sum, e) => sum + e.confidence, 0) / evidenceCriteria.length
                  : 0,
                timestamp: issue.fields.resolutiondate
                  ? new Date(issue.fields.resolutiondate)
                  : issue.fields.updated
                  ? new Date(issue.fields.updated)
                  : new Date(),
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
            results.projects[projectKey].evidence += evidenceCriteria.length;
          }

          results.totalIssues++;
        }
      } catch (error: any) {
        await logger.error(`Error processing project ${projectKey}: ${error.message}`);
      }
    }

    await logger.updateProgress(100);
    await logger.setResult(results);
    await logger.setStatus('COMPLETED');
    await logger.info(`Sync completed: ${results.totalIssues} issues processed, ${results.totalEvidence} evidence entries created`);

    return results;
  } catch (error: any) {
    await logger.error(`Jira sync failed: ${error.message}`);
    await logger.setError(error.message);
    await logger.setStatus('FAILED');
    throw error;
  }
}

async function fetchJiraIssues(
  jira: Version3Client,
  projectKey: string,
  since: Date,
  until: Date,
  dryRun: boolean,
  logger: JobLogger
): Promise<any[]> {
  const issues: any[] = [];
  const maxResults = dryRun ? 5 : 100;

  const jql = `project = ${projectKey} AND updated >= "${since.toISOString().split('T')[0]}" AND updated <= "${until.toISOString().split('T')[0]}" ORDER BY updated DESC`;

  const fields = [
    'summary',
    'description',
    'issuetype',
    'status',
    'priority',
    'assignee',
    'reporter',
    'created',
    'updated',
    'resolutiondate',
  ];

  let nextPageToken: string | undefined;

  while (true) {
    const response = await jira.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults,
      fields,
      nextPageToken,
    });

    if (response.issues) {
      issues.push(...response.issues);
    }

    if (dryRun && issues.length >= 5) break;
    if (!response.nextPageToken) break;

    nextPageToken = response.nextPageToken;
  }

  return issues;
}

async function analyzeIssueWithAI(
  anthropic: Anthropic,
  issue: any,
  criteria: Array<{ id: number; areaOfConcentration: string; subarea: string; description: string }>,
  userContext: string,
  logger: JobLogger
): Promise<Array<{ criterionId: number; confidence: number; explanation: string }>> {
  const prompt = `You are analyzing a Jira issue for a software engineer's performance review.

${userContext ? `Context about the engineer: ${userContext}\n` : ''}
Issue Key: ${issue.key}
Summary: ${issue.fields.summary}
Description: ${issue.fields.description || 'No description provided'}
Type: ${issue.fields.issuetype?.name || 'Unknown'}
Status: ${issue.fields.status?.name || 'Unknown'}
Priority: ${issue.fields.priority?.name || 'Unknown'}

Review Criteria:
${criteria.map((c) => `${c.id}. [${c.areaOfConcentration} - ${c.subarea}] ${c.description}`).join('\n')}

For each criterion that this issue provides evidence for, respond with a JSON array of objects:
[
  {
    "criterion_id": <number>,
    "confidence": <0-100>,
    "explanation": "<brief explanation of how this issue demonstrates this criterion>"
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
      await logger.warn(`No JSON array found in AI response for issue ${issue.key}`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: any) => ({
      criterionId: item.criterion_id,
      confidence: item.confidence / 100, // Convert to 0-1 range
      explanation: item.explanation,
    }));
  } catch (error: any) {
    await logger.error(`AI analysis failed for issue ${issue.key}: ${error.message}`);
    return [];
  }
}
