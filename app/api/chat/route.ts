import { streamText } from 'ai';
import { getAgent, type AgentType } from '@/lib/ai/agents';
import { getConfiguredModel } from '@/lib/ai/config';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages, agentType } = await req.json();

    // Validate agent type
    if (!agentType || !['performance-analyst', 'goal-generator', 'evidence-reviewer', 'review-assistant'].includes(agentType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid agent type. Must be one of: performance-analyst, goal-generator, evidence-reviewer, review-assistant' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the appropriate agent configuration
    const agent = getAgent(agentType as AgentType);

    // Get model from database configuration
    const model = await getConfiguredModel();

    // Stream the response with tool support
    const result = streamText({
      model,
      system: agent.system,
      messages,
      tools: agent.tools,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      return new Response(
        JSON.stringify({
          error: 'Failed to process chat request',
          details: error.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
