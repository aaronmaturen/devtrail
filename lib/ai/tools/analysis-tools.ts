/**
 * Analysis Tools (Light AI)
 *
 * Tools for AI-assisted analysis during sync:
 * - summarize: Generate 2-3 sentence summary of work
 * - categorize: Categorize work type
 * - estimateScope: Estimate scope/impact
 * - matchCriteria: Match evidence against performance criteria
 */

import { tool } from 'ai';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db/prisma';

// Get Anthropic client from config
async function getAnthropicClient(): Promise<Anthropic> {
  const config = await prisma.config.findUnique({
    where: { key: 'anthropic_api_key' },
  });

  if (!config?.value) {
    throw new Error('Anthropic API key not configured');
  }

  const apiKey = JSON.parse(config.value);
  return new Anthropic({ apiKey });
}

// Define parameter schemas
const summarizeParams = z.object({
  prTitle: z.string().optional().describe('PR title'),
  prBody: z.string().optional().describe('PR description/body'),
  prAdditions: z.number().optional().describe('Lines added'),
  prDeletions: z.number().optional().describe('Lines deleted'),
  prFiles: z.array(z.string()).optional().describe('Files changed'),
  jiraKey: z.string().optional().describe('Jira ticket key'),
  jiraSummary: z.string().optional().describe('Jira ticket summary'),
  jiraDescription: z.string().optional().describe('Jira ticket description'),
  jiraIssueType: z.string().optional().describe('Jira issue type'),
  jiraStoryPoints: z.number().optional().describe('Story points'),
  slackContent: z.string().optional().describe('Slack message content'),
});

const categorizeParams = z.object({
  title: z.string().describe('PR or Jira title'),
  description: z.string().optional().describe('PR or Jira description'),
  issueType: z.string().optional().describe('Jira issue type if available'),
  files: z.array(z.string()).optional().describe('Changed files'),
});

const estimateScopeParams = z.object({
  additions: z.number().optional().describe('Lines added'),
  deletions: z.number().optional().describe('Lines deleted'),
  changedFiles: z.number().optional().describe('Number of files changed'),
  storyPoints: z.number().optional().describe('Story points from Jira'),
  durationDays: z.number().optional().describe('Days to complete'),
});

const matchCriteriaParams = z.object({
  summary: z.string().describe('Evidence summary'),
  category: z.string().describe('Evidence category'),
  prTitle: z.string().optional().describe('PR title'),
  prBody: z.string().optional().describe('PR description'),
  jiraSummary: z.string().optional().describe('Jira ticket summary'),
  jiraDescription: z.string().optional().describe('Jira ticket description'),
  maxMatches: z.number().default(3).describe('Maximum criteria to match'),
  minConfidence: z.number().default(0.4).describe('Minimum confidence threshold'),
});

/**
 * Tool: Summarize
 * Generate a concise summary of work
 */
export const summarizeTool = tool({
  description:
    'Generate a 2-3 sentence summary of work based on PR and/or Jira ticket details. This creates the summary stored in evidence entries.',
  inputSchema: summarizeParams,
  execute: async ({
    prTitle,
    prBody,
    prAdditions,
    prDeletions,
    prFiles,
    jiraKey,
    jiraSummary,
    jiraDescription,
    jiraIssueType,
    jiraStoryPoints,
    slackContent,
  }) => {

    try {
      const anthropic = await getAnthropicClient();

      // Build context string
      const contextParts: string[] = [];

      if (prTitle) {
        contextParts.push(`PR Title: ${prTitle}`);
      }
      if (prBody && prBody.length > 0) {
        contextParts.push(
          `PR Description: ${prBody.substring(0, 1000)}${prBody.length > 1000 ? '...' : ''}`
        );
      }
      if (prAdditions !== undefined || prDeletions !== undefined) {
        contextParts.push(
          `Code Changes: +${prAdditions || 0}/-${prDeletions || 0} lines`
        );
      }
      if (prFiles && prFiles.length > 0) {
        contextParts.push(
          `Files Changed: ${prFiles.slice(0, 10).join(', ')}${prFiles.length > 10 ? ` and ${prFiles.length - 10} more` : ''}`
        );
      }
      if (jiraKey) {
        contextParts.push(`Jira Ticket: ${jiraKey}`);
      }
      if (jiraSummary) {
        contextParts.push(`Jira Summary: ${jiraSummary}`);
      }
      if (jiraDescription && jiraDescription.length > 0) {
        contextParts.push(
          `Jira Description: ${jiraDescription.substring(0, 500)}${jiraDescription.length > 500 ? '...' : ''}`
        );
      }
      if (jiraIssueType) {
        contextParts.push(`Issue Type: ${jiraIssueType}`);
      }
      if (jiraStoryPoints) {
        contextParts.push(`Story Points: ${jiraStoryPoints}`);
      }
      if (slackContent) {
        contextParts.push(
          `Slack Message: ${slackContent.substring(0, 500)}${slackContent.length > 500 ? '...' : ''}`
        );
      }

      const prompt = `You are summarizing work for a software engineer's performance review.

Based on the following information, write a concise 2-3 sentence summary that:
1. Describes what was accomplished
2. Highlights the impact or value delivered
3. Uses professional language appropriate for a performance review

Context:
${contextParts.join('\n')}

Write ONLY the summary, nothing else. Do not include phrases like "The engineer" or "This PR" - write in a direct style as if documenting an accomplishment.`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return {
          success: false,
          error: 'Unexpected response type from AI',
        };
      }

      return {
        success: true,
        summary: content.text.trim(),
      };
    } catch (error) {
      // Fallback to simple summary if AI fails
      const fallbackSummary =
        prTitle ||
        jiraSummary ||
        slackContent?.substring(0, 100) ||
        'Work completed';

      return {
        success: true,
        summary: fallbackSummary,
        fallback: true,
        error:
          error instanceof Error ? error.message : 'AI summarization failed',
      };
    }
  },
});

/**
 * Tool: Categorize
 * Determine the category of work
 */
export const categorizeTool = tool({
  description:
    'Categorize work into predefined categories based on PR/Jira details.',
  inputSchema: categorizeParams,
  execute: async ({ title, description, issueType, files }) => {
    const text = `${title} ${description || ''} ${issueType || ''}`.toLowerCase();
    const fileText = (files || []).join(' ').toLowerCase();

    // Determine category based on keywords
    let category: string;
    let confidence: number;

    // Check for explicit patterns first
    if (
      text.includes('bug') ||
      text.includes('fix') ||
      text.includes('error') ||
      text.includes('issue') ||
      issueType?.toLowerCase() === 'bug'
    ) {
      category = 'bug';
      confidence = 0.9;
    } else if (
      text.includes('refactor') ||
      text.includes('clean') ||
      text.includes('improve') ||
      text.includes('optimize')
    ) {
      category = 'refactor';
      confidence = 0.85;
    } else if (
      text.includes('doc') ||
      text.includes('readme') ||
      text.includes('comment') ||
      fileText.includes('.md') ||
      fileText.includes('readme')
    ) {
      category = 'docs';
      confidence = 0.85;
    } else if (
      text.includes('test') ||
      text.includes('spec') ||
      text.includes('coverage') ||
      fileText.includes('test') ||
      fileText.includes('spec')
    ) {
      category = 'devex';
      confidence = 0.8;
    } else if (
      text.includes('ci') ||
      text.includes('pipeline') ||
      text.includes('deploy') ||
      text.includes('build') ||
      text.includes('config') ||
      text.includes('bump') ||
      text.includes('upgrade') ||
      text.includes('dependency')
    ) {
      category = 'devex';
      confidence = 0.75;
    } else if (
      text.includes('thank') ||
      text.includes('shout') ||
      text.includes('kudos') ||
      text.includes('great work') ||
      text.includes('awesome')
    ) {
      category = 'recognition';
      confidence = 0.9;
    } else if (
      text.includes('help') ||
      text.includes('assist') ||
      text.includes('support') ||
      text.includes('unblock')
    ) {
      category = 'help';
      confidence = 0.75;
    } else if (
      text.includes('add') ||
      text.includes('create') ||
      text.includes('implement') ||
      text.includes('new') ||
      text.includes('feature') ||
      issueType?.toLowerCase() === 'story'
    ) {
      category = 'feature';
      confidence = 0.7;
    } else {
      // Default to feature with lower confidence
      category = 'feature';
      confidence = 0.5;
    }

    return {
      success: true,
      category,
      confidence,
      reasoning: `Based on keywords in title/description: "${title.substring(0, 50)}..."`,
    };
  },
});

/**
 * Tool: Estimate Scope
 * Estimate the scope/impact of work
 */
export const estimateScopeTool = tool({
  description:
    'Estimate the scope (small/medium/large) of work based on code changes and story points.',
  inputSchema: estimateScopeParams,
  execute: async ({ additions, deletions, changedFiles, storyPoints, durationDays }) => {

    // Calculate scope based on multiple factors
    let score = 0;
    const factors: string[] = [];

    // Story points (strongest signal if available)
    if (storyPoints !== undefined) {
      if (storyPoints >= 8) {
        score += 3;
        factors.push(`${storyPoints} story points (large)`);
      } else if (storyPoints >= 3) {
        score += 2;
        factors.push(`${storyPoints} story points (medium)`);
      } else {
        score += 1;
        factors.push(`${storyPoints} story points (small)`);
      }
    }

    // Code changes
    const totalLines = (additions || 0) + (deletions || 0);
    if (totalLines > 500) {
      score += 2;
      factors.push(`${totalLines} lines changed (large)`);
    } else if (totalLines > 100) {
      score += 1;
      factors.push(`${totalLines} lines changed (medium)`);
    } else if (totalLines > 0) {
      factors.push(`${totalLines} lines changed (small)`);
    }

    // Files changed
    const files = changedFiles || 0;
    if (files > 20) {
      score += 2;
      factors.push(`${files} files changed (large)`);
    } else if (files > 5) {
      score += 1;
      factors.push(`${files} files changed (medium)`);
    } else if (files > 0) {
      factors.push(`${files} files changed (small)`);
    }

    // Duration
    if (durationDays !== undefined) {
      if (durationDays > 14) {
        score += 2;
        factors.push(`${durationDays} days to complete (long)`);
      } else if (durationDays > 3) {
        score += 1;
        factors.push(`${durationDays} days to complete (medium)`);
      } else {
        factors.push(`${durationDays} days to complete (short)`);
      }
    }

    // Determine scope
    let scope: 'small' | 'medium' | 'large';
    if (score >= 5) {
      scope = 'large';
    } else if (score >= 2) {
      scope = 'medium';
    } else {
      scope = 'small';
    }

    return {
      success: true,
      scope,
      score,
      factors,
    };
  },
});

/**
 * Tool: Match Criteria
 * Match evidence against performance review criteria using AI
 */
export const matchCriteriaTool = tool({
  description:
    'Match evidence against performance review criteria. Uses AI to find the most relevant criteria matches.',
  inputSchema: matchCriteriaParams,
  execute: async ({
    summary,
    category,
    prTitle,
    prBody,
    jiraSummary,
    jiraDescription,
    maxMatches,
    minConfidence,
  }) => {

    try {
      // Fetch criteria from database
      const criteria = await prisma.criterion.findMany({
        where: { prDetectable: true },
        orderBy: { id: 'asc' },
      });

      if (criteria.length === 0) {
        return {
          success: false,
          error: 'No criteria found in database',
          matches: [],
        };
      }

      const anthropic = await getAnthropicClient();

      // Build context
      const contextParts: string[] = [];
      contextParts.push(`Summary: ${summary}`);
      contextParts.push(`Category: ${category}`);
      if (prTitle) contextParts.push(`PR Title: ${prTitle}`);
      if (prBody)
        contextParts.push(
          `PR Description: ${prBody.substring(0, 500)}${prBody.length > 500 ? '...' : ''}`
        );
      if (jiraSummary) contextParts.push(`Jira Summary: ${jiraSummary}`);
      if (jiraDescription)
        contextParts.push(
          `Jira Description: ${jiraDescription.substring(0, 500)}${jiraDescription.length > 500 ? '...' : ''}`
        );

      const prompt = `You are matching software engineering work against performance review criteria.

Work being evaluated:
${contextParts.join('\n')}

Performance Criteria:
${criteria.map((c) => `${c.id}. [${c.areaOfConcentration} > ${c.subarea}] ${c.description}`).join('\n')}

Instructions:
1. Analyze the work and identify which criteria it demonstrates
2. Only match criteria with clear evidence (confidence > 40%)
3. Return up to ${maxMatches} best matches
4. For each match, explain the specific evidence

Respond with JSON only:
{
  "matches": [
    {
      "criterion_id": <number>,
      "confidence": <0-100>,
      "explanation": "<specific evidence from the work>"
    }
  ]
}

If no criteria match, return: {"matches": []}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return {
          success: true,
          matches: [],
          error: 'Unexpected response type',
        };
      }

      // Parse JSON response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: true,
          matches: [],
          error: 'Could not parse AI response',
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const matches = (parsed.matches || [])
        .filter((m: { confidence: number }) => m.confidence / 100 >= minConfidence)
        .slice(0, maxMatches)
        .map((m: { criterion_id: number; confidence: number; explanation: string }) => ({
          criterionId: m.criterion_id,
          confidence: m.confidence / 100, // Convert to 0-1
          explanation: m.explanation,
        }));

      return {
        success: true,
        matches,
        criteriaEvaluated: criteria.length,
      };
    } catch (error) {
      return {
        success: false,
        matches: [],
        error: `Criteria matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

export const analysisTools = {
  summarize: summarizeTool,
  categorize: categorizeTool,
  estimateScope: estimateScopeTool,
  matchCriteria: matchCriteriaTool,
};
