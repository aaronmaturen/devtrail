import { bedrock } from '@ai-sdk/amazon-bedrock';
import { prisma } from '../db/prisma';
import { resolveModelId } from './client';

/**
 * Returns an empty string. Kept for backward compatibility with call
 * sites that still expect to receive an "API key". On Bedrock we
 * authenticate via AWS credentials, not an Anthropic API key.
 */
export async function getAnthropicApiKey(): Promise<string> {
  return '';
}

/**
 * Get GitHub token from Config table or environment
 * Priority: Database Config > Environment Variable
 */
export async function getGitHubToken(): Promise<string> {
  // First try to get from database
  try {
    const config = await prisma.config.findUnique({
      where: { key: 'github_token' }
    });

    if (config?.value) {
      const parsed = JSON.parse(config.value);
      if (typeof parsed === 'string' && parsed) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Could not retrieve GitHub token from database:', error);
  }

  // Fallback to environment variable
  const envKey = process.env.GITHUB_TOKEN;
  if (!envKey) {
    throw new Error('GitHub token not found in database or environment');
  }

  return envKey;
}

/**
 * Get Jira credentials from Config table
 * Returns an object with host, email, and apiToken
 */
export async function getJiraCredentials(): Promise<{
  host: string;
  email: string;
  apiToken: string;
}> {
  try {
    const [hostConfig, emailConfig, tokenConfig] = await Promise.all([
      prisma.config.findUnique({ where: { key: 'jira_host' } }),
      prisma.config.findUnique({ where: { key: 'jira_email' } }),
      prisma.config.findUnique({ where: { key: 'jira_api_token' } }),
    ]);

    const host = hostConfig?.value ? JSON.parse(hostConfig.value) : null;
    const email = emailConfig?.value ? JSON.parse(emailConfig.value) : null;
    const apiToken = tokenConfig?.value ? JSON.parse(tokenConfig.value) : null;

    if (!host || !email || !apiToken) {
      throw new Error('Jira credentials not fully configured in database');
    }

    return { host, email, apiToken };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not fully configured')) {
      throw error;
    }
    throw new Error(`Failed to retrieve Jira credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Model configurations for different use cases
 */
export const MODEL_CONFIGS = {
  // Fast model for quick analysis and tool use
  FAST: {
    model: 'claude-haiku-4-5-20250929',
    temperature: 0.7,
    maxTokens: 4096,
  },
  // Standard model for most AI tasks
  STANDARD: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.7,
    maxTokens: 8192,
  },
  // Long context model for comprehensive analysis
  EXTENDED: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.7,
    maxTokens: 16384,
  },
  // Creative model for generating narratives and summaries
  CREATIVE: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.9,
    maxTokens: 8192,
  },
} as const;

/**
 * Get configured Bedrock model for a specific use case.
 * The apiKey argument is unused; AWS credentials come from env.
 */
export function getAnthropicModel(
  _apiKey: string,
  config: keyof typeof MODEL_CONFIGS = 'STANDARD'
) {
  const modelConfig = MODEL_CONFIGS[config];
  return bedrock(resolveModelId(modelConfig.model));
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
 * Default model ID used when no model is configured in the database
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Get the configured model ID from the database
 * Falls back to DEFAULT_MODEL if not configured
 */
export async function getConfiguredModelId(): Promise<string> {
  try {
    const config = await prisma.config.findUnique({
      where: { key: 'anthropic_model' }
    });

    if (config?.value) {
      const parsed = JSON.parse(config.value);
      if (typeof parsed === 'string' && parsed) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Could not retrieve model from database:', error);
  }

  return DEFAULT_MODEL;
}

/**
 * Get a configured Anthropic model instance from database settings
 * This is the primary way to get a model for AI SDK usage
 */
export async function getConfiguredModel() {
  const modelId = await getConfiguredModelId();
  return bedrock(resolveModelId(modelId));
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
