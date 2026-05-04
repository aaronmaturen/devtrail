import { getConfigValue } from './utils';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Returns an empty string. The app authenticates to Claude via AWS
 * Bedrock now, so an Anthropic API key is no longer required. Kept
 * for backward compatibility with call sites.
 */
export async function getAnthropicApiKey(): Promise<string> {
  return '';
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
