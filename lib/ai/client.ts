/**
 * Anthropic client factory.
 *
 * Returns an Anthropic client that exposes the `messages.create(...)` API.
 */
import Anthropic from '@anthropic-ai/sdk';

export type AnthropicLikeClient = Anthropic;

/**
 * Create an Anthropic client using the API key from environment.
 *
 * @param apiKey - Optional API key. If not provided, uses ANTHROPIC_API_KEY env var.
 */
export function createAnthropicClient(apiKey?: string): AnthropicLikeClient {
  return new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * Model IDs for Anthropic's Claude models.
 * These are the direct Anthropic model IDs (no Bedrock mapping needed).
 */
export const ANTHROPIC_MODELS = {
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20250929': 'claude-haiku-4-5-20250929',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022': 'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229': 'claude-3-opus-20240229',
} as const;

/**
 * Resolve a model ID. For direct Anthropic API, this is a pass-through.
 * Kept for backward compatibility with call sites that still use resolveModelId.
 */
export function resolveModelId(modelId: string): string {
  return modelId;
}
