import { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '../db/prisma';
import { getAnthropicApiKey, MODEL_CONFIGS } from '@/lib/ai/config';

/**
 * Worker for analyzing performance review documents
 * Extracts themes, strengths, growth areas, and achievements using AI
 */

export interface ReviewAnalysisJobConfig {
  reviewText: string;
  title: string;
  year?: string;
  reviewType: 'EMPLOYEE' | 'MANAGER' | 'PEER' | 'SELF';
  source?: string;
  metadata?: Record<string, any>;
}

interface AnalysisResult {
  summary: string;
  themes: string[];
  strengths: string[];
  growthAreas: string[];
  achievements: string[];
  confidenceScore: number;
}

/**
 * Process a review analysis job
 */
export async function processReviewAnalysisJob(jobId: string): Promise<void> {
  console.log(`[ReviewAnalysis] Starting job ${jobId}`);

  try {
    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== 'PENDING') {
      throw new Error(`Job ${jobId} is not in PENDING state (current: ${job.status})`);
    }

    // Parse config
    const config: ReviewAnalysisJobConfig = job.config ? JSON.parse(job.config) : {};

    // Validate config
    if (!config.reviewText || !config.reviewText.trim()) {
      throw new Error('reviewText is required in job config');
    }

    if (!config.title || !config.title.trim()) {
      throw new Error('title is required in job config');
    }

    // Update job status to IN_PROGRESS
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        progress: 0,
        logs: JSON.stringify([{ timestamp: new Date(), message: 'Starting review analysis' }]),
      },
    });

    // Get API key
    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey();
    } catch (error) {
      throw new Error('Anthropic API key not configured. Please configure in settings.');
    }

    // Update progress
    await updateJobProgress(jobId, 10, 'Initializing AI client');

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // Construct AI prompt
    await updateJobProgress(jobId, 20, 'Analyzing review content with AI');

    const prompt = buildAnalysisPrompt(config);

    // Call Anthropic API
    const completion = await anthropic.messages.create({
      model: MODEL_CONFIGS.STANDARD.model,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    await updateJobProgress(jobId, 60, 'Parsing AI analysis results');

    const responseText = completion.content[0].type === 'text' ? completion.content[0].text : '';

    // Parse and validate analysis
    const analysis = parseAnalysisResponse(responseText);

    await updateJobProgress(jobId, 80, 'Saving analysis to database');

    // Store analysis in database
    const reviewAnalysis = await prisma.reviewAnalysis.create({
      data: {
        title: config.title,
        year: config.year,
        reviewType: config.reviewType,
        source: config.source,
        originalText: config.reviewText,
        aiSummary: analysis.summary,
        themes: JSON.stringify(analysis.themes),
        strengths: JSON.stringify(analysis.strengths),
        growthAreas: JSON.stringify(analysis.growthAreas),
        achievements: JSON.stringify(analysis.achievements),
        confidenceScore: analysis.confidenceScore,
        metadata: config.metadata ? JSON.stringify(config.metadata) : null,
      },
    });

    await updateJobProgress(jobId, 100, 'Review analysis complete');

    // Mark job as completed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify({
          reviewAnalysisId: reviewAnalysis.id,
          summary: analysis.summary,
          themeCount: analysis.themes.length,
          strengthCount: analysis.strengths.length,
          growthAreaCount: analysis.growthAreas.length,
          achievementCount: analysis.achievements.length,
          confidenceScore: analysis.confidenceScore,
        }),
      },
    });

    console.log(`[ReviewAnalysis] Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`[ReviewAnalysis] Job ${jobId} failed:`, error);

    // Update job status to failed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

/**
 * Build the AI analysis prompt
 */
function buildAnalysisPrompt(config: ReviewAnalysisJobConfig): string {
  return `You are analyzing a performance review document for evidence extraction and insight generation.

Please analyze the following performance review and extract:

1. **Summary**: A concise 2-3 sentence summary of the overall review
2. **Themes**: 3-5 main themes or focus areas discussed in the review
3. **Strengths**: 3-7 key strengths or accomplishments highlighted
4. **Growth Areas**: 2-5 areas for growth or development mentioned
5. **Key Achievements**: 3-7 specific achievements or notable contributions

Review Type: ${config.reviewType}
${config.year ? `Review Period: ${config.year}` : ''}

Performance Review Text:
${config.reviewText}

Please respond in JSON format:
{
  "summary": "Brief 2-3 sentence summary",
  "themes": [
    "Theme 1",
    "Theme 2"
  ],
  "strengths": [
    "Strength 1 with brief context",
    "Strength 2 with brief context"
  ],
  "growthAreas": [
    "Growth area 1 with brief context",
    "Growth area 2 with brief context"
  ],
  "achievements": [
    "Achievement 1 with brief context",
    "Achievement 2 with brief context"
  ],
  "confidenceScore": 85
}

Focus on extracting concrete, specific information. The confidence score (0-100) should reflect how clear and comprehensive the review is. Be thorough but concise in your analysis.`;
}

/**
 * Parse and validate AI response
 */
function parseAnalysisResponse(responseText: string): AnalysisResult {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch =
      responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      responseText.match(/(\{[\s\S]*\})/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    const analysis = JSON.parse(jsonText);

    // Validate required fields
    if (!analysis.summary || !Array.isArray(analysis.themes)) {
      throw new Error('Analysis must include summary and themes array');
    }

    // Ensure all fields are arrays
    const ensureArray = (field: any) => (Array.isArray(field) ? field : []);

    return {
      summary: analysis.summary,
      themes: ensureArray(analysis.themes),
      strengths: ensureArray(analysis.strengths),
      growthAreas: ensureArray(analysis.growthAreas),
      achievements: ensureArray(analysis.achievements),
      confidenceScore: analysis.confidenceScore || 50,
    };
  } catch (error) {
    throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update job progress and logs
 */
async function updateJobProgress(
  jobId: string,
  progress: number,
  message: string
): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) return;

  const logs = job.logs ? JSON.parse(job.logs) : [];
  logs.push({ timestamp: new Date(), message });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress,
      logs: JSON.stringify(logs),
      updatedAt: new Date(),
    },
  });
}

/**
 * Analyze multiple reviews from a directory (batch processing)
 * This function can be used to migrate existing reviews from the lattice directory
 */
export interface BatchReviewAnalysisConfig {
  reviews: Array<{
    content: string;
    title: string;
    year?: string;
    reviewType: 'EMPLOYEE' | 'MANAGER' | 'PEER' | 'SELF';
    source?: string;
    weight?: number;
  }>;
}

/**
 * Process a batch of reviews
 */
export async function processBatchReviewAnalysis(
  jobId: string
): Promise<void> {
  console.log(`[BatchReviewAnalysis] Starting job ${jobId}`);

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const config: BatchReviewAnalysisConfig = job.config ? JSON.parse(job.config) : {};

    if (!config.reviews || !Array.isArray(config.reviews)) {
      throw new Error('reviews array is required in job config');
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        progress: 0,
      },
    });

    const totalReviews = config.reviews.length;
    let processedCount = 0;
    const results = [];

    for (const review of config.reviews) {
      try {
        await updateJobProgress(
          jobId,
          Math.round((processedCount / totalReviews) * 100),
          `Processing review ${processedCount + 1}/${totalReviews}: ${review.title}`
        );

        // Create a sub-job config for this review
        const reviewConfig: ReviewAnalysisJobConfig = {
          reviewText: review.content,
          title: review.title,
          year: review.year,
          reviewType: review.reviewType,
          source: review.source,
          metadata: review.weight ? { weight: review.weight } : undefined,
        };

        // Get API key
        const apiKey = await getAnthropicApiKey();
        const anthropic = new Anthropic({ apiKey });

        // Analyze this review
        const prompt = buildAnalysisPrompt(reviewConfig);
        const completion = await anthropic.messages.create({
          model: MODEL_CONFIGS.STANDARD.model,
          max_tokens: 4096,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        });

        const responseText =
          completion.content[0].type === 'text' ? completion.content[0].text : '';
        const analysis = parseAnalysisResponse(responseText);

        // Save to database
        const reviewAnalysis = await prisma.reviewAnalysis.create({
          data: {
            title: reviewConfig.title,
            year: reviewConfig.year,
            reviewType: reviewConfig.reviewType,
            source: reviewConfig.source,
            originalText: reviewConfig.reviewText,
            aiSummary: analysis.summary,
            themes: JSON.stringify(analysis.themes),
            strengths: JSON.stringify(analysis.strengths),
            growthAreas: JSON.stringify(analysis.growthAreas),
            achievements: JSON.stringify(analysis.achievements),
            confidenceScore: analysis.confidenceScore,
            metadata: reviewConfig.metadata ? JSON.stringify(reviewConfig.metadata) : null,
          },
        });

        results.push({
          reviewId: reviewAnalysis.id,
          title: review.title,
          success: true,
        });

        processedCount++;
      } catch (error) {
        console.error(`Failed to process review ${review.title}:`, error);
        results.push({
          title: review.title,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        processedCount++;
      }
    }

    // Mark job as completed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        result: JSON.stringify({
          totalReviews,
          processedCount,
          successCount: results.filter((r) => r.success).length,
          failedCount: results.filter((r) => !r.success).length,
          results,
        }),
      },
    });

    console.log(`[BatchReviewAnalysis] Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`[BatchReviewAnalysis] Job ${jobId} failed:`, error);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
