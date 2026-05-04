/**
 * Anthropic-on-Bedrock client factory.
 *
 * Returns an AnthropicBedrock client that exposes the same
 * `messages.create(...)` API as the direct Anthropic SDK, so call
 * sites do not change.
 */
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';

export type AnthropicLikeClient = AnthropicBedrock;

/**
 * Kept for backward-compat with call sites that still check the
 * provider. We always run on Bedrock now.
 */
export function isBedrock(): boolean {
  return true;
}

/**
 * Create an Anthropic-compatible client backed by AWS Bedrock.
 *
 * The optional apiKey argument is ignored; AWS credentials come from
 * the standard env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_SESSION_TOKEN, AWS_REGION) or the default AWS credential chain.
 */
export function createAnthropicClient(_apiKey?: string): AnthropicLikeClient {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKey && secretKey) {
    return new AnthropicBedrock({
      awsRegion: process.env.AWS_REGION,
      awsAccessKey: accessKey,
      awsSecretKey: secretKey,
      awsSessionToken: process.env.AWS_SESSION_TOKEN || null,
    });
  }
  // Fall back to the default AWS credential provider chain.
  return new AnthropicBedrock({ awsRegion: process.env.AWS_REGION });
}

/**
 * Bedrock requires inference profile IDs rather than the bare Anthropic
 * model IDs. This maps the model IDs the app stores into Bedrock IDs.
 *
 * The "us." prefix denotes a US cross-region inference profile, which is
 * required for Claude 4.x models on Bedrock.
 */
const BEDROCK_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-5-20250929': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  // Haiku 4.5 was released to Bedrock with a 20251001 date stamp even
  // though the Anthropic direct-API ID uses 20250929.
  'claude-haiku-4-5-20250929': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'claude-sonnet-4-20250514': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'claude-3-5-sonnet-20241022': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  'claude-3-5-haiku-20241022': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  'claude-3-opus-20240229': 'anthropic.claude-3-opus-20240229-v1:0',
};

/**
 * Translate a model ID into a Bedrock inference profile ID. If the input
 * already looks like a Bedrock ID, it is returned unchanged.
 */
export function resolveModelId(modelId: string): string {
  if (modelId.startsWith('anthropic.') || modelId.startsWith('us.anthropic.')) {
    return modelId;
  }
  return BEDROCK_MODEL_MAP[modelId] ?? `us.${modelId}`;
}
