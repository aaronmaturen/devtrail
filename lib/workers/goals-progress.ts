import { prisma } from '../db/prisma';
import Anthropic from '@anthropic-ai/sdk';

export interface GoalProgressJobConfig {
  goalId: string;
  evidenceIds?: string[]; // Optional: specific evidence to match against
  autoMatchEvidence?: boolean; // Default true: automatically find relevant evidence
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
 * Match evidence to goal based on keywords and criteria
 */
async function matchEvidenceToGoal(goalId: string): Promise<string[]> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      milestones: true,
    },
  });

  if (!goal) {
    throw new Error(`Goal ${goalId} not found`);
  }

  // Extract keywords from goal title, description, and SMART criteria
  const keywords = [
    ...goal.title.toLowerCase().split(/\s+/),
    ...goal.description.toLowerCase().split(/\s+/),
    ...goal.specific.toLowerCase().split(/\s+/),
    ...goal.measurable.toLowerCase().split(/\s+/),
  ].filter(word => word.length > 3); // Filter out short words

  // Get unique keywords
  const keywordSet = new Set(keywords);
  const uniqueKeywords = Array.from(keywordSet);

  // Find evidence that matches any of the keywords
  const evidence = await prisma.evidenceEntry.findMany({
    where: {
      OR: [
        {
          title: {
            contains: uniqueKeywords.join(' '),
          },
        },
        {
          description: {
            contains: uniqueKeywords.join(' '),
          },
        },
      ],
    },
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

  // Filter evidence that has strong keyword matches
  const relevantEvidence = evidence.filter(entry => {
    const searchText = `${entry.title} ${entry.description || ''}`.toLowerCase();
    const matchCount = uniqueKeywords.filter(keyword =>
      searchText.includes(keyword)
    ).length;
    return matchCount >= 2; // At least 2 keyword matches
  });

  return relevantEvidence.map(e => e.id);
}

/**
 * Generate AI progress summary for a goal
 */
async function generateProgressSummary(
  goal: any,
  evidence: any[],
  anthropicApiKey: string,
  claudeModel: string = 'claude-sonnet-4-20250514',
  userContext?: string
): Promise<{
  progressPercent: number;
  accomplishments: string[];
  areasForImprovement: string[];
  nextSteps: string[];
  summary: string;
}> {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Format evidence for the prompt
  const evidenceText = evidence
    .slice(0, 10) // Limit to top 10 most recent/relevant
    .map(
      (e, idx) =>
        `${idx + 1}. **${e.title}** (${e.type}, ${new Date(e.timestamp).toLocaleDateString()})\n` +
        `   ${e.description || 'No description'}\n` +
        `   Criteria: ${e.criteria.map((c: any) => `${c.criterion.id}: ${c.criterion.description} (${c.confidence}%)`).join(', ')}`
    )
    .join('\n\n');

  // Format milestones if available
  const milestonesText = goal.milestones
    ?.map((m: any) => `- ${m.title} (${m.status})`)
    .join('\n') || 'No milestones defined';

  const prompt = `You are an expert at evaluating progress on performance goals. ${
    userContext ? `The developer has the following context:\n\n${userContext}\n\n` : ''
  }
I need to evaluate progress on the following goal:

## ${goal.title}
${goal.description}

**SMART Criteria:**
- **Specific:** ${goal.specific}
- **Measurable:** ${goal.measurable}
- **Achievable:** ${goal.achievable}
- **Relevant:** ${goal.relevant}
- **Time-Bound:** ${goal.timeBound}

**Milestones:**
${milestonesText}

**Start Date:** ${new Date(goal.startDate).toLocaleDateString()}
**Target Date:** ${new Date(goal.targetDate).toLocaleDateString()}

The following evidence is relevant to this goal:

${evidenceText || 'No evidence found yet.'}

Based on this evidence, please:
1. Estimate a progress percentage (0-100%) for this goal
2. Provide 3-5 specific accomplishments that demonstrate progress
3. Identify any areas where more work is needed
4. Suggest next steps to complete the goal

Format your response as JSON with the following structure:
{
  "progressPercent": <number 0-100>,
  "accomplishments": ["accomplishment 1", "accomplishment 2", ...],
  "areasForImprovement": ["area 1", "area 2", ...],
  "nextSteps": ["step 1", "step 2", ...],
  "summary": "<2-3 sentence summary of overall progress>"
}`;

  const completion = await anthropic.messages.create({
    model: claudeModel,
    max_tokens: 2048,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = completion.content[0].type === 'text'
    ? completion.content[0].text.trim()
    : '';

  // Parse JSON response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response as JSON');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Main function to process GOAL_PROGRESS jobs
 * - Fetch goal and milestones
 * - Match relevant evidence (auto or manual)
 * - Generate AI progress summary
 * - Create GoalProgress entry
 * - Update goal progressPercent
 */
export async function processGoalProgressJob(jobId: string): Promise<void> {
  let job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.type !== 'GOAL_PROGRESS') {
    throw new Error(`Job ${jobId} is not a GOAL_PROGRESS job`);
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

    await addJobLog(jobId, 'info', 'Starting goal progress tracking');

    // Parse job config
    const config: GoalProgressJobConfig = JSON.parse(job.config || '{}');

    if (!config.goalId) {
      throw new Error('Missing goalId in job config');
    }

    await addJobLog(jobId, 'info', `Processing goal: ${config.goalId}`);
    await updateJobProgress(jobId, 10);

    // Fetch goal with milestones
    const goal = await prisma.goal.findUnique({
      where: { id: config.goalId },
      include: {
        milestones: true,
      },
    });

    if (!goal) {
      throw new Error(`Goal ${config.goalId} not found`);
    }

    await addJobLog(jobId, 'info', `Found goal: ${goal.title}`);
    await updateJobProgress(jobId, 20);

    // Match evidence to goal
    let evidenceIds: string[] = [];

    if (config.evidenceIds && config.evidenceIds.length > 0) {
      // Use provided evidence IDs
      evidenceIds = config.evidenceIds;
      await addJobLog(jobId, 'info', `Using ${evidenceIds.length} manually specified evidence entries`);
    } else if (config.autoMatchEvidence !== false) {
      // Auto-match evidence
      await addJobLog(jobId, 'info', 'Auto-matching relevant evidence...');
      evidenceIds = await matchEvidenceToGoal(config.goalId);
      await addJobLog(jobId, 'info', `Found ${evidenceIds.length} relevant evidence entries`);
    }

    await updateJobProgress(jobId, 40);

    // Fetch evidence with criteria
    const evidence = await prisma.evidenceEntry.findMany({
      where: {
        id: {
          in: evidenceIds,
        },
      },
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

    await addJobLog(jobId, 'info', `Loaded ${evidence.length} evidence entries for analysis`);
    await updateJobProgress(jobId, 50);

    // Get API keys from Config table
    let anthropicApiKey: string | undefined;
    let claudeModel: string | undefined;
    let userContext: string | undefined;

    try {
      const anthropicConfig = await prisma.config.findUnique({
        where: { key: 'anthropic_api_key' },
      });
      if (anthropicConfig) {
        anthropicApiKey = anthropicConfig.value;
      }

      const modelConfig = await prisma.config.findUnique({
        where: { key: 'claude_model' },
      });
      if (modelConfig) {
        claudeModel = modelConfig.value;
      }

      const contextConfig = await prisma.config.findUnique({
        where: { key: 'user_context' },
      });
      if (contextConfig) {
        userContext = contextConfig.value;
      }
    } catch (error) {
      await addJobLog(jobId, 'warn', 'Could not load API configuration from database');
    }

    if (!anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    await addJobLog(jobId, 'info', 'Generating AI progress summary...');
    await updateJobProgress(jobId, 60);

    // Generate AI progress summary
    const progressAnalysis = await generateProgressSummary(
      goal,
      evidence,
      anthropicApiKey,
      claudeModel,
      userContext
    );

    await addJobLog(
      jobId,
      'info',
      `AI analysis complete: ${progressAnalysis.progressPercent}% progress`
    );
    await updateJobProgress(jobId, 80);

    // Format AI summary as markdown
    const aiSummary = `# Progress Summary

${progressAnalysis.summary}

## Progress: ${progressAnalysis.progressPercent}%

## Accomplishments
${progressAnalysis.accomplishments.map(a => `- ${a}`).join('\n')}

## Areas for Improvement
${progressAnalysis.areasForImprovement.map(a => `- ${a}`).join('\n')}

## Next Steps
${progressAnalysis.nextSteps.map(s => `- ${s}`).join('\n')}

---
*Generated by AI on ${new Date().toLocaleDateString()}*
`;

    // Create progress entry
    const progressEntry = await prisma.goalProgress.create({
      data: {
        goalId: config.goalId,
        progressPercent: progressAnalysis.progressPercent,
        notes: `Accomplishments:\n${progressAnalysis.accomplishments.map(a => `- ${a}`).join('\n')}\n\nNext Steps:\n${progressAnalysis.nextSteps.map(s => `- ${s}`).join('\n')}`,
        evidence: JSON.stringify(evidenceIds),
        aiSummary,
      },
    });

    await addJobLog(jobId, 'info', `Created progress entry: ${progressEntry.id}`);
    await updateJobProgress(jobId, 90);

    // Update goal's overall progress percent
    await prisma.goal.update({
      where: { id: config.goalId },
      data: {
        progressPercent: progressAnalysis.progressPercent,
      },
    });

    // If progress is 100%, mark goal as completed
    if (progressAnalysis.progressPercent >= 100) {
      await prisma.goal.update({
        where: { id: config.goalId },
        data: {
          status: 'COMPLETED',
          completedDate: new Date(),
        },
      });
      await addJobLog(jobId, 'info', 'Goal marked as COMPLETED (100% progress)');
    }

    await updateJobProgress(jobId, 95);

    // Update job with success result
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify({
          progressEntryId: progressEntry.id,
          progressPercent: progressAnalysis.progressPercent,
          evidenceCount: evidence.length,
          accomplishments: progressAnalysis.accomplishments,
          nextSteps: progressAnalysis.nextSteps,
        }),
      },
    });

    await addJobLog(jobId, 'info', 'Goal progress tracking completed successfully');
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
