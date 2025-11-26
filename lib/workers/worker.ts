#!/usr/bin/env node

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
import { processHybridGitHubSync, processHybridJiraSync } from './hybrid-sync';

const prisma = new PrismaClient();

// Legacy job types - these are deprecated
const LEGACY_JOB_ERROR = 'This job type is deprecated. Please use AGENT_GITHUB_SYNC or AGENT_JIRA_SYNC instead.';

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
    // Parse job config
    const config = job.config ? JSON.parse(job.config) : {};

    // Log configuration details
    if (job.type === 'GITHUB_SYNC' && config.repositories) {
      console.log(`   📌 Repositories: ${config.repositories.join(', ')}`);
    } else if (job.type === 'JIRA_SYNC' && config.jiraHost && config.projects) {
      console.log(`   📌 Jira Host: ${config.jiraHost}`);
      console.log(`   📌 Projects: ${config.projects.join(', ')}`);
    }

    // Dispatch to appropriate handler based on job type
    switch (job.type) {
      case 'GITHUB_SYNC':
      case 'JIRA_SYNC':
        // Legacy job types - mark as failed
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: LEGACY_JOB_ERROR,
            completedAt: new Date(),
          },
        });
        throw new Error(LEGACY_JOB_ERROR);

      case 'AGENT_GITHUB_SYNC':
        console.log('   🔄 Running Hybrid GitHub sync (direct fetch + AI analysis)...');
        await processHybridGitHubSync(job.id);
        break;

      case 'AGENT_JIRA_SYNC':
        console.log('   🔄 Running Hybrid Jira sync (direct fetch + AI analysis)...');
        await processHybridJiraSync(job.id);
        break;

      default:
        console.warn(`⚠️  Unknown job type: ${job.type}`);
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: `Unknown job type: ${job.type}`,
            completedAt: new Date(),
          },
        });
    }

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
