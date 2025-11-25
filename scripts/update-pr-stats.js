#!/usr/bin/env node

/**
 * Migration script to update existing PR evidence entries with code change statistics
 * This fetches the full PR details from GitHub and updates additions, deletions, and changed_files
 */

const { PrismaClient } = require('@prisma/client');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function loadConfig() {
  // Try current directory first
  let configPath = path.join(process.cwd(), 'config.json');

  // If not found, try parent directory (for devtrail-nextjs subdirectory)
  if (!fs.existsSync(configPath)) {
    configPath = path.join(process.cwd(), '..', 'config.json');
  }

  if (!fs.existsSync(configPath)) {
    throw new Error('Config file not found. Please create config.json with your GitHub token.');
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function updatePRStats() {
  console.log('🔄 Starting PR statistics migration...\n');

  const config = await loadConfig();
  const octokit = new Octokit({ auth: config.github_token });

  // Fetch all PR evidence entries
  const prs = await prisma.evidenceEntry.findMany({
    where: {
      type: 'PR',
      prNumber: { not: null },
      repository: { not: null },
    },
    select: {
      id: true,
      prNumber: true,
      repository: true,
      title: true,
      additions: true,
      deletions: true,
      changedFiles: true,
    },
  });

  console.log(`📊 Found ${prs.length} PR evidence entries to update\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const [owner, repo] = pr.repository.split('/');

    // Skip if already has stats
    if ((pr.additions || 0) > 0 || (pr.deletions || 0) > 0) {
      skipped++;
      process.stdout.write(`\r⏭️  Progress: ${i + 1}/${prs.length} (${updated} updated, ${skipped} skipped, ${failed} failed)`);
      continue;
    }

    try {
      // Fetch full PR details from GitHub
      const response = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pr.prNumber,
      });

      const stats = {
        additions: response.data.additions || 0,
        deletions: response.data.deletions || 0,
        changedFiles: response.data.changed_files || 0,
      };

      // Update the database
      await prisma.evidenceEntry.update({
        where: { id: pr.id },
        data: stats,
      });

      updated++;
      process.stdout.write(`\r✅ Progress: ${i + 1}/${prs.length} (${updated} updated, ${skipped} skipped, ${failed} failed)`);

      // Rate limiting: GitHub allows 5000 requests/hour
      // Sleep for 100ms between requests to be safe
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      failed++;
      console.error(`\n❌ Failed to update ${pr.repository}#${pr.prNumber}: ${error.message}`);
      process.stdout.write(`\r⚠️  Progress: ${i + 1}/${prs.length} (${updated} updated, ${skipped} skipped, ${failed} failed)`);
    }
  }

  console.log('\n\n✨ Migration complete!');
  console.log(`   Updated: ${updated} PRs`);
  console.log(`   Skipped: ${skipped} PRs (already had stats)`);
  console.log(`   Failed:  ${failed} PRs\n`);

  // Show summary of changes
  const summary = await prisma.evidenceEntry.aggregate({
    where: {
      type: 'PR',
    },
    _sum: {
      additions: true,
      deletions: true,
      changedFiles: true,
    },
    _count: {
      id: true,
    },
  });

  console.log('📈 Database Summary:');
  console.log(`   Total PRs: ${summary._count.id}`);
  console.log(`   Total additions: ${summary._sum.additions?.toLocaleString() || 0}`);
  console.log(`   Total deletions: ${summary._sum.deletions?.toLocaleString() || 0}`);
  console.log(`   Total files changed: ${summary._sum.changedFiles?.toLocaleString() || 0}`);
  console.log(`   Total code changes: ${((summary._sum.additions || 0) + (summary._sum.deletions || 0)).toLocaleString()}\n`);
}

updatePRStats()
  .catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
