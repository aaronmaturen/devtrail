import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { getConfiguredModelId } from '@/lib/ai/config';

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

    // Get API key
    const apiKeyConfig = await prisma.config.findUnique({
      where: { key: 'anthropic_api_key' },
    });

    if (!apiKeyConfig?.value) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 400 }
      );
    }

    // Build conversation messages
    const systemPrompt = `You are an expert writing assistant helping refine performance review content.

Current block content:
---
${block.content}
---

Help the user refine this content based on their feedback. When they're satisfied with changes,
output the final version wrapped in <final_content> tags so it can be extracted and saved.

Guidelines:
- Maintain the original voice and tone unless asked to change it
- Keep content specific and data-driven
- Preserve any concrete examples and metrics
- Write in first person from the engineer's perspective
- Be concise but impactful`;

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
      apiKey: JSON.parse(apiKeyConfig.value),
    });

    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const assistantResponse =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Check if response contains final content to save
    const finalContentMatch = assistantResponse.match(
      /<final_content>([\s\S]*?)<\/final_content>/
    );

    let updatedBlock = null;
    if (finalContentMatch) {
      const finalContent = finalContentMatch[1].trim();

      // Create revision
      await prisma.reportBlockRevision.create({
        data: {
          blockId,
          previousContent: block.content,
          newContent: finalContent,
          changeType: 'AGENT_REFINEMENT',
          changedBy: 'AGENT',
          agentModel: modelId,
          agentPrompt: message,
        },
      });

      // Update block
      updatedBlock = await prisma.reportBlock.update({
        where: { id: blockId },
        data: {
          content: finalContent,
          metadata: JSON.stringify({
            ...JSON.parse(block.metadata || '{}'),
            lastRefinedAt: new Date().toISOString(),
            lastRefinementPrompt: message,
          }),
        },
      });
    }

    return NextResponse.json({
      response: assistantResponse,
      blockUpdated: !!updatedBlock,
      updatedBlock: updatedBlock
        ? {
            ...updatedBlock,
            metadata: JSON.parse(updatedBlock.metadata || '{}'),
          }
        : null,
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
