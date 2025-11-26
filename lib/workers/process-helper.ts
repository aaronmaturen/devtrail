/**
 * Helper to trigger immediate job processing in development
 * or queue jobs for cron processing in production
 */

import { processGoogleDriveSyncJob } from './google-drive-sync';
import { processReviewAnalysisJob } from './review-analysis';
import { processAgentGitHubSync, processAgentJiraSync } from './agent-sync';

// Legacy job types - these are deprecated
const LEGACY_JOB_ERROR = 'This job type is deprecated. Please use AGENT_GITHUB_SYNC or AGENT_JIRA_SYNC instead.';

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
 * @param jobType - The type of job (AGENT_GITHUB_SYNC, AGENT_JIRA_SYNC, etc.)
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
    case 'JIRA_SYNC':
    case 'REPORT_GENERATION':
    case 'GOAL_PROGRESS':
    case 'GOAL_GENERATION':
      throw new Error(LEGACY_JOB_ERROR);

    case 'GOOGLE_DRIVE_SYNC':
      await processGoogleDriveSyncJob(jobId);
      break;

    case 'REVIEW_ANALYSIS':
      await processReviewAnalysisJob(jobId);
      break;

    case 'AI_ANALYSIS':
      throw new Error('AI analysis worker not yet implemented');

    case 'AGENT_GITHUB_SYNC':
      await processAgentGitHubSync(jobId);
      break;

    case 'AGENT_JIRA_SYNC':
      await processAgentJiraSync(jobId);
      break;

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
