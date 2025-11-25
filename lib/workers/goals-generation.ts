import { prisma } from '../db/prisma';
import Anthropic from '@anthropic-ai/sdk';

export interface GoalsGenerationJobConfig {
  goalCount?: number;
  timeframe?: string; // '6-months', '1-year'
  focusAreas?: string[]; // 'development', 'leadership', 'technical', 'communication'
  includeJiraTickets?: boolean;
  anthropicApiKey?: string;
  claudeModel?: string;
  userContext?: string;
}

/**
 * Add a log entry to a job
 */
async function addJobLog(
  jobId: string,
  level: 'info' | 'warn' | 'error',
  message: string
): Promise<void> {
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

/**
 * Update job progress
 */
async function updateJobProgress(jobId: string, progress: number): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { progress },
  });
}

/**
 * Group evidence by criterion to find strengths and gaps
 */
function groupByCriterion(evidenceEntries: any[]) {
  const grouped: Record<string, any> = {};

  evidenceEntries.forEach((entry) => {
    if (entry.criteria && Array.isArray(entry.criteria)) {
      entry.criteria.forEach((ec: any) => {
        const criterionId = ec.criterion.id;

        if (!grouped[criterionId]) {
          grouped[criterionId] = {
            id: criterionId,
            area: ec.criterion.areaOfConcentration,
            subarea: ec.criterion.subarea,
            description: ec.criterion.description,
            evidence: [],
            totalConfidence: 0,
            count: 0,
            order: criterionId,
          };
        }

        grouped[criterionId].evidence.push({
          title: entry.title,
          confidence: ec.confidence || 0,
          evidence: ec.explanation,
        });

        grouped[criterionId].totalConfidence += ec.confidence || 0;
        grouped[criterionId].count += 1;
      });
    }
  });

  return grouped;
}

/**
 * Parse goal from AI response
 */
function parseGoalFromText(goalText: string, category: string): any | null {
  // Extract sections using regex
  const titleMatch = goalText.match(/##\s+(.+?)(?:\n|$)/);
  const smartMatch = goalText.match(/\*\*SMART Goal:\*\*\s+(.+?)(?:\n|$)/);
  const successMatch = goalText.match(/\*\*Success Criteria:\*\*\s+(.+?)(?:\n|$)/);
  const alignmentMatch = goalText.match(/\*\*Alignment:\*\*\s+(.+?)(?:\n|$)/);
  const timelineMatch = goalText.match(/\*\*Timeline:\*\*\s+(.+?)(?:\n|$)/);

  if (!titleMatch || !smartMatch) {
    return null; // Invalid goal format
  }

  const title = titleMatch[1].trim();
  const smartGoal = smartMatch[1].trim();
  const successCriteria = successMatch ? successMatch[1].trim() : '';
  const alignment = alignmentMatch ? alignmentMatch[1].trim() : '';
  const timeline = timelineMatch ? timelineMatch[1].trim() : '';

  // Calculate target date from timeline
  const targetDate = new Date();
  if (timeline.toLowerCase().includes('6 month')) {
    targetDate.setMonth(targetDate.getMonth() + 6);
  } else {
    targetDate.setFullYear(targetDate.getFullYear() + 1);
  }

  return {
    title,
    description: smartGoal,
    category,
    specific: smartGoal,
    measurable: successCriteria,
    achievable: alignment,
    relevant: alignment,
    timeBound: timeline,
    targetDate,
  };
}

/**
 * Main function to process GOAL_GENERATION jobs
 */
export async function processGoalGenerationJob(jobId: string): Promise<void> {
  let job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.type !== 'GOAL_GENERATION') {
    throw new Error(`Job ${jobId} is not a GOAL_GENERATION job`);
  }

  try {
    // Update job status to RUNNING
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        progress: 0,
      },
    });

    await addJobLog(jobId, 'info', 'Starting goal generation');

    // Parse job config
    const config: GoalsGenerationJobConfig = JSON.parse(job.config || '{}');
    const goalCount = config.goalCount || 3;
    const timeframe = config.timeframe || '1-year';

    await addJobLog(jobId, 'info', `Generating ${goalCount} goals for ${timeframe} timeframe`);
    await updateJobProgress(jobId, 10);

    // Get API keys from config or database
    let anthropicApiKey = config.anthropicApiKey;
    let claudeModel = config.claudeModel || 'claude-sonnet-4-20250514';
    let userContext = config.userContext;

    if (!anthropicApiKey) {
      const apiKeyConfig = await prisma.config.findUnique({
        where: { key: 'anthropic_api_key' },
      });
      if (apiKeyConfig) {
        anthropicApiKey = JSON.parse(apiKeyConfig.value);
      }
    }

    if (!claudeModel) {
      const modelConfig = await prisma.config.findUnique({
        where: { key: 'claude_model' },
      });
      if (modelConfig) {
        claudeModel = JSON.parse(modelConfig.value);
      }
    }

    if (!userContext) {
      const contextConfig = await prisma.config.findUnique({
        where: { key: 'user_context' },
      });
      if (contextConfig) {
        userContext = JSON.parse(contextConfig.value);
      }
    }

    if (!anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    await addJobLog(jobId, 'info', 'Fetching evidence and criteria...');
    await updateJobProgress(jobId, 20);

    // Fetch all evidence entries with criteria
    const evidenceEntries = await prisma.evidenceEntry.findMany({
      include: {
        criteria: {
          include: {
            criterion: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    await addJobLog(jobId, 'info', `Found ${evidenceEntries.length} evidence entries`);
    await updateJobProgress(jobId, 30);

    // Fetch all criteria
    const allCriteria = await prisma.criterion.findMany({
      orderBy: {
        id: 'asc',
      },
    });

    await addJobLog(jobId, 'info', `Loaded ${allCriteria.length} criteria`);

    // Group evidence by criterion
    const grouped = groupByCriterion(evidenceEntries);

    // Sort all criteria by ID
    const sortedCriteria = Object.values(grouped).sort((a: any, b: any) => a.order - b.order);

    // Find criteria with no or low evidence (growth areas)
    const criteriaWithNoEvidence = allCriteria.filter(
      (c) => !grouped[c.id] || grouped[c.id].count === 0
    );
    const criteriaWithLowEvidence = sortedCriteria.filter((c: any) => c.count > 0 && c.count < 3);

    // Find criteria with high evidence (strengths)
    const criteriaWithHighEvidence = sortedCriteria
      .filter((c: any) => c.count >= 5)
      .sort((a: any, b: any) => {
        const avgConfA = a.count ? Math.round(a.totalConfidence / a.count) : 0;
        const avgConfB = b.count ? Math.round(b.totalConfidence / b.count) : 0;
        return avgConfB - avgConfA;
      })
      .slice(0, 5);

    await addJobLog(
      jobId,
      'info',
      `Analysis: ${criteriaWithNoEvidence.length} gaps, ${criteriaWithLowEvidence.length} low evidence, ${criteriaWithHighEvidence.length} strengths`
    );
    await updateJobProgress(jobId, 40);

    // Prepare text for Claude
    const noEvidenceText = criteriaWithNoEvidence
      .map((c) => `${c.id}: [${c.areaOfConcentration} > ${c.subarea}] ${c.description}`)
      .join('\n\n');

    const lowEvidenceText = criteriaWithLowEvidence
      .map((c: any) => {
        const avgConfidence = c.count ? Math.round(c.totalConfidence / c.count) : 0;
        return `${c.id}: [${c.area} > ${c.subarea}] ${c.description} (${c.count} PRs, Avg Confidence: ${avgConfidence}%)`;
      })
      .join('\n\n');

    const strengthsText = criteriaWithHighEvidence
      .map((c: any) => {
        const avgConfidence = c.count ? Math.round(c.totalConfidence / c.count) : 0;
        return `${c.id}: [${c.area} > ${c.subarea}] ${c.description} (${c.count} PRs, Avg Confidence: ${avgConfidence}%)`;
      })
      .join('\n\n');

    // Generate summary of recent work
    const prSummary = evidenceEntries
      .filter((e) => e.type === 'PR')
      .slice(0, 20)
      .map((e) => `${e.repository}#${e.prNumber}: ${e.title}`)
      .join('\n');

    // Get future Jira tickets if requested
    let futureTicketsText = 'No future tickets available.';
    if (config.includeJiraTickets) {
      // TODO: Implement Jira ticket fetching from database
      // For now, just note that it's not available
      futureTicketsText = 'Jira ticket integration not yet implemented in worker.';
    }

    await addJobLog(jobId, 'info', 'Calling Claude AI to generate goals...');
    await updateJobProgress(jobId, 50);

    // Build the prompt
    const prompt = `You are an expert at creating SMART goals for software engineers. The developer has the following context:

${userContext || 'I am a senior developer content in my job with a great manager that supports me.'}

Based on the following evidence from GitHub pull requests and upcoming work, create ${goalCount} SMART goals for the next ${timeframe}.

CRITERIA WITH NO EVIDENCE (areas for potential growth):
${noEvidenceText || 'None identified'}

CRITERIA WITH LOW EVIDENCE (areas for improvement):
${lowEvidenceText || 'None identified'}

STRENGTHS (areas with strong evidence):
${strengthsText || 'None identified'}

RECENT WORK SUMMARY:
${prSummary || 'No recent work found'}

UPCOMING WORK:
${futureTicketsText}

For each goal:
1. Make it specific and clear what success looks like
2. Include how it will be measured
3. Ensure it's achievable but stretching
4. Make it relevant to both the engineer's growth and the organization's needs
5. Include a timeframe (${timeframe})

Format each goal as:

## Goal Title
**SMART Goal:** [The complete goal statement]
**Success Criteria:** [How to know when this goal is achieved]
**Alignment:** [How this goal aligns with career growth and organizational needs]
**Timeline:** [When this should be completed by]

Generate exactly ${goalCount} goals, focusing on a mix of technical growth and leadership development.`;

    // Call Claude AI
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const completion = await anthropic.messages.create({
      model: claudeModel,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const goalsText = completion.content[0].type === 'text' ? completion.content[0].text : '';

    await addJobLog(jobId, 'info', 'Goals generated successfully');
    await updateJobProgress(jobId, 70);

    // Parse goals from the response
    const goalSections = goalsText.split(/(?=##\s+)/g).filter((s) => s.trim().startsWith('##'));

    await addJobLog(jobId, 'info', `Parsing ${goalSections.length} goals...`);

    // Save goals to database
    const savedGoals = [];
    const generatedFrom = {
      criteriaWithNoEvidence: criteriaWithNoEvidence.length,
      criteriaWithLowEvidence: criteriaWithLowEvidence.length,
      criteriaWithHighEvidence: criteriaWithHighEvidence.length,
      evidenceCount: evidenceEntries.length,
      prompt: prompt.substring(0, 500), // Save a snippet of the prompt
    };

    for (let i = 0; i < goalSections.length; i++) {
      const goalText = goalSections[i];
      const category = config.focusAreas?.[i % (config.focusAreas?.length || 1)] || 'DEVELOPMENT';

      const parsedGoal = parseGoalFromText(goalText, category);

      if (parsedGoal) {
        const goal = await prisma.goal.create({
          data: {
            ...parsedGoal,
            generatedFrom: JSON.stringify(generatedFrom),
          },
        });

        savedGoals.push(goal);
        await addJobLog(jobId, 'info', `Saved goal: ${goal.title}`);
      } else {
        await addJobLog(jobId, 'warn', `Failed to parse goal section ${i + 1}`);
      }
    }

    await updateJobProgress(jobId, 90);

    // Update job with success result
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify({
          goalsGenerated: savedGoals.length,
          goals: savedGoals.map((g) => ({
            id: g.id,
            title: g.title,
            category: g.category,
          })),
          analysisStats: {
            evidenceCount: evidenceEntries.length,
            criteriaWithNoEvidence: criteriaWithNoEvidence.length,
            criteriaWithLowEvidence: criteriaWithLowEvidence.length,
            criteriaWithHighEvidence: criteriaWithHighEvidence.length,
          },
        }),
      },
    });

    await addJobLog(jobId, 'info', `Goal generation completed successfully. Created ${savedGoals.length} goals.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';

    await addJobLog(jobId, 'error', `Error: ${errorMessage}`);

    // Update job with failure status
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: errorMessage,
        result: JSON.stringify({
          error: errorMessage,
          stack: errorStack,
        }),
      },
    });

    throw error;
  }
}
