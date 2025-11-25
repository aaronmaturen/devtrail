import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { triggerJobProcessing } from '@/lib/workers/process-helper';

/**
 * POST /api/reviews/analyze
 * Analyze a performance review document using AI
 * Creates a REVIEW_ANALYSIS job and triggers processing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      reviewText,
      title,
      year,
      reviewType = 'EMPLOYEE',
      source,
      metadata,
    } = body;

    // Validate required fields
    if (!reviewText || !reviewText.trim()) {
      return NextResponse.json(
        { error: 'Review text is required' },
        { status: 400 }
      );
    }

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'Review title is required' },
        { status: 400 }
      );
    }

    // Validate reviewType
    const validReviewTypes = ['EMPLOYEE', 'MANAGER', 'PEER', 'SELF'];
    if (!validReviewTypes.includes(reviewType)) {
      return NextResponse.json(
        {
          error: 'Invalid review type',
          details: `Review type must be one of: ${validReviewTypes.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Create job with configuration
    const job = await prisma.job.create({
      data: {
        type: 'REVIEW_ANALYSIS',
        status: 'PENDING',
        progress: 0,
        config: JSON.stringify({
          reviewText,
          title,
          year,
          reviewType,
          source,
          metadata,
        }),
      },
    });

    // Trigger job processing
    await triggerJobProcessing(job.id, 'REVIEW_ANALYSIS');

    // Return job details
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      message: 'Review analysis job created successfully',
      details: {
        title,
        year,
        reviewType,
      },
    });
  } catch (error) {
    console.error('Error creating review analysis job:', error);
    return NextResponse.json(
      {
        error: 'Failed to create review analysis job',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reviews/analyze?jobId=xxx
 * Get the status and result of a review analysis job
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }

    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.type !== 'REVIEW_ANALYSIS') {
      return NextResponse.json(
        { error: 'Job is not a review analysis job' },
        { status: 400 }
      );
    }

    // Parse logs and result
    const logs = job.logs ? JSON.parse(job.logs) : [];
    const result = job.result ? JSON.parse(job.result) : null;

    // If completed successfully, fetch the review analysis
    let reviewAnalysis = null;
    if (job.status === 'COMPLETED' && result?.reviewAnalysisId) {
      const analysis = await prisma.reviewAnalysis.findUnique({
        where: { id: result.reviewAnalysisId },
      });

      if (analysis) {
        reviewAnalysis = {
          id: analysis.id,
          title: analysis.title,
          year: analysis.year,
          reviewType: analysis.reviewType,
          source: analysis.source,
          summary: analysis.aiSummary,
          themes: JSON.parse(analysis.themes),
          strengths: JSON.parse(analysis.strengths),
          growthAreas: JSON.parse(analysis.growthAreas),
          achievements: JSON.parse(analysis.achievements),
          confidenceScore: analysis.confidenceScore,
          metadata: analysis.metadata ? JSON.parse(analysis.metadata) : null,
          createdAt: analysis.createdAt,
        };
      }
    }

    return NextResponse.json({
      jobId: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      logs,
      result,
      error: job.error,
      reviewAnalysis,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching review analysis job:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch review analysis job',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
