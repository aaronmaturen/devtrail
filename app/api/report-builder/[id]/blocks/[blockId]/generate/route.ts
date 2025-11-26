import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { getCompanyFramework } from '@/lib/services/review-context';
import { getConfiguredModelId } from '@/lib/ai/config';

/**
 * POST /api/report-builder/[id]/blocks/[blockId]/generate
 * Generate AI response for a block using context
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;
    const body = await request.json();
    const { prompt: userPrompt, refine } = body;

    // Fetch block and document
    const block = await prisma.reportBlock.findFirst({
      where: { id: blockId, documentId: id },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    const document = await prisma.reportDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Parse context config
    const contextConfig = JSON.parse(document.contextConfig || '{}');

    // Get API key from config
    const apiKeyConfig = await prisma.config.findUnique({
      where: { key: 'anthropic_api_key' },
    });

    if (!apiKeyConfig?.value) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 400 }
      );
    }

    // Gather context based on document config
    const context = await gatherContext(contextConfig);

    // Get the prompt (from block's prompt field or user input)
    const promptText = userPrompt || block.prompt;

    if (!promptText) {
      return NextResponse.json(
        { error: 'No prompt provided. Add a prompt to the block first.' },
        { status: 400 }
      );
    }

    // Build the system prompt with context
    const systemPrompt = buildSystemPrompt(context, contextConfig);

    // If refining, include current content
    let messages: Anthropic.MessageParam[] = [];
    if (refine && block.content) {
      messages = [
        { role: 'user', content: promptText },
        { role: 'assistant', content: block.content },
        { role: 'user', content: userPrompt || 'Please refine and improve this response.' },
      ];
    } else {
      messages = [{ role: 'user', content: promptText }];
    }

    // Get model from database configuration
    const modelId = await getConfiguredModelId();

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: JSON.parse(apiKeyConfig.value),
    });

    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const generatedContent =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Store previous content in revision history
    if (block.content) {
      await prisma.reportBlockRevision.create({
        data: {
          blockId,
          previousContent: block.content,
          newContent: generatedContent,
          changeType: refine ? 'AGENT_REFINEMENT' : 'AGENT_GENERATION',
          changedBy: 'AGENT',
          agentModel: modelId,
          agentPrompt: promptText,
        },
      });
    }

    // Update block with generated content
    const updatedBlock = await prisma.reportBlock.update({
      where: { id: blockId },
      data: {
        content: generatedContent,
        metadata: JSON.stringify({
          ...JSON.parse(block.metadata || '{}'),
          model: modelId,
          generatedAt: new Date().toISOString(),
          tokensUsed: response.usage.output_tokens,
          promptUsed: promptText,
        }),
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    return NextResponse.json({
      block: {
        ...updatedBlock,
        metadata: JSON.parse(updatedBlock.metadata || '{}'),
      },
      usage: response.usage,
    });
  } catch (error) {
    console.error('Error generating block content:', error);
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}

/**
 * Gather context based on document configuration
 */
async function gatherContext(contextConfig: any) {
  const context: {
    evidence: any[];
    goals: any[];
    reviews: any[];
    reviewAnalyses: any[];
    userContext: string | null;
    companyFramework: string | null;
  } = {
    evidence: [],
    goals: [],
    reviews: [],
    reviewAnalyses: [],
    userContext: null,
    companyFramework: null,
  };

  // Get goals first (so we can use their start dates for evidence filtering)
  if (contextConfig.includeGoals !== false) {
    context.goals = await prisma.goal.findMany({
      where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: {
        milestones: true,
        progressEntries: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });
  }

  // Get evidence within date range
  // If goals are included, extend the date range back to the earliest goal start date
  const evidenceWhere: any = {};

  let effectiveStartDate = contextConfig.evidenceDateStart
    ? new Date(contextConfig.evidenceDateStart)
    : null;

  // Find earliest goal start date and use it if earlier than configured start
  if (context.goals.length > 0) {
    const earliestGoalStart = context.goals.reduce((earliest: Date | null, goal: any) => {
      const goalStart = new Date(goal.startDate);
      if (!earliest || goalStart < earliest) {
        return goalStart;
      }
      return earliest;
    }, null as Date | null);

    if (earliestGoalStart && (!effectiveStartDate || earliestGoalStart < effectiveStartDate)) {
      effectiveStartDate = earliestGoalStart;
    }
  }

  if (effectiveStartDate) {
    evidenceWhere.occurredAt = {
      ...evidenceWhere.occurredAt,
      gte: effectiveStartDate,
    };
  }
  if (contextConfig.evidenceDateEnd) {
    evidenceWhere.occurredAt = {
      ...evidenceWhere.occurredAt,
      lte: new Date(contextConfig.evidenceDateEnd),
    };
  }

  if (contextConfig.includeEvidence !== false) {
    context.evidence = await prisma.evidence.findMany({
      where: evidenceWhere,
      include: {
        githubPr: true,
        jiraTicket: true,
        slackMessage: true,
        criteria: {
          include: { criterion: true },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100, // Limit for context window
    });
  }

  // Get review documents - prioritize by weight (recency) and show manager reviews first
  if (contextConfig.includeReviews !== false) {
    context.reviews = await prisma.reviewDocument.findMany({
      orderBy: [
        { type: 'asc' }, // MANAGER comes before EMPLOYEE alphabetically
        { weight: 'desc' }, // Higher weight = more recent/relevant
        { year: 'desc' },
      ],
    });

    // Also fetch AI-analyzed review insights (more structured than raw reviews)
    context.reviewAnalyses = await prisma.reviewAnalysis.findMany({
      orderBy: [
        { reviewType: 'asc' }, // MANAGER first
        { year: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  // Get user context
  const userContextConfig = await prisma.config.findUnique({
    where: { key: 'user_context' },
  });
  if (userContextConfig?.value) {
    context.userContext = JSON.parse(userContextConfig.value);
  }

  // Get company framework
  context.companyFramework = await getCompanyFramework();

  return context;
}

/**
 * Build system prompt with gathered context
 */
function buildSystemPrompt(context: any, contextConfig: any): string {
  let systemPrompt = `You are an expert performance review assistant helping a software engineer craft compelling content for their performance review.

## CRITICAL FORMAT REQUIREMENTS
- Write EXACTLY 3-5 complete sentences in flowing paragraph form
- NEVER use bullet points, numbered lists, dashes, or any list formatting
- Write naturally in connected prose - each sentence should flow into the next
- Keep your response concise and impactful

## Content Guidelines
- Be specific and data-driven, using concrete examples from the provided evidence
- Write in first person from the engineer's perspective
- Focus on impact and outcomes, not just activities
- Include metrics and quantifiable results where available
- Align with engineering excellence and company values

`;

  // Add user context
  if (context.userContext) {
    systemPrompt += `## About the Engineer
${context.userContext}

`;
  }

  // Add company framework
  if (context.companyFramework) {
    systemPrompt += `## Company Framework
${context.companyFramework}

`;
  }

  // Add evidence summary
  if (context.evidence.length > 0) {
    systemPrompt += `## Work Evidence (${context.evidence.length} items)
`;
    context.evidence.slice(0, 30).forEach((e: any) => {
      const title = e.githubPr?.title || e.jiraTicket?.summary || e.manualTitle || e.summary;
      const type = e.type;
      const date = e.occurredAt?.toISOString().split('T')[0];
      systemPrompt += `- [${type}] ${title} (${date})\n`;
      if (e.criteria?.length > 0) {
        const criteria = e.criteria.map((c: any) => c.criterion.subarea).join(', ');
        systemPrompt += `  Criteria: ${criteria}\n`;
      }
    });
    systemPrompt += '\n';
  }

  // Add goals
  if (context.goals.length > 0) {
    systemPrompt += `## Career Goals
`;
    context.goals.forEach((g: any) => {
      systemPrompt += `- ${g.title} (${g.status}, ${g.progressPercent}% complete)\n`;
      systemPrompt += `  ${g.description}\n`;
    });
    systemPrompt += '\n';
  }

  // Add AI-analyzed review insights (structured, more useful than raw content)
  if (context.reviewAnalyses && context.reviewAnalyses.length > 0) {
    // Separate manager and other reviews for emphasis
    const managerAnalyses = context.reviewAnalyses.filter((r: any) => r.reviewType === 'MANAGER');
    const otherAnalyses = context.reviewAnalyses.filter((r: any) => r.reviewType !== 'MANAGER');

    if (managerAnalyses.length > 0) {
      systemPrompt += `## IMPORTANT: Manager Feedback (Weight this heavily in your responses)
`;
      managerAnalyses.forEach((r: any) => {
        systemPrompt += `### ${r.year || 'Recent'} Manager Review: ${r.title}\n`;
        systemPrompt += `**Summary**: ${r.aiSummary}\n`;

        const themes = JSON.parse(r.themes || '[]');
        if (themes.length > 0) {
          systemPrompt += `**Key Themes**: ${themes.join(', ')}\n`;
        }

        const strengths = JSON.parse(r.strengths || '[]');
        if (strengths.length > 0) {
          systemPrompt += `**Strengths Highlighted**:\n`;
          strengths.forEach((s: string) => systemPrompt += `- ${s}\n`);
        }

        const growthAreas = JSON.parse(r.growthAreas || '[]');
        if (growthAreas.length > 0) {
          systemPrompt += `**Growth Areas Identified**:\n`;
          growthAreas.forEach((g: string) => systemPrompt += `- ${g}\n`);
        }

        const achievements = JSON.parse(r.achievements || '[]');
        if (achievements.length > 0) {
          systemPrompt += `**Achievements Noted**:\n`;
          achievements.forEach((a: string) => systemPrompt += `- ${a}\n`);
        }
        systemPrompt += '\n';
      });
    }

    if (otherAnalyses.length > 0) {
      systemPrompt += `## Other Review Context
`;
      otherAnalyses.forEach((r: any) => {
        systemPrompt += `### ${r.year || 'Recent'} ${r.reviewType} Review: ${r.title}\n`;
        systemPrompt += `**Summary**: ${r.aiSummary}\n`;

        const themes = JSON.parse(r.themes || '[]');
        if (themes.length > 0) {
          systemPrompt += `**Themes**: ${themes.join(', ')}\n`;
        }
        systemPrompt += '\n';
      });
    }
  }

  // Add raw review documents as fallback/additional context (truncated)
  if (context.reviews.length > 0) {
    // Only include raw reviews if we don't have analyses, or limit to manager reviews
    const managerReviews = context.reviews.filter((r: any) => r.type === 'MANAGER');
    if (managerReviews.length > 0 && (!context.reviewAnalyses || context.reviewAnalyses.length === 0)) {
      systemPrompt += `## Raw Manager Review Content
`;
      managerReviews.slice(0, 2).forEach((r: any) => {
        systemPrompt += `### ${r.year} Manager Review\n`;
        const content = r.content.length > 1500
          ? r.content.substring(0, 1500) + '...[truncated]'
          : r.content;
        systemPrompt += `${content}\n\n`;
      });
    }
  }

  return systemPrompt;
}
