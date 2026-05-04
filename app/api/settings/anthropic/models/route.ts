import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredModelId } from '@/lib/ai/config';
import { createAnthropicClient, resolveModelId } from '@/lib/ai/client';

export const runtime = 'nodejs';

/**
 * GET /api/settings/anthropic/models
 * Returns the curated list of Claude models available on Bedrock and
 * validates AWS credentials by issuing a small test request against
 * the user's configured model.
 */
export async function GET(request: NextRequest) {
  try {
    const anthropic = createAnthropicClient();

    // Anthropic doesn't have a models list API, so we return a curated list
    const models = [
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        description: 'Latest and most intelligent model, best for complex tasks',
        contextWindow: 200000,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description: 'Powerful model with advanced capabilities',
        contextWindow: 200000,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Previous generation, very capable',
        contextWindow: 200000,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fastest model, great for quick tasks',
        contextWindow: 200000,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Previous generation Opus',
        contextWindow: 200000,
      },
    ];

    // Validate AWS credentials by making a small request against the
    // user's configured model. Each Bedrock model requires explicit
    // account-level access, so we test the actual model in use.
    const testModelId = await getConfiguredModelId();

    try {
      await anthropic.messages.create({
        model: resolveModelId(testModelId),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      console.error('[models] validation call failed:', error);
      return NextResponse.json(
        {
          error: `AWS Bedrock request failed (model: ${resolveModelId(testModelId)}): ${message}`,
          details: message,
        },
        { status: 401 }
      );
    }

    return NextResponse.json({ models });
  } catch (error) {
    console.error('Failed to fetch Anthropic models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
