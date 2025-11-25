import { NextRequest, NextResponse } from 'next/server';

/**
 * Vercel Cron Job Handler
 *
 * This endpoint is called by Vercel Cron to process background jobs automatically.
 * It validates the cron secret to ensure only authorized requests are processed.
 *
 * Security:
 * - Must be called with Authorization: Bearer <CRON_SECRET>
 * - Or with ?secret=<CRON_SECRET> query parameter
 *
 * Configuration:
 * - Add CRON_SECRET to your environment variables
 * - Configure cron schedule in vercel.json
 */

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const urlSecret = request.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Cron jobs not properly configured' },
        { status: 500 }
      );
    }

    // Check authorization
    const providedSecret = authHeader?.replace('Bearer ', '') || urlSecret;

    if (providedSecret !== cronSecret) {
      console.warn('Unauthorized cron job attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Call the worker processor
    const workerUrl = new URL(
      '/api/workers/process-jobs',
      request.url
    );

    const response = await fetch(workerUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Worker processing failed');
    }

    const result = await response.json();

    // Log cron execution
    console.log('Cron job executed successfully:', {
      timestamp: new Date().toISOString(),
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      skipped: result.skipped,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for manual triggers with same security
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
