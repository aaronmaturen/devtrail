import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '@/lib/ai/config';

export const runtime = 'nodejs';

/**
 * GET /api/settings/anthropic/models
 * Fetches available Anthropic models using the stored API key
 */
export async function GET(request: NextRequest) {
  try {
    // Get the Anthropic API key from centralized config
    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey();
    } catch (error) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 400 }
      );
    }

    // Create client
    const anthropic = new Anthropic({ apiKey });

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

    // Validate the key works by making a small request
    try {
      await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Invalid Anthropic API key', details: error.message },
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
