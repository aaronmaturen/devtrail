/**
 * Helper to trigger immediate job processing in development
 * or queue jobs for cron processing in production
 */

import { processJob } from './job-registry';

export interface ProcessTriggerOptions {
  /**
   * Force immediate processing even in production
   * Use with caution - may hit serverless timeout limits
   */
  forceImmediate?: boolean;
}

/**
 * Trigger job processing either immediately (local dev) or queued (production)
 *
 * @param jobId - The job ID to process
 * @param jobType - The type of job (must be registered in job-registry.ts)
 * @param options - Processing options
 */
export async function triggerJobProcessing(
  jobId: string,
  jobType: string,
  options: ProcessTriggerOptions = {}
): Promise<void> {
  // Determine if we should process immediately
  const isDevelopment = process.env.NODE_ENV === 'development';
  const processImmediately =
    options.forceImmediate ||
    isDevelopment ||
    process.env.PROCESS_JOBS_IMMEDIATELY === 'true';

  if (processImmediately) {
    console.log(`⚡ [Local Dev] Processing job ${jobId} (${jobType}) immediately`);

    // Process in background using setImmediate to not block API response
    setImmediate(async () => {
      try {
        await processJob(jobId, jobType);
      } catch (error) {
        console.error(`❌ Error processing job ${jobId}:`, error);
      }
    });
  } else {
    console.log(`📋 [Production] Job ${jobId} (${jobType}) queued for cron processing`);
  }
}

/**
 * Check if immediate processing is enabled
 */
export function isImmediateProcessingEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.PROCESS_JOBS_IMMEDIATELY === 'true'
  );
}
