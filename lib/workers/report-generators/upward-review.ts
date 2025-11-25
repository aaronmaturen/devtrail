import Anthropic from '@anthropic-ai/sdk';
import { EvidenceEntry } from '@prisma/client';

export interface UpwardReviewConfig {
  anthropicApiKey: string;
  claudeModel?: string;
  userContext?: string;
  presenceWayContent?: string;
}

/**
 * Generate upward review responses for manager
 * Creates responses to two key questions:
 * 1. What should manager continue doing?
 * 2. What is an area of growth for manager?
 */
export async function generateUpwardReview(
  evidence: EvidenceEntry[],
  config: UpwardReviewConfig
): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const model = config.claudeModel || 'claude-3-5-sonnet-20241022';

  let markdown = '# Upward Review Responses\n\n';
  markdown += `*Generated on ${timestamp}*\n\n`;

  // Build context from evidence about collaboration and communication
  const evidenceContext = buildEvidenceContext(evidence);

  // Generate response for "Continue" question
  markdown += '## What is one thing your manager does that you hope they continue to do?\n\n';

  try {
    const continueResponse = await generateQuestionResponse(
      'continue',
      evidenceContext,
      config,
      anthropic,
      model
    );
    markdown += `${continueResponse}\n\n`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    markdown += `**Error generating response:** ${errorMsg}\n\n`;
  }

  // Generate response for "Growth" question
  markdown += '## What is an area of growth that would improve your manager as an impactful leader?\n\n';

  try {
    const growthResponse = await generateQuestionResponse(
      'growth',
      evidenceContext,
      config,
      anthropic,
      model
    );
    markdown += `${growthResponse}\n\n`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    markdown += `**Error generating response:** ${errorMsg}\n\n`;
  }

  markdown += '\n---\n\n';
  markdown += '*Note: These responses are AI-generated based on your work evidence and user context. ';
  markdown += 'Please review and customize them to reflect your authentic experience.*\n';

  return markdown;
}

/**
 * Build context from evidence that relates to collaboration and communication
 */
function buildEvidenceContext(evidence: EvidenceEntry[]): string {
  // Filter for evidence that might show manager interaction
  // Focus on PRs with reviews, Slack messages, and recent work
  const relevantEvidence = evidence
    .filter(e => {
      // Recent evidence (last 6 months) is most relevant
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return e.timestamp >= sixMonthsAgo;
    })
    .slice(0, 20); // Limit to 20 most recent items

  if (relevantEvidence.length === 0) {
    return 'No recent evidence available to provide context.';
  }

  let context = 'Recent work evidence:\n\n';

  relevantEvidence.forEach((entry, i) => {
    context += `${i + 1}. `;

    if (entry.type === 'PR') {
      context += `[PR] ${entry.repository}#${entry.prNumber}: ${entry.title}\n`;
      context += `   Merged: ${entry.mergedAt?.toISOString().split('T')[0] || 'Unknown'}\n`;
      if (entry.description) {
        context += `   Description: ${entry.description.substring(0, 200)}${entry.description.length > 200 ? '...' : ''}\n`;
      }
    } else if (entry.type === 'SLACK') {
      context += `[SLACK] ${entry.title}\n`;
      context += `   Date: ${entry.timestamp.toISOString().split('T')[0]}\n`;
      if (entry.description) {
        context += `   Content: ${entry.description.substring(0, 200)}${entry.description.length > 200 ? '...' : ''}\n`;
      }
    } else {
      context += `[${entry.type}] ${entry.title}\n`;
      context += `   Date: ${entry.timestamp.toISOString().split('T')[0]}\n`;
      if (entry.description) {
        context += `   Description: ${entry.description.substring(0, 200)}${entry.description.length > 200 ? '...' : ''}\n`;
      }
    }

    context += '\n';
  });

  return context;
}

/**
 * Generate response for a specific upward review question
 */
async function generateQuestionResponse(
  questionType: 'continue' | 'growth',
  evidenceContext: string,
  config: UpwardReviewConfig,
  anthropic: Anthropic,
  model: string
): Promise<string> {
  const userContext =
    config.userContext ||
    'I am a senior developer content in my job with a great manager that supports me.';

  let questionPrompt = '';

  if (questionType === 'continue') {
    questionPrompt = 'What is one thing your manager does that you hope they continue to do?';
  } else if (questionType === 'growth') {
    questionPrompt = 'What is an area of growth that would improve your manager as an impactful leader?';
  }

  const prompt = `You are helping a software engineer prepare responses for an upward review of their manager at Presence Learning. Based on the information provided, draft a response to the following question:

${questionPrompt}

CONTEXT ABOUT THE ENGINEER:
${userContext}${
    config.presenceWayContent
      ? `\n\nPRESENCE WAY FRAMEWORK:\n${config.presenceWayContent}`
      : ''
  }

RECENT WORK EVIDENCE:
${evidenceContext}

When drafting the response, align it with the Presence Way framework and values when applicable.

UPWARD REVIEW INSTRUCTIONS:
• Write 2-4 complete sentences total
• Be specific and provide concrete examples when possible
• Be constructive, especially for growth areas
• Focus on behaviors and actions, not personality
• Be professional and respectful
• Write in a way that would be helpful for the manager's development

Please write a response that follows these instructions and sounds natural and authentic. The response should be in first person as if the engineer is writing it themselves.`;

  const completion = await anthropic.messages.create({
    model,
    max_tokens: 1000,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  return completion.content[0].type === 'text' ? completion.content[0].text.trim() : '';
}
