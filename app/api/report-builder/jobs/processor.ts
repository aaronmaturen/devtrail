import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey, getConfiguredModelId } from '@/lib/ai/config';
import {
  encodeEvidence,
  encodeGoals,
  mapEvidenceForPrompt,
  mapGoalsForPrompt,
  TOON_FORMAT_EXPLANATION,
} from '@/lib/utils/toon';

const prisma = new PrismaClient();

/**
 * Background processor for AI analysis jobs
 * Handles GENERATE, REFINE, and ANALYZE job types
 */
export async function processJob(jobId: string) {
  console.log(`[Job ${jobId}] Starting processing...`);

  // Update status to processing
  await prisma.analysisJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING' },
  });

  try {
    const job = await prisma.analysisJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    console.log(`[Job ${jobId}] Type: ${job.type}, DocumentId: ${job.documentId}`);

    // Get API key from centralized config
    const apiKey = await getAnthropicApiKey();
    const anthropic = new Anthropic({ apiKey });

    // Build context based on job type
    let result;

    if (job.type === 'GENERATE') {
      result = await processGenerateJob(job, anthropic);
    } else if (job.type === 'REFINE') {
      result = await processRefineJob(job, anthropic);
    } else if (job.type === 'ANALYZE') {
      result = await processAnalyzeJob(job, anthropic);
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }

    // Mark job complete
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        result: JSON.stringify(result),
        completedAt: new Date(),
      },
    });

    console.log(`[Job ${jobId}] Completed successfully`);

  } catch (error) {
    console.error(`[Job ${jobId}] Failed:`, error);

    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Process a GENERATE job - create new AI content for a block
 */
async function processGenerateJob(job: any, anthropic: Anthropic) {
  console.log(`[Job ${job.id}] Processing GENERATE job`);

  // Fetch block and document context
  const block = await prisma.reportBlock.findUnique({
    where: { id: job.blockId! },
    include: { document: true },
  });

  if (!block) {
    throw new Error('Block not found');
  }

  // Parse document context config
  const contextConfig = JSON.parse(block.document.contextConfig || '{}');

  // Gather evidence based on context config
  const evidence = await gatherEvidence(contextConfig);

  // Gather goals if requested
  let goals = null;
  if (contextConfig.includeGoals) {
    goals = await prisma.goal.findMany({
      where: { status: 'ACTIVE' },
      include: {
        milestones: true,
        progressEntries: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Gather review documents if requested
  let reviews = null;
  if (contextConfig.includeReviews) {
    reviews = await prisma.reviewDocument.findMany({
      orderBy: { year: 'desc' },
    });
  }

  // Build context for AI
  const contextParts = [];

  if (evidence.length > 0) {
    contextParts.push(`## Evidence (${evidence.length} items)\n\n${formatEvidence(evidence)}`);
  }

  if (goals && goals.length > 0) {
    contextParts.push(`## Goals\n\n${formatGoals(goals)}`);
  }

  if (reviews && reviews.length > 0) {
    contextParts.push(`## Previous Reviews\n\n${formatReviews(reviews)}`);
  }

  const contextText = contextParts.length > 0
    ? `\n\nContext:\n${contextParts.join('\n\n')}`
    : '';

  // Build system prompt
  const systemPrompt = `You are helping write a performance review or report.
You have access to evidence of work, goals, and previous reviews.
Provide well-structured, professional content that directly addresses the prompt.
Be specific and use concrete examples from the evidence when relevant.
Format your response using markdown.

${TOON_FORMAT_EXPLANATION}`;

  // Build user prompt
  const userPrompt = `${job.prompt || block.prompt}${contextText}`;

  console.log(`[Job ${job.id}] Calling Claude API with ${contextParts.length} context sections`);

  // Get model from centralized config
  const modelId = await getConfiguredModelId();

  // Call Claude API
  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';

  console.log(`[Job ${job.id}] Generated ${content.length} characters, ${response.usage.output_tokens} tokens`);

  // Update block with result
  await prisma.reportBlock.update({
    where: { id: job.blockId! },
    data: {
      content,
      metadata: JSON.stringify({
        model: modelId,
        tokensUsed: response.usage.output_tokens,
        generatedAt: new Date().toISOString(),
        evidenceCount: evidence.length,
        goalsCount: goals?.length || 0,
        reviewsCount: reviews?.length || 0,
      }),
    },
  });

  // Create revision record
  await prisma.reportBlockRevision.create({
    data: {
      blockId: job.blockId!,
      previousContent: block.content,
      newContent: content,
      changeType: 'AGENT_GENERATION',
      changedBy: 'AGENT',
      agentModel: modelId,
      agentPrompt: userPrompt.substring(0, 1000), // Truncate for storage
    },
  });

  return {
    content,
    tokensUsed: response.usage.output_tokens,
    evidenceCount: evidence.length,
    goalsCount: goals?.length || 0,
    reviewsCount: reviews?.length || 0,
  };
}

/**
 * Process a REFINE job - refine existing content
 */
async function processRefineJob(job: any, anthropic: Anthropic) {
  console.log(`[Job ${job.id}] Processing REFINE job`);

  const block = await prisma.reportBlock.findUnique({
    where: { id: job.blockId! },
  });

  if (!block) {
    throw new Error('Block not found');
  }

  const systemPrompt = `You are helping refine content for a performance review or report.
Improve the content while maintaining its core message and intent.
Make it more concise, clear, and professional.`;

  const userPrompt = `${job.prompt}\n\nCurrent content:\n${block.content}`;

  // Get model from centralized config
  const modelId = await getConfiguredModelId();

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';

  // Update block
  await prisma.reportBlock.update({
    where: { id: job.blockId! },
    data: {
      content,
      metadata: JSON.stringify({
        model: modelId,
        tokensUsed: response.usage.output_tokens,
        refinedAt: new Date().toISOString(),
      }),
    },
  });

  // Create revision record
  await prisma.reportBlockRevision.create({
    data: {
      blockId: job.blockId!,
      previousContent: block.content,
      newContent: content,
      changeType: 'AGENT_REFINEMENT',
      changedBy: 'AGENT',
      agentModel: modelId,
      agentPrompt: userPrompt.substring(0, 1000),
    },
  });

  return {
    content,
    tokensUsed: response.usage.output_tokens,
  };
}

/**
 * Process an ANALYZE job - analyze evidence or content
 */
async function processAnalyzeJob(job: any, anthropic: Anthropic) {
  console.log(`[Job ${job.id}] Processing ANALYZE job`);

  // Get document context
  const document = await prisma.reportDocument.findUnique({
    where: { id: job.documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const contextConfig = JSON.parse(document.contextConfig || '{}');
  const evidence = await gatherEvidence(contextConfig);

  const systemPrompt = `You are analyzing evidence for a performance review.
Provide insights, patterns, and recommendations based on the evidence.`;

  const userPrompt = `${job.prompt}\n\nEvidence:\n${formatEvidence(evidence)}`;

  // Get model from centralized config
  const modelId = await getConfiguredModelId();

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const analysis = response.content[0].type === 'text' ? response.content[0].text : '';

  return {
    analysis,
    tokensUsed: response.usage.output_tokens,
    evidenceCount: evidence.length,
  };
}

/**
 * Gather evidence based on context config
 */
async function gatherEvidence(contextConfig: any) {
  const whereClause: any = {};

  // Date range filter
  if (contextConfig.evidenceDateRange) {
    const { start, end } = contextConfig.evidenceDateRange;
    if (start || end) {
      whereClause.occurredAt = {};
      if (start) whereClause.occurredAt.gte = new Date(start);
      if (end) whereClause.occurredAt.lte = new Date(end);
    }
  }

  // Type filter
  if (contextConfig.evidenceTypes && contextConfig.evidenceTypes.length > 0) {
    whereClause.type = { in: contextConfig.evidenceTypes };
  }

  // Category filter
  if (contextConfig.evidenceCategories && contextConfig.evidenceCategories.length > 0) {
    whereClause.category = { in: contextConfig.evidenceCategories };
  }

  const evidence = await prisma.evidence.findMany({
    where: whereClause,
    include: {
      criteria: {
        include: {
          criterion: true,
        },
      },
      githubPr: true,
      jiraTicket: true,
      slackMessage: true,
    },
    orderBy: { occurredAt: 'desc' },
    take: contextConfig.maxEvidence || 50,
  });

  return evidence;
}

/**
 * Format evidence for AI context using TOON format
 */
function formatEvidence(evidence: any[]): string {
  if (evidence.length === 0) return 'No evidence available.';

  // Map to flat structure for TOON encoding
  const mapped = mapEvidenceForPrompt(evidence);
  const toonEncoded = encodeEvidence(mapped);

  return `\`\`\`toon
${toonEncoded}
\`\`\``;
}

/**
 * Format goals for AI context using TOON format
 */
function formatGoals(goals: any[]): string {
  if (goals.length === 0) return 'No goals available.';

  // Map to flat structure for TOON encoding
  const mapped = mapGoalsForPrompt(goals);
  const toonEncoded = encodeGoals(mapped);

  return `\`\`\`toon
${toonEncoded}
\`\`\``;
}

/**
 * Format reviews for AI context
 */
function formatReviews(reviews: any[]): string {
  return reviews.map((r, i) => {
    const preview = r.content.substring(0, 500) + (r.content.length > 500 ? '...' : '');
    return `${i + 1}. **${r.year}** (${r.type}, weight: ${r.weight})
   ${preview}`;
  }).join('\n\n');
}
