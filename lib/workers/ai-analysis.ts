import { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '../db/prisma';
import { getAnthropicApiKey, getConfiguredModelId } from '@/lib/ai/config';
import {
  encodeCriteria,
  mapCriteriaForPrompt,
  TOON_FORMAT_EXPLANATION,
} from '@/lib/utils/toon';

/**
 * Worker for analyzing evidence items using AI
 * Extracts impact, criteria matches, and generates summaries
 */

export interface AIAnalysisJobConfig {
  evidenceId?: string;
  evidenceIds?: string[];
  forceReanalysis?: boolean; // If true, reanalyze even if already analyzed
}

interface EvidenceAnalysis {
  impact: string;
  criterion: string;
  criterionId?: number;
  summary: string;
  confidence: number;
}

/**
 * Process an AI analysis job for evidence items
 */
export async function processAIAnalysisJob(jobId: string): Promise<void> {
  console.log(`[AIAnalysis] Starting job ${jobId}`);

  try {
    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== 'PENDING') {
      throw new Error(`Job ${jobId} is not in PENDING state (current: ${job.status})`);
    }

    // Parse config
    const config: AIAnalysisJobConfig = job.config ? JSON.parse(job.config) : {};

    // Validate config - need at least one evidence ID
    if (!config.evidenceId && (!config.evidenceIds || config.evidenceIds.length === 0)) {
      throw new Error('Either evidenceId or evidenceIds array is required in job config');
    }

    // Update job status to IN_PROGRESS
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        progress: 0,
        logs: JSON.stringify([{ timestamp: new Date(), message: 'Starting AI analysis' }]),
      },
    });

    // Get list of evidence IDs to process
    const evidenceIds = config.evidenceId
      ? [config.evidenceId]
      : config.evidenceIds!;

    // Get API key
    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey();
    } catch (error) {
      throw new Error('Anthropic API key not configured. Please configure in settings.');
    }

    // Update progress
    await updateJobProgress(jobId, 10, 'Initializing AI client');

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // Get model from database configuration
    const modelId = await getConfiguredModelId();

    // Fetch all criteria for matching
    await updateJobProgress(jobId, 15, 'Loading performance criteria');
    const allCriteria = await prisma.criterion.findMany({
      orderBy: { id: 'asc' },
    });

    // Process each evidence item
    const totalItems = evidenceIds.length;
    const results = [];

    for (let i = 0; i < evidenceIds.length; i++) {
      const evidenceId = evidenceIds[i];
      const progressPercent = 15 + Math.round((i / totalItems) * 70);

      await updateJobProgress(
        jobId,
        progressPercent,
        `Analyzing evidence ${i + 1}/${totalItems}`
      );

      try {
        const analysisResult = await analyzeEvidence(
          evidenceId,
          anthropic,
          modelId,
          allCriteria,
          config.forceReanalysis || false
        );

        results.push({
          evidenceId,
          success: true,
          analysis: analysisResult,
        });
      } catch (error) {
        console.error(`Failed to analyze evidence ${evidenceId}:`, error);
        results.push({
          evidenceId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await updateJobProgress(jobId, 100, 'AI analysis complete');

    // Mark job as completed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify({
          totalItems,
          successCount: results.filter((r) => r.success).length,
          failedCount: results.filter((r) => !r.success).length,
          results,
        }),
      },
    });

    console.log(`[AIAnalysis] Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`[AIAnalysis] Job ${jobId} failed:`, error);

    // Update job status to failed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

/**
 * Analyze a single evidence item
 */
async function analyzeEvidence(
  evidenceId: string,
  anthropic: Anthropic,
  modelId: string,
  allCriteria: any[],
  forceReanalysis: boolean
): Promise<EvidenceAnalysis> {
  // Fetch evidence with relations
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      githubPr: true,
      githubIssue: true,
      jiraTicket: true,
      slackMessage: true,
      criteria: {
        include: {
          criterion: true,
        },
      },
    },
  });

  if (!evidence) {
    throw new Error(`Evidence ${evidenceId} not found`);
  }

  // Check if already analyzed and not forcing reanalysis
  if (!forceReanalysis && evidence.criteria.length > 0) {
    console.log(`Evidence ${evidenceId} already analyzed, skipping`);
    const topCriterion = evidence.criteria.sort((a, b) => b.confidence - a.confidence)[0];
    return {
      impact: evidence.summary,
      criterion: topCriterion.criterion.description,
      criterionId: topCriterion.criterionId,
      summary: evidence.summary,
      confidence: topCriterion.confidence,
    };
  }

  // Build context for analysis
  const prompt = buildAnalysisPrompt(evidence, allCriteria);

  // Call Claude API
  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 2000,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse analysis
  const analysis = parseAnalysisResponse(responseText, allCriteria);

  // Update evidence with analysis
  // First, remove existing criteria mappings if reanalyzing
  if (forceReanalysis && evidence.criteria.length > 0) {
    await prisma.evidenceCriterion.deleteMany({
      where: { evidenceId },
    });
  }

  // Add new criterion mapping if we found one
  if (analysis.criterionId) {
    await prisma.evidenceCriterion.create({
      data: {
        evidenceId,
        criterionId: analysis.criterionId,
        confidence: analysis.confidence,
        explanation: analysis.impact,
      },
    });
  }

  // Update evidence summary if we have a better one
  if (analysis.summary && analysis.summary.length > evidence.summary.length) {
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        summary: analysis.summary,
      },
    });
  }

  return analysis;
}

/**
 * Build the AI analysis prompt for evidence
 */
function buildAnalysisPrompt(evidence: any, criteria: any[]): string {
  // Build evidence context
  let evidenceContext = '';

  if (evidence.githubPr) {
    const pr = evidence.githubPr;
    evidenceContext = `GitHub Pull Request:
- Title: ${pr.title}
- Description: ${pr.body || 'No description'}
- Files changed: ${pr.changedFiles}
- Additions: ${pr.additions}, Deletions: ${pr.deletions}
- User role: ${pr.userRole}
- Components: ${pr.components}`;
  } else if (evidence.jiraTicket) {
    const ticket = evidence.jiraTicket;
    evidenceContext = `Jira Ticket:
- Key: ${ticket.key}
- Summary: ${ticket.summary}
- Description: ${ticket.description || 'No description'}
- Type: ${ticket.issueType}
- Status: ${ticket.status}
- User role: ${ticket.userRole}
${ticket.storyPoints ? `- Story Points: ${ticket.storyPoints}` : ''}`;
  } else if (evidence.slackMessage) {
    const msg = evidence.slackMessage;
    evidenceContext = `Slack Message:
- Channel: ${msg.channel}
- Author: ${msg.author}
- Content: ${msg.content}
- Reactions: ${msg.reactions || 'None'}
- Reply count: ${msg.replyCount}`;
  } else if (evidence.githubIssue) {
    const issue = evidence.githubIssue;
    evidenceContext = `GitHub Issue:
- Title: ${issue.title}
- Description: ${issue.body || 'No description'}
- State: ${issue.state}
- Labels: ${issue.labels}`;
  } else if (evidence.manualTitle) {
    evidenceContext = `Manual Evidence:
- Title: ${evidence.manualTitle}
- Content: ${evidence.manualContent || 'No additional content'}`;
  }

  // Current summary
  evidenceContext += `\n\nCurrent Summary: ${evidence.summary}
Type: ${evidence.type}
Category: ${evidence.category}
Scope: ${evidence.scope}`;

  // Encode criteria list in TOON format for token efficiency
  const criteriaForPrompt = mapCriteriaForPrompt(criteria);
  const toonCriteria = encodeCriteria(criteriaForPrompt);

  return `You are analyzing evidence for a performance review to extract key information and match it to performance criteria.

${TOON_FORMAT_EXPLANATION}

Evidence:
${evidenceContext}

Available Performance Criteria (TOON format):
\`\`\`toon
${toonCriteria}
\`\`\`

Please analyze this evidence and provide:

1. **Impact**: What was the key achievement or contribution? Be specific about the impact (e.g., "Improved performance by 50%", "Led team of 5 engineers", etc.)

2. **Best Matching Criterion**: Which ONE criterion from the list above best matches this evidence? Provide the ID number.

3. **Summary**: A concise 2-3 sentence summary of the work and its impact. Make it compelling and specific.

4. **Confidence**: How confident are you in the criterion match? (0-100)

Please respond in JSON format:
{
  "impact": "Specific impact statement",
  "criterionId": 5,
  "criterion": "Brief description of why this criterion matches",
  "summary": "2-3 sentence compelling summary",
  "confidence": 85
}

Focus on concrete accomplishments and measurable impact. If the evidence doesn't clearly match any criterion, set criterionId to null.`;
}

/**
 * Parse and validate AI response
 */
function parseAnalysisResponse(responseText: string, criteria: any[]): EvidenceAnalysis {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch =
      responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      responseText.match(/(\{[\s\S]*\})/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    const parsed = JSON.parse(jsonText);

    // Validate required fields
    if (!parsed.impact || !parsed.summary) {
      throw new Error('Analysis must include impact and summary');
    }

    // Validate criterion ID if provided
    let criterionId: number | undefined;
    if (parsed.criterionId !== null && parsed.criterionId !== undefined) {
      criterionId = parseInt(String(parsed.criterionId), 10);
      const criterion = criteria.find((c) => c.id === criterionId);
      if (!criterion) {
        console.warn(`Criterion ID ${criterionId} not found, ignoring`);
        criterionId = undefined;
      }
    }

    return {
      impact: parsed.impact,
      criterion: parsed.criterion || 'No specific criterion matched',
      criterionId,
      summary: parsed.summary,
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
    };
  } catch (error) {
    throw new Error(
      `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update job progress and logs
 */
async function updateJobProgress(
  jobId: string,
  progress: number,
  message: string
): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) return;

  const logs = job.logs ? JSON.parse(job.logs) : [];
  logs.push({ timestamp: new Date(), message });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress,
      logs: JSON.stringify(logs),
      statusMessage: message,
      updatedAt: new Date(),
    },
  });
}
