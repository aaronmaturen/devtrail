/**
 * Migration script: Migrate EvidenceEntry data to normalized schema
 *
 * This script migrates data from the legacy EvidenceEntry table to the new
 * normalized schema with separate GitHubPR, Evidence, etc. tables.
 *
 * Key strategy: Preserve the original EvidenceEntry IDs when creating Evidence
 * records so that existing EvidenceCriterion links remain valid.
 *
 * Run with: npx ts-node scripts/migrate-evidence-to-normalized.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface EvidenceEntryRaw {
  id: string;
  type: string;
  title: string;
  description: string | null;
  content: string;
  confidence: number | null;
  timestamp: Date;
  pr_number: number | null;
  pr_url: string | null;
  repository: string | null;
  merged_at: Date | null;
  slack_link: string | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  components: string | null;
  metadata: string | null;
}

function extractJiraKey(text: string): string | null {
  const match = text.match(/\[?([A-Z]+-\d+)\]?/);
  return match ? match[1] : null;
}

function categorizeFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('fix') || lowerTitle.includes('bug')) return 'bug';
  if (lowerTitle.includes('refactor')) return 'refactor';
  if (lowerTitle.includes('doc') || lowerTitle.includes('readme')) return 'docs';
  if (lowerTitle.includes('test')) return 'devex';
  if (lowerTitle.includes('chore') || lowerTitle.includes('bump') || lowerTitle.includes('update dep')) return 'devex';
  return 'feature';
}

function estimateScopeFromStats(additions: number | null, deletions: number | null, changedFiles: number | null): string {
  const totalLines = (additions || 0) + (deletions || 0);
  const files = changedFiles || 0;

  if (totalLines > 500 || files > 20) return 'large';
  if (totalLines > 100 || files > 5) return 'medium';
  return 'small';
}

async function migrateEvidenceEntries() {
  console.log('Starting migration of EvidenceEntry data to normalized schema...\n');

  // Fetch all evidence entries using raw query
  const entries = await prisma.$queryRaw<EvidenceEntryRaw[]>`
    SELECT
      id, type, title, description, content, confidence, timestamp,
      pr_number, pr_url, repository, merged_at, slack_link,
      additions, deletions, changed_files, components, metadata
    FROM evidence_entries
  `;

  console.log(`Found ${entries.length} evidence entries to migrate\n`);

  const stats = {
    total: entries.length,
    pr: { migrated: 0, skipped: 0 },
    jira: { migrated: 0, skipped: 0 },
    slack: { migrated: 0, skipped: 0 },
    manual: { migrated: 0, skipped: 0 },
    errors: [] as string[],
  };

  for (const entry of entries) {
    try {
      // Check if already migrated (Evidence with same ID exists)
      const existing = await prisma.evidence.findUnique({
        where: { id: entry.id },
      });

      if (existing) {
        console.log(`  Skipping ${entry.id} - already migrated`);
        if (entry.type === 'PR') stats.pr.skipped++;
        else if (entry.type === 'JIRA') stats.jira.skipped++;
        else if (entry.type === 'SLACK') stats.slack.skipped++;
        else stats.manual.skipped++;
        continue;
      }

      if (entry.type === 'PR') {
        await migratePREntry(entry);
        stats.pr.migrated++;
      } else if (entry.type === 'JIRA') {
        await migrateJiraEntry(entry);
        stats.jira.migrated++;
      } else if (entry.type === 'SLACK') {
        await migrateSlackEntry(entry);
        stats.slack.migrated++;
      } else {
        await migrateManualEntry(entry);
        stats.manual.migrated++;
      }

      console.log(`  Migrated ${entry.type}: ${entry.title.substring(0, 60)}...`);
    } catch (error) {
      const errorMsg = `Failed to migrate ${entry.id} (${entry.type}): ${error}`;
      console.error(`  ERROR: ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }

  console.log('\n--- Migration Summary ---');
  console.log(`Total entries: ${stats.total}`);
  console.log(`PR: ${stats.pr.migrated} migrated, ${stats.pr.skipped} skipped`);
  console.log(`JIRA: ${stats.jira.migrated} migrated, ${stats.jira.skipped} skipped`);
  console.log(`SLACK: ${stats.slack.migrated} migrated, ${stats.slack.skipped} skipped`);
  console.log(`MANUAL: ${stats.manual.migrated} migrated, ${stats.manual.skipped} skipped`);
  console.log(`Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.forEach((err) => console.log(`  - ${err}`));
  }
}

async function migratePREntry(entry: EvidenceEntryRaw) {
  const jiraKey = extractJiraKey(entry.title);
  const category = categorizeFromTitle(entry.title);
  const scope = estimateScopeFromStats(entry.additions, entry.deletions, entry.changed_files);

  // Parse components
  let components: string[] = [];
  let files: string[] = [];
  try {
    if (entry.components) {
      const parsed = JSON.parse(entry.components);
      if (Array.isArray(parsed)) {
        components = parsed.map((c: any) => c.name || c);
      }
    }
    // Try to get files from content
    if (entry.content) {
      const content = JSON.parse(entry.content);
      if (content.files && Array.isArray(content.files)) {
        files = content.files;
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Create GitHubPR
  const githubPr = await prisma.gitHubPR.create({
    data: {
      number: entry.pr_number || 0,
      repo: entry.repository || 'unknown/unknown',
      title: entry.title,
      body: entry.description,
      url: entry.pr_url || '',
      additions: entry.additions || 0,
      deletions: entry.deletions || 0,
      changedFiles: entry.changed_files || 0,
      createdAt: entry.timestamp,
      mergedAt: entry.merged_at,
      components: JSON.stringify(components),
      files: JSON.stringify(files),
      userRole: 'AUTHOR', // Assume author for existing data
    },
  });

  // Generate a short summary from title and description
  const summary = generateSummary(entry.title, entry.description || '');

  // Create Evidence with SAME ID as EvidenceEntry so criteria links work
  await prisma.evidence.create({
    data: {
      id: entry.id, // Preserve ID for EvidenceCriterion links!
      type: 'PR_AUTHORED',
      summary,
      category,
      scope,
      githubPrId: githubPr.id,
      occurredAt: entry.merged_at || entry.timestamp,
    },
  });

  // If there's a Jira key, create a link placeholder (Jira data can be fetched later)
  if (jiraKey) {
    // Note: We don't create the JiraTicket here because we don't have the data
    // The resync process will fetch and create JiraTicket entries later
    // For now, just note the key in the GitHubPR's body or as metadata
  }
}

async function migrateJiraEntry(entry: EvidenceEntryRaw) {
  // Parse content for Jira-specific data
  let jiraData: any = {};
  try {
    jiraData = JSON.parse(entry.content);
  } catch {
    // Ignore
  }

  const jiraKey = jiraData.key || extractJiraKey(entry.title) || entry.title;

  // Create JiraTicket
  const jiraTicket = await prisma.jiraTicket.create({
    data: {
      key: jiraKey,
      summary: jiraData.summary || entry.title,
      description: jiraData.description || entry.description,
      issueType: jiraData.issuetype || 'Task',
      status: jiraData.status || 'Done',
      priority: jiraData.priority,
      createdAt: new Date(jiraData.created || entry.timestamp),
      resolvedAt: entry.merged_at,
      userRole: 'ASSIGNEE',
      commentCount: 0,
    },
  });

  const summary = generateSummary(jiraData.summary || entry.title, jiraData.description || '');
  const category = categorizeFromTitle(jiraData.summary || entry.title);

  // Create Evidence with same ID
  await prisma.evidence.create({
    data: {
      id: entry.id,
      type: 'JIRA_OWNED',
      summary,
      category,
      scope: 'medium', // Default for Jira without story points
      jiraTicketId: jiraTicket.id,
      occurredAt: entry.merged_at || entry.timestamp,
    },
  });
}

async function migrateSlackEntry(entry: EvidenceEntryRaw) {
  // Parse content for Slack-specific data
  let slackData: any = {};
  try {
    slackData = JSON.parse(entry.content);
  } catch {
    // Ignore
  }

  // Create SlackMessage
  const slackMessage = await prisma.slackMessage.create({
    data: {
      channel: slackData.channel || 'unknown',
      author: slackData.author || 'unknown',
      content: slackData.content || entry.description || entry.title,
      timestamp: entry.timestamp,
      permalink: entry.slack_link,
      replyCount: slackData.replyCount || 0,
    },
  });

  const summary = generateSummary(entry.title, entry.description || '');

  // Create Evidence with same ID
  await prisma.evidence.create({
    data: {
      id: entry.id,
      type: 'SLACK',
      summary,
      category: 'recognition', // Default for Slack
      scope: 'small',
      slackMessageId: slackMessage.id,
      occurredAt: entry.timestamp,
    },
  });
}

async function migrateManualEntry(entry: EvidenceEntryRaw) {
  const summary = generateSummary(entry.title, entry.description || '');
  const category = categorizeFromTitle(entry.title);

  // Create Evidence with same ID
  await prisma.evidence.create({
    data: {
      id: entry.id,
      type: 'MANUAL',
      summary,
      category,
      scope: 'medium',
      manualTitle: entry.title,
      manualContent: entry.description || entry.content,
      occurredAt: entry.timestamp,
    },
  });
}

function generateSummary(title: string, description: string): string {
  // Clean up Jira key prefix from title
  const cleanTitle = title.replace(/^\[?[A-Z]+-\d+\]?:?\s*/i, '').trim();

  // If description is short enough, use it
  if (description && description.length > 20 && description.length < 200) {
    return description.trim();
  }

  // Otherwise use the cleaned title
  if (cleanTitle.length > 0) {
    return cleanTitle;
  }

  return title;
}

// Run the migration
migrateEvidenceEntries()
  .then(() => {
    console.log('\nMigration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
