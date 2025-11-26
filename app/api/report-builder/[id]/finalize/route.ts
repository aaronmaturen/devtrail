import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { getConfiguredModelId } from '@/lib/ai/config';

/**
 * POST /api/report-builder/[id]/finalize
 * Finalize a report document:
 * - Extract content from all blocks
 * - Use AI to analyze and extract themes, strengths, growth areas, achievements
 * - Create a ReviewAnalysis record
 * - Update document status to PUBLISHED
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { year, reviewType = 'SELF' } = body;

    // Fetch the document with all blocks
    const document = await prisma.reportDocument.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.status === 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Document is already published' },
        { status: 400 }
      );
    }

    // Combine all block content into a single document
    const contentParts: string[] = [];
    document.blocks.forEach((block) => {
      if (block.type === 'HEADING' && block.content) {
        contentParts.push(`## ${block.content}\n`);
      } else if (block.type === 'PROMPT_RESPONSE') {
        if (block.prompt) {
          contentParts.push(`**${block.prompt}**\n`);
        }
        if (block.content) {
          contentParts.push(`${block.content}\n`);
        }
      } else if (block.type === 'TEXT' && block.content) {
        contentParts.push(`${block.content}\n`);
      } else if (block.type === 'DIVIDER') {
        contentParts.push('---\n');
      }
    });

    const fullContent = contentParts.join('\n');

    if (!fullContent.trim()) {
      return NextResponse.json(
        { error: 'Document has no content to finalize' },
        { status: 400 }
      );
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

    const modelId = await getConfiguredModelId();
    const anthropic = new Anthropic({
      apiKey: JSON.parse(apiKeyConfig.value),
    });

    // Use AI to extract themes, strengths, growth areas, achievements
    const analysisPrompt = `Analyze this performance review self-assessment and extract key information. Return a JSON object with the following fields:

{
  "summary": "A 2-3 sentence summary of the overall review",
  "themes": ["array of 3-5 major themes/topics discussed"],
  "strengths": ["array of 3-7 strengths demonstrated"],
  "growthAreas": ["array of 2-5 growth areas or development goals mentioned"],
  "achievements": ["array of 3-7 key achievements or accomplishments mentioned"]
}

Be specific and pull actual content from the review. Return ONLY valid JSON, no other text.

REVIEW CONTENT:
${fullContent}`;

    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 2048,
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const aiResponse =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the AI response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback with empty arrays
      analysis = {
        summary: 'Analysis could not be completed automatically.',
        themes: [],
        strengths: [],
        growthAreas: [],
        achievements: [],
      };
    }

    // Create the ReviewAnalysis record
    const reviewAnalysis = await prisma.reviewAnalysis.create({
      data: {
        title: document.name,
        year: year || new Date().getFullYear().toString(),
        reviewType,
        source: `report-builder:${document.id}`,
        originalText: fullContent,
        aiSummary: analysis.summary || '',
        themes: JSON.stringify(analysis.themes || []),
        strengths: JSON.stringify(analysis.strengths || []),
        growthAreas: JSON.stringify(analysis.growthAreas || []),
        achievements: JSON.stringify(analysis.achievements || []),
        confidenceScore: 0.85,
        metadata: JSON.stringify({
          sourceDocumentId: document.id,
          blocksCount: document.blocks.length,
          finalizedAt: new Date().toISOString(),
        }),
      },
    });

    // Update the document status to PUBLISHED
    const updatedDocument = await prisma.reportDocument.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });

    return NextResponse.json({
      success: true,
      document: {
        ...updatedDocument,
        contextConfig: JSON.parse(updatedDocument.contextConfig || '{}'),
      },
      reviewAnalysis: {
        id: reviewAnalysis.id,
        title: reviewAnalysis.title,
        year: reviewAnalysis.year,
        reviewType: reviewAnalysis.reviewType,
        summary: reviewAnalysis.aiSummary,
        themes: JSON.parse(reviewAnalysis.themes),
        strengths: JSON.parse(reviewAnalysis.strengths),
        growthAreas: JSON.parse(reviewAnalysis.growthAreas),
        achievements: JSON.parse(reviewAnalysis.achievements),
      },
    });
  } catch (error) {
    console.error('Error finalizing report:', error);
    return NextResponse.json(
      { error: 'Failed to finalize report' },
      { status: 500 }
    );
  }
}
