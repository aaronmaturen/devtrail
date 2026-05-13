/**
 * Migration script: Assign existing data to the first user
 *
 * This script should be run AFTER:
 * 1. The database migration has been applied (adding userId columns)
 * 2. At least one user has signed in with GitHub
 *
 * Usage:
 *   npx tsx scripts/migrate-to-multiuser.ts
 *
 * What it does:
 * 1. Finds the first user in the database
 * 2. Updates all existing records to belong to that user
 * 3. Reports the migration results
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting multi-user migration...\n');

  // Find the first user
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!user) {
    console.log('ERROR: No users found in the database.');
    console.log('Please sign in with GitHub first, then run this script again.');
    process.exit(1);
  }

  console.log(`Found user: ${user.email || user.name || user.id}`);
  console.log(`GitHub username: ${user.githubUsername || 'not set'}`);
  console.log(`User ID: ${user.id}\n`);

  // Track migration stats
  const stats: Record<string, number> = {};

  // Migrate GitHubPR records
  const githubPRs = await prisma.gitHubPR.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.githubPRs = githubPRs.count;
  console.log(`Migrated ${githubPRs.count} GitHub PRs`);

  // Migrate GitHubIssue records
  const githubIssues = await prisma.gitHubIssue.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.githubIssues = githubIssues.count;
  console.log(`Migrated ${githubIssues.count} GitHub Issues`);

  // Migrate JiraTicket records
  const jiraTickets = await prisma.jiraTicket.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.jiraTickets = jiraTickets.count;
  console.log(`Migrated ${jiraTickets.count} Jira Tickets`);

  // Migrate SlackMessage records
  const slackMessages = await prisma.slackMessage.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.slackMessages = slackMessages.count;
  console.log(`Migrated ${slackMessages.count} Slack Messages`);

  // Migrate Evidence records
  const evidence = await prisma.evidence.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.evidence = evidence.count;
  console.log(`Migrated ${evidence.count} Evidence records`);

  // Migrate Report records
  const reports = await prisma.report.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.reports = reports.count;
  console.log(`Migrated ${reports.count} Reports`);

  // Migrate ReportDocument records
  const reportDocuments = await prisma.reportDocument.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.reportDocuments = reportDocuments.count;
  console.log(`Migrated ${reportDocuments.count} Report Documents`);

  // Migrate Goal records
  const goals = await prisma.goal.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.goals = goals.count;
  console.log(`Migrated ${goals.count} Goals`);

  // Migrate ReviewDocument records
  const reviewDocuments = await prisma.reviewDocument.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.reviewDocuments = reviewDocuments.count;
  console.log(`Migrated ${reviewDocuments.count} Review Documents`);

  // Migrate ReviewAnalysis records
  const reviewAnalyses = await prisma.reviewAnalysis.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.reviewAnalyses = reviewAnalyses.count;
  console.log(`Migrated ${reviewAnalyses.count} Review Analyses`);

  // Migrate MonthlyInsight records
  const monthlyInsights = await prisma.monthlyInsight.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.monthlyInsights = monthlyInsights.count;
  console.log(`Migrated ${monthlyInsights.count} Monthly Insights`);

  // Migrate Job records
  const jobs = await prisma.job.updateMany({
    where: { userId: { equals: undefined as any } },
    data: { userId: user.id },
  });
  stats.jobs = jobs.count;
  console.log(`Migrated ${jobs.count} Jobs`);

  // Summary
  const totalRecords = Object.values(stats).reduce((a, b) => a + b, 0);
  console.log('\n========================================');
  console.log('Migration complete!');
  console.log(`Total records migrated: ${totalRecords}`);
  console.log(`All data now belongs to user: ${user.email || user.id}`);
  console.log('========================================\n');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
