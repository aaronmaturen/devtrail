import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db/prisma';
import { getAnthropicApiKey, MODEL_CONFIGS } from '@/lib/ai/config';

/**
 * POST /api/evidence/analyze-slack
 * Analyze a Slack message using AI to extract title, description, and relevant criteria
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageText, slackLink } = body;

    if (!messageText || !messageText.trim()) {
      return NextResponse.json(
        { error: 'Message text is required' },
        { status: 400 }
      );
    }

    // Get API key
    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey();
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Anthropic API key not configured',
          details: 'Please configure your Anthropic API key in settings',
        },
        { status: 400 }
      );
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // Load criteria from database
    const criteria = await prisma.criterion.findMany({
      where: { prDetectable: true },
      orderBy: { id: 'asc' },
    });

    // Format criteria for AI prompt
    const criteriaList = criteria
      .map((c) => `${c.id}: ${c.areaOfConcentration} > ${c.subarea} - ${c.description}`)
      .join('\n');

    // Construct AI prompt
    const prompt = `You are analyzing a Slack message for a performance review evidence collection system.

Please analyze the following Slack message and extract:
1. A clear, concise title (2-8 words) that captures the main achievement or contribution
2. A description (1-3 sentences) that explains the impact and context
3. The top 1-3 most relevant performance criteria IDs from the list below, with confidence scores

Available Performance Criteria:
${criteriaList}

Slack Message:
${messageText}

${slackLink ? `\nSlack Link: ${slackLink}` : ''}

Please respond in JSON format:
{
  "title": "Brief title of the achievement",
  "description": "Description explaining the impact and context",
  "criteria": [
    {
      "criterion_id": 1,
      "confidence": 0.85,
      "explanation": "Why this criterion is relevant"
    }
  ]
}

Focus on identifying concrete achievements, problem-solving, collaboration, leadership, communication, or impact demonstrated in the message. Only include criteria that are clearly demonstrated in the message.`;

    // Call Anthropic API
    const completion = await anthropic.messages.create({
      model: MODEL_CONFIGS.FAST.model,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = completion.content[0].type === 'text' ? completion.content[0].text : '';

    // Try to parse JSON response
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                        responseText.match(/(\{[\s\S]*\})/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', responseText);
      return NextResponse.json(
        {
          error: 'Failed to parse AI analysis',
          details: 'The AI response could not be parsed',
        },
        { status: 500 }
      );
    }

    // Validate the analysis structure
    if (!analysis.title || !analysis.description) {
      return NextResponse.json(
        {
          error: 'Invalid analysis format',
          details: 'Analysis must include title and description',
        },
        { status: 500 }
      );
    }

    // Ensure criteria is an array
    if (!Array.isArray(analysis.criteria)) {
      analysis.criteria = [];
    }

    // Validate criteria IDs against database
    const validCriteriaIds = criteria.map((c) => c.id);
    analysis.criteria = analysis.criteria
      .filter((c: any) => validCriteriaIds.includes(c.criterion_id))
      .map((c: any) => ({
        criterionId: c.criterion_id,
        confidence: Math.min(Math.max(c.confidence * 100, 0), 100), // Convert to 0-100 scale
        explanation: c.explanation || '',
      }));

    return NextResponse.json({
      title: analysis.title,
      description: analysis.description,
      criteria: analysis.criteria,
    });
  } catch (error) {
    console.error('Error analyzing Slack message:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze Slack message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
