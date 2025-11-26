import { getConfigValue } from './utils';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Get Anthropic API key from Config table or environment
 * Priority: Database Config > Environment Variable
 * @returns Anthropic API key
 * @throws Error if API key not found in database or environment
 */
export async function getAnthropicApiKey(): Promise<string> {
  // Try database first
  const dbKey = await getConfigValue('anthropic_api_key');
  if (dbKey) {
    try {
      return JSON.parse(dbKey);
    } catch {
      return dbKey;
    }
  }

  // Fallback to environment variable
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return envKey;
  }

  throw new Error('Anthropic API key not configured. Set it in Settings or ANTHROPIC_API_KEY environment variable.');
}

/**
 * Get configured Anthropic model ID from database
 * Checks multiple possible keys for backward compatibility
 * @returns Configured model ID or DEFAULT_MODEL
 */
export async function getAnthropicModelId(): Promise<string> {
  // Check multiple possible keys for backward compatibility
  const modelId = await getConfigValue('anthropic_model')
    || await getConfigValue('claude_model')
    || await getConfigValue('selected_model');

  if (modelId) {
    try {
      return JSON.parse(modelId);
    } catch {
      return modelId;
    }
  }

  return DEFAULT_MODEL;
}

/**
 * Get both API key and model ID for Anthropic configuration
 * @returns Object with apiKey and modelId
 */
export async function getAnthropicConfig(): Promise<{ apiKey: string; modelId: string }> {
  const [apiKey, modelId] = await Promise.all([
    getAnthropicApiKey(),
    getAnthropicModelId(),
  ]);
  return { apiKey, modelId };
}

/**
 * Alias for getAnthropicModelId for backward compatibility
 * @deprecated Use getAnthropicModelId instead
 */
export const getConfiguredModelId = getAnthropicModelId;
