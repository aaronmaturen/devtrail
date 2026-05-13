import { generateText, type CoreMessage } from 'ai';
import { getAgent, type AgentType } from '@/lib/ai/agents';
import { getConfiguredModel } from '@/lib/ai/config';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { messages: initialMessages, agentType } = await req.json();

    // Validate agent type
    if (!agentType || !['performance-analyst', 'goal-generator', 'evidence-reviewer'].includes(agentType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid agent type. Must be one of: performance-analyst, goal-generator, evidence-reviewer' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate messages
    if (!initialMessages || !Array.isArray(initialMessages) || initialMessages.length === 0) {
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

    // Manual agentic loop since AI SDK v6 beta has bug with maxSteps + Anthropic
    let messages: CoreMessage[] = initialMessages;
    let finalText = '';
    const maxIterations = 10;

    // Track saved responses from saveResponse tool calls
    const savedResponses: Array<{ questionId: string; response: string }> = [];

    for (let i = 0; i < maxIterations; i++) {
      console.log(`[Chat API] Iteration ${i + 1}`);

      const result = await generateText({
        model,
        system: agent.system,
        messages,
        tools: agent.tools,
        temperature: 0.7,
      });

      // In AI SDK v6, tool results are in steps[0].toolResults, not result.toolResults
      const toolResults = result.steps?.[0]?.toolResults ?? [];

      console.log(`[Chat API] Iteration ${i + 1}:`, result.finishReason, `tools: ${result.toolCalls?.length || 0}`);

      // Check for saveResponse tool calls and collect saved responses
      for (const tr of toolResults) {
        if (tr.toolName === 'saveResponse' && tr.output?.success) {
          // The tool returns questionId and response in its output
          const output = tr.output as { success: boolean; questionId: string; response: string };
          if (output.questionId && output.response) {
            savedResponses.push({
              questionId: output.questionId,
              response: output.response,
            });
          }
        }
      }

      // Accumulate text from this iteration
      if (result.text) {
        finalText += result.text;
      }

      // If model is done (not requesting tool calls), we're finished
      if (result.finishReason !== 'tool-calls' || !result.toolCalls?.length) {
        console.log(`[Chat API] Completed after ${i + 1} iterations`);
        break;
      }

      // Build messages for next iteration including tool calls and results
      // In AI SDK v6, tool results use 'output' instead of 'result'
      const toolResultMessages = toolResults.map(tr => ({
        type: 'tool-result' as const,
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: { type: 'json' as const, value: tr.output ?? {} },
      }));

      messages = [
        ...messages,
        {
          role: 'assistant' as const,
          content: [
            ...(result.text ? [{ type: 'text' as const, text: result.text }] : []),
            ...result.toolCalls.map(tc => ({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.args ?? {},
            })),
          ],
        },
        {
          role: 'tool' as const,
          content: toolResultMessages,
        },
      ];
    }

    // Return JSON response with text and any saved responses
    return new Response(
      JSON.stringify({
        text: finalText,
        savedResponses,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
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
