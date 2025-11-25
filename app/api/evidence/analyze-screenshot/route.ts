import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db/prisma';
import { getAnthropicApiKey, MODEL_CONFIGS } from '@/lib/ai/config';

/**
 * POST /api/evidence/analyze-screenshot
 * Analyze a screenshot of a Slack message using Claude Vision API
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('screenshot') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'Screenshot file is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
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

    // Read file as base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');

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
    const prompt = `You are analyzing a screenshot of a Slack message for a performance review evidence collection system.

Please analyze this Slack screenshot and extract the following information:

1. **Message Author**: The name/username of the person who sent the message
2. **Message Date/Time**: When the message was sent
3. **Channel/Thread**: The channel name or thread context
4. **Message Text**: The complete text content of the message(s) in the screenshot
5. **Reactions**: Any emoji reactions or responses visible
6. **Title**: A clear, concise title (2-8 words) that captures the main achievement or contribution shown
7. **Description**: A description (1-3 sentences) explaining the impact and context of what's shown
8. **Performance Criteria**: The top 1-3 most relevant performance criterion IDs from the list below, with confidence scores
9. **Slack Link Hint**: If you can see any part of a URL or workspace name, extract it

Available Performance Criteria:
${criteriaList}

Please respond in JSON format:
{
  "author": "Name of message author",
  "timestamp": "Date/time of message",
  "channel": "Channel or thread name",
  "message_text": "Complete message content",
  "reactions": "Description of reactions if any",
  "title": "Brief title of the achievement",
  "description": "Description explaining the impact and context",
  "criteria": [
    {
      "criterion_id": 1,
      "confidence": 0.85,
      "explanation": "Why this criterion is relevant"
    }
  ],
  "slack_url_hint": "any URL fragments visible"
}

Focus on identifying concrete achievements, problem-solving, collaboration, kudos, or impact demonstrated in the message. Only include criteria that are clearly demonstrated.`;

    console.log('Analyzing screenshot with Claude Vision API...');

    // Call Anthropic Vision API
    const completion = await anthropic.messages.create({
      model: MODEL_CONFIGS.STANDARD.model, // Use Sonnet for better vision understanding
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: prompt
          }
        ],
      }],
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
      author: analysis.author || '',
      timestamp: analysis.timestamp || '',
      channel: analysis.channel || '',
      messageText: analysis.message_text || '',
      reactions: analysis.reactions || '',
      title: analysis.title,
      description: analysis.description,
      criteria: analysis.criteria,
      slackUrlHint: analysis.slack_url_hint || '',
    });
  } catch (error) {
    console.error('Error analyzing screenshot:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze screenshot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
