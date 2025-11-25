import { prisma } from '../db/prisma';
import { processGitHubSyncJob } from './github-sync';
import { processJiraSyncJob } from './jira-sync';
import { processReportGenerationJob } from './report-generation';
import { processGoogleDriveSyncJob } from './google-drive-sync';
import { processGoalProgressJob } from './goals-progress';
import { processReviewAnalysisJob } from './review-analysis';
import { processGoalGenerationJob } from './goals-generation';

/**
 * Job processor that routes jobs to appropriate handlers based on type
 */

export interface ProcessJobsResult {
  processed: number;
  failed: number;
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    error?: string;
  }>;
}

/**
 * Process all pending jobs in the queue
 */
export async function processPendingJobs(): Promise<ProcessJobsResult> {
  const result: ProcessJobsResult = {
    processed: 0,
    failed: 0,
    jobs: [],
  };

  try {
    // Fetch all pending jobs, ordered by creation date
    const pendingJobs = await prisma.job.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(`Found ${pendingJobs.length} pending jobs to process`);

    // Process each job
    for (const job of pendingJobs) {
      console.log(`Processing job ${job.id} (type: ${job.type})`);

      try {
        // Route to appropriate handler based on job type
        switch (job.type) {
          case 'GITHUB_SYNC':
            await processGitHubSyncJob(job.id);
            result.processed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'COMPLETED',
            });
            break;

          case 'JIRA_SYNC':
            await processJiraSyncJob(job.id);
            result.processed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'COMPLETED',
            });
            break;

          case 'REPORT_GENERATION':
            await processReportGenerationJob(job.id);
            result.processed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'COMPLETED',
            });
            break;

          case 'GOOGLE_DRIVE_SYNC':
            await processGoogleDriveSyncJob(job.id);
            result.processed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'COMPLETED',
            });
            break;

          case 'GOAL_PROGRESS':
            await processGoalProgressJob(job.id);
            result.processed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'COMPLETED',
            });
            break;

          case 'REVIEW_ANALYSIS':
            await processReviewAnalysisJob(job.id);
            result.processed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'COMPLETED',
            });
            break;

          case 'GOAL_GENERATION':
            await processGoalGenerationJob(job.id);
            result.processed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'COMPLETED',
            });
            break;

          case 'AI_ANALYSIS':
            // TODO: Implement AI analysis worker
            console.warn(`AI analysis worker not yet implemented`);
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'PENDING',
              error: 'Worker not yet implemented',
            });
            break;

          default:
            console.error(`Unknown job type: ${job.type}`);
            await prisma.job.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                error: `Unknown job type: ${job.type}`,
                completedAt: new Date(),
              },
            });
            result.failed++;
            result.jobs.push({
              id: job.id,
              type: job.type,
              status: 'FAILED',
              error: `Unknown job type: ${job.type}`,
            });
        }
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);

        // Update job status to failed
        try {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : String(error),
              completedAt: new Date(),
            },
          });
        } catch (updateError) {
          console.error(`Failed to update job ${job.id} status:`, updateError);
        }

        result.failed++;
        result.jobs.push({
          id: job.id,
          type: job.type,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(
      `Job processing complete: ${result.processed} succeeded, ${result.failed} failed`
    );
  } catch (error) {
    console.error('Error fetching pending jobs:', error);
    throw error;
  }

  return result;
}

/**
 * Process a single job by ID
 */
export async function processJobById(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== 'PENDING') {
    throw new Error(`Job ${jobId} is not in PENDING state (current: ${job.status})`);
  }

  console.log(`Processing job ${job.id} (type: ${job.type})`);

  // Route to appropriate handler
  switch (job.type) {
    case 'GITHUB_SYNC':
      await processGitHubSyncJob(job.id);
      break;

    case 'JIRA_SYNC':
      await processJiraSyncJob(job.id);
      break;

    case 'REPORT_GENERATION':
      await processReportGenerationJob(job.id);
      break;

    case 'GOOGLE_DRIVE_SYNC':
      await processGoogleDriveSyncJob(job.id);
      break;

    case 'GOAL_PROGRESS':
      await processGoalProgressJob(job.id);
      break;

    case 'REVIEW_ANALYSIS':
      await processReviewAnalysisJob(job.id);
      break;

    case 'GOAL_GENERATION':
      await processGoalGenerationJob(job.id);
      break;

    case 'AI_ANALYSIS':
      throw new Error('AI analysis worker not yet implemented');

    default:
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: `Unknown job type: ${job.type}`,
          completedAt: new Date(),
        },
      });
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/**
 * Cancel a running or pending job
 */
export async function cancelJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    throw new Error(`Cannot cancel job in ${job.status} state`);
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
      error: 'Job cancelled by user',
    },
  });

  console.log(`Job ${jobId} cancelled`);
}

/**
 * Get job status and details
 */
export async function getJobStatus(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    logs: job.logs ? JSON.parse(job.logs) : [],
    result: job.result ? JSON.parse(job.result) : null,
    error: job.error,
    config: job.config ? JSON.parse(job.config) : null,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Clean up old completed jobs (optional utility function)
 */
export async function cleanupOldJobs(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await prisma.job.deleteMany({
    where: {
      status: {
        in: ['COMPLETED', 'FAILED', 'CANCELLED'],
      },
      completedAt: {
        lt: cutoffDate,
      },
    },
  });

  console.log(`Cleaned up ${result.count} old jobs`);
  return result.count;
}
