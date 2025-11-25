import { anthropic } from '@ai-sdk/anthropic';
import { prisma } from '../db/prisma';

/**
 * Get Anthropic API key from Config table or environment
 * Priority: Database Config > Environment Variable
 */
export async function getAnthropicApiKey(): Promise<string> {
  // First try to get from database
  try {
    const config = await prisma.config.findUnique({
      where: { key: 'anthropic_api_key' }
    });

    if (config?.value) {
      const parsed = JSON.parse(config.value);
      if (typeof parsed === 'string' && parsed) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Could not retrieve API key from database:', error);
  }

  // Fallback to environment variable
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) {
    throw new Error('Anthropic API key not found in database or environment');
  }

  return envKey;
}

/**
 * Model configurations for different use cases
 */
export const MODEL_CONFIGS = {
  // Fast model for quick analysis and tool use
  FAST: {
    model: 'claude-3-5-haiku-20241022',
    temperature: 0.7,
    maxTokens: 4096,
  },
  // Standard model for most AI tasks
  STANDARD: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 8192,
  },
  // Long context model for comprehensive analysis
  EXTENDED: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 16384,
  },
  // Creative model for generating narratives and summaries
  CREATIVE: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.9,
    maxTokens: 8192,
  },
} as const;

/**
 * Get configured Anthropic model for a specific use case
 * @param apiKey - Anthropic API key
 * @param config - Model configuration (defaults to STANDARD)
 */
export function getAnthropicModel(
  apiKey: string,
  config: keyof typeof MODEL_CONFIGS = 'STANDARD'
) {
  const modelConfig = MODEL_CONFIGS[config];
  return anthropic(modelConfig.model);
}

/**
 * Initialize AI with API key from database or environment
 * Usage:
 * const model = await initializeAI('STANDARD');
 */
export async function initializeAI(config: keyof typeof MODEL_CONFIGS = 'STANDARD') {
  const apiKey = await getAnthropicApiKey();
  return getAnthropicModel(apiKey, config);
}

/**
 * System prompts for different agent types
 */
export const SYSTEM_PROMPTS = {
  EVIDENCE_ANALYZER: `You are an AI assistant that helps analyze performance review evidence.
Your role is to:
- Match evidence to performance criteria with confidence scores
- Identify key accomplishments and impact
- Suggest improvements to evidence documentation
- Provide constructive feedback on performance patterns

Be specific, data-driven, and constructive in your analysis.`,

  GOAL_ASSISTANT: `You are an AI assistant that helps create and track SMART goals.
Your role is to:
- Help formulate specific, measurable, achievable, relevant, and time-bound goals
- Track progress against existing goals
- Identify evidence that supports goal achievement
- Suggest next steps and milestones

Be encouraging, realistic, and focused on growth.`,

  REVIEW_WRITER: `You are an AI assistant that helps write performance reviews.
Your role is to:
- Synthesize evidence into compelling narratives
- Highlight key accomplishments and growth areas
- Maintain a professional and balanced tone
- Structure content clearly with supporting examples

Be comprehensive, fair, and evidence-based in your writing.`,

  REPORT_GENERATOR: `You are an AI assistant that generates performance reports.
Your role is to:
- Analyze evidence across multiple criteria
- Identify patterns and trends in performance
- Provide quantitative and qualitative insights
- Format reports in clear, readable markdown

Be analytical, thorough, and well-structured in your reports.`,
} as const;
