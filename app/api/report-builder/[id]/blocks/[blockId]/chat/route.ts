import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey, getConfiguredModelId } from '@/lib/ai/config';

/**
 * POST /api/report-builder/[id]/blocks/[blockId]/chat
 * Interactive chat for refining block content
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  try {
    const { id, blockId } = await params;
    const body = await request.json();
    const { message, chatHistory = [] } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Fetch block and document
    const block = await prisma.reportBlock.findFirst({
      where: { id: blockId, documentId: id },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    const document = await prisma.reportDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get API key from centralized config
    const apiKey = await getAnthropicApiKey();

    // Build conversation messages
    const systemPrompt = `You are an expert writing assistant helping refine performance review content through conversation.

Current block content:
---
${block.content}
---

## How to Respond

1. **Have a conversation first** - Ask clarifying questions if the request is vague or you need more context. Examples:
   - "What specific metrics or outcomes would you like me to highlight?"
   - "Should I focus more on technical impact or team collaboration?"
   - "Would you prefer a more formal or conversational tone?"

2. **Only revise when ready** - When you have enough information and are ready to make changes, include your revised version wrapped in <revised_content> tags. The user will see a diff and can accept or reject.

3. **You can do both** - You can ask a follow-up question AND provide a revised version if you want to offer something while getting feedback.

## When Providing Revisions

When you include <revised_content> tags:
- Output the COMPLETE revised content, not just changes
- Maintain the original voice and tone unless asked to change it
- Keep content specific and data-driven
- Preserve concrete examples and metrics
- Write in first person from the engineer's perspective
- Be concise but impactful

## Examples

User: "make it better"
You: "I'd be happy to help improve this! Could you tell me what aspects you'd like to focus on? For example:
- More specific metrics or outcomes?
- Stronger action verbs?
- Better flow between sentences?
- Highlighting different achievements?"

User: "add more metrics"
You: "I'll add more quantifiable results. Here's a revised version:

<revised_content>
[full revised content here]
</revised_content>

I've added specific numbers around [X, Y, Z]. Would you like me to adjust any of these figures or add different metrics?"`;

    // Build message history
    const messages: Anthropic.MessageParam[] = [
      ...chatHistory.map((msg: { role: 'user' | 'assistant'; content: string }) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    // Get model from database configuration
    const modelId = await getConfiguredModelId();

    // Call Claude
    const anthropic = new Anthropic({
      apiKey,
    });

    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const assistantResponse =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract revised content
    const revisedMatch = assistantResponse.match(
      /<revised_content>([\s\S]*?)<\/revised_content>/
    );

    const revisedContent = revisedMatch ? revisedMatch[1].trim() : null;

    // Return the revised content for diff display (don't save yet - user will accept/reject)
    return NextResponse.json({
      response: assistantResponse,
      revisedContent,
      originalContent: block.content,
      hasRevision: !!revisedContent,
      usage: response.usage,
    });
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}
