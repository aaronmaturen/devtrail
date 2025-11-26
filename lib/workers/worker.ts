#!/usr/bin/env node

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
import { processJob, isJobTypeRegistered, isLegacyJobType, getJobTypeDescription } from './job-registry';

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
let isShuttingDown = false;
let currentJobId: string | null = null;

async function main() {
  console.log('🚀 DevTrail Worker started');
  console.log(`📊 Polling for jobs every ${POLL_INTERVAL_MS}ms`);

  // Handle graceful shutdown
  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  // Main worker loop
  while (!isShuttingDown) {
    try {
      await processNextJob();
    } catch (error) {
      console.error('❌ Error in worker loop:', error);
    }

    // Wait before next poll
    await sleep(POLL_INTERVAL_MS);
  }

  console.log('👋 Worker shut down gracefully');
  process.exit(0);
}

async function updateHeartbeat() {
  try {
    await prisma.config.upsert({
      where: { key: 'worker_heartbeat' },
      update: {
        value: new Date().toISOString(),
        description: 'Last worker heartbeat timestamp',
      },
      create: {
        key: 'worker_heartbeat',
        value: new Date().toISOString(),
        encrypted: false,
        description: 'Last worker heartbeat timestamp',
      },
    });
  } catch (error) {
    console.error('Failed to update heartbeat:', error);
  }
}

async function processNextJob() {
  // Update heartbeat
  await updateHeartbeat();

  // Find the next PENDING job (ordered by creation time)
  const job = await prisma.job.findFirst({
    where: {
      status: 'PENDING',
    },
    orderBy: {
      createdAt: 'asc', // Process oldest jobs first
    },
  });

  if (!job) {
    // No jobs to process
    return;
  }

  console.log(`\n📦 Found job: ${job.id} (type: ${job.type})`);
  currentJobId = job.id;

  try {
    // Parse job config for logging
    const jobConfig = job.config ? JSON.parse(job.config) : {};

    // Log configuration details
    if (job.type === 'AGENT_GITHUB_SYNC' && jobConfig.repositories) {
      console.log(`   📌 Repositories: ${jobConfig.repositories.join(', ')}`);
    } else if (job.type === 'AGENT_JIRA_SYNC' && jobConfig.jiraHost && jobConfig.projects) {
      console.log(`   📌 Jira Host: ${jobConfig.jiraHost}`);
      console.log(`   📌 Projects: ${jobConfig.projects.join(', ')}`);
    }

    // Check for legacy job types
    if (isLegacyJobType(job.type)) {
      const error = `Job type '${job.type}' is deprecated. Please use AGENT_GITHUB_SYNC or AGENT_JIRA_SYNC instead.`;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error,
          completedAt: new Date(),
        },
      });
      throw new Error(error);
    }

    // Check if job type is registered
    if (!isJobTypeRegistered(job.type)) {
      const error = `Unknown job type: ${job.type}`;
      console.warn(`⚠️  ${error}`);
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error,
          completedAt: new Date(),
        },
      });
      throw new Error(error);
    }

    // Process the job using the registry
    console.log(`   🔄 ${getJobTypeDescription(job.type)}...`);
    await processJob(job.id, job.type);

    console.log(`✅ Job completed: ${job.id}`);
  } catch (error: any) {
    console.error(`❌ Job failed: ${job.id}`, error);

    // Update job status to FAILED
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: error.message || 'Unknown error',
        completedAt: new Date(),
      },
    });
  } finally {
    currentJobId = null;
  }
}

async function handleShutdown() {
  console.log('\n⚠️  Shutdown signal received');

  if (currentJobId) {
    console.log(`⏳ Waiting for current job to complete: ${currentJobId}`);
    // The job will complete naturally, we just wait
  }

  isShuttingDown = true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run worker
main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
