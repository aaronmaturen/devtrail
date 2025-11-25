/**
 * Helper to trigger immediate job processing in development
 * or queue jobs for cron processing in production
 */

import { processGitHubSyncJob } from './github-sync';
import { processJiraSyncJob } from './jira-sync';
import { processReportGenerationJob } from './report-generation';
import { processGoogleDriveSyncJob } from './google-drive-sync';
import { processReviewAnalysisJob } from './review-analysis';
import { processGoalProgressJob } from './goals-progress';
import { processGoalGenerationJob } from './goals-generation';

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
 * @param jobType - The type of job (GITHUB_SYNC, REPORT_GENERATION, etc.)
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
        await routeJobToWorker(jobId, jobType);
      } catch (error) {
        console.error(`❌ Error processing job ${jobId}:`, error);
      }
    });
  } else {
    console.log(`📋 [Production] Job ${jobId} (${jobType}) queued for cron processing`);
  }
}

/**
 * Route a job to the appropriate worker function
 */
async function routeJobToWorker(jobId: string, jobType: string): Promise<void> {
  switch (jobType) {
    case 'GITHUB_SYNC':
      await processGitHubSyncJob(jobId);
      break;

    case 'JIRA_SYNC':
      await processJiraSyncJob(jobId);
      break;

    case 'REPORT_GENERATION':
      await processReportGenerationJob(jobId);
      break;

    case 'GOOGLE_DRIVE_SYNC':
      await processGoogleDriveSyncJob(jobId);
      break;

    case 'GOAL_PROGRESS':
      await processGoalProgressJob(jobId);
      break;

    case 'REVIEW_ANALYSIS':
      await processReviewAnalysisJob(jobId);
      break;

    case 'GOAL_GENERATION':
      await processGoalGenerationJob(jobId);
      break;

    case 'AI_ANALYSIS':
      throw new Error('AI analysis worker not yet implemented');

    default:
      throw new Error(`Unknown job type: ${jobType}`);
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
