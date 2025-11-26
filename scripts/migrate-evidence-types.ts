/**
 * Migration script to fix evidence types
 *
 * Problem: GitHub evidence was being saved with type "GITHUB_PR" which is not
 * a valid EvidenceType enum value. The valid values are:
 * - PR_AUTHORED (for PRs the user authored)
 * - PR_REVIEWED (for PRs the user reviewed)
 * - JIRA_OWNED
 * - JIRA_REVIEWED
 * - MANUAL
 * - SLACK
 *
 * This script updates any evidence with invalid type "GITHUB_PR" to "PR_AUTHORED"
 * since most GitHub PRs in the system are authored PRs.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateEvidenceTypes() {
  console.log('Starting evidence type migration...\n');

  // First, let's see what we're dealing with
  const allEvidence = await prisma.evidence.findMany({
    select: {
      id: true,
      type: true,
      summary: true,
      githubPrId: true,
    },
  });

  // Group by type to see distribution
  const typeDistribution: Record<string, number> = {};
  allEvidence.forEach(e => {
    typeDistribution[e.type] = (typeDistribution[e.type] || 0) + 1;
  });

  console.log('Current type distribution:');
  Object.entries(typeDistribution).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log('');

  // Find evidence with invalid GITHUB_PR type that has a linked GitHub PR
  const invalidGitHubEvidence = allEvidence.filter(
    e => e.type === 'GITHUB_PR' && e.githubPrId
  );

  if (invalidGitHubEvidence.length === 0) {
    console.log('No evidence with invalid "GITHUB_PR" type found.');

    // Check if there's evidence with MANUAL type that has a GitHub PR linked
    const manualWithGitHub = allEvidence.filter(
      e => e.type === 'MANUAL' && e.githubPrId
    );

    if (manualWithGitHub.length > 0) {
      console.log(`\nFound ${manualWithGitHub.length} MANUAL evidence entries with linked GitHub PRs.`);
      console.log('These should be converted to PR_AUTHORED.\n');

      // Update these records
      const result = await prisma.evidence.updateMany({
        where: {
          type: 'MANUAL',
          githubPrId: { not: null },
        },
        data: {
          type: 'PR_AUTHORED',
        },
      });

      console.log(`✅ Updated ${result.count} evidence records from MANUAL to PR_AUTHORED`);
    }
  } else {
    console.log(`Found ${invalidGitHubEvidence.length} evidence entries with invalid "GITHUB_PR" type.`);
    console.log('Converting to PR_AUTHORED...\n');

    // Update all GITHUB_PR type to PR_AUTHORED
    const result = await prisma.evidence.updateMany({
      where: {
        type: 'GITHUB_PR' as any, // Cast needed since it's not a valid enum
      },
      data: {
        type: 'PR_AUTHORED',
      },
    });

    console.log(`✅ Updated ${result.count} evidence records from GITHUB_PR to PR_AUTHORED`);
  }

  // Show final distribution
  const finalEvidence = await prisma.evidence.findMany({
    select: {
      type: true,
    },
  });

  const finalDistribution: Record<string, number> = {};
  finalEvidence.forEach(e => {
    finalDistribution[e.type] = (finalDistribution[e.type] || 0) + 1;
  });

  console.log('\nFinal type distribution:');
  Object.entries(finalDistribution).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('\n✅ Migration complete!');
}

migrateEvidenceTypes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
