#!/usr/bin/env tsx
/**
 * Import existing DevTrail data into the Next.js database
 *
 * This script imports:
 * 1. processed-prs.json → EvidenceEntry (type: PR)
 * 2. slack-evidence.json → EvidenceEntry (type: SLACK)
 * 3. lattice/*.md → ReviewDocument
 * 4. config.json → Config table
 * 5. criteria.csv → Criterion table
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { loadParentConfig, calculateReviewWeight } from '../lib/utils/config';

const prisma = new PrismaClient();

// Paths to parent directory data
const PARENT_DIR = path.join(__dirname, '../..');
const PROCESSED_PRS_PATH = path.join(PARENT_DIR, 'data', 'processed-prs.json');
const SLACK_EVIDENCE_PATH = path.join(PARENT_DIR, 'data', 'slack-evidence.json');
const LATTICE_DIR = path.join(PARENT_DIR, 'lattice');
const CRITERIA_PATH = path.join(PARENT_DIR, 'criteria.csv');

interface ProcessedPR {
  pr_number: number;
  pr_title: string;
  pr_url: string;
  pr_body?: string;
  merged_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  components?: string[];
  skipped?: boolean;
  skip_reason?: string;
  evidence?: Array<{
    criterion_id: string;
    confidence: number;
    evidence: string;
  }>;
}

interface SlackEvidence {
  id: string;
  title: string;
  description: string;
  message_text: string;
  slack_link: string;
  screenshot_path?: string;
  timestamp: string;
  criterion_id: string;
  confidence: number;
}

interface Criterion {
  criterion_id: string;
  area_of_concentration: string;
  subarea: string;
  description: string;
  pr_detectable: string;
}

async function importCriteria() {
  console.log('\n📋 Importing criteria...');

  if (!fs.existsSync(CRITERIA_PATH)) {
    console.log('⚠️  Criteria file not found, skipping...');
    return;
  }

  const csvContent = fs.readFileSync(CRITERIA_PATH, 'utf8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Criterion[];

  let imported = 0;
  for (const record of records) {
    await prisma.criterion.upsert({
      where: { id: parseInt(record.criterion_id) },
      update: {
        areaOfConcentration: record.area_of_concentration,
        subarea: record.subarea,
        description: record.description,
        prDetectable: record.pr_detectable.toLowerCase() === 'true',
      },
      create: {
        id: parseInt(record.criterion_id),
        areaOfConcentration: record.area_of_concentration,
        subarea: record.subarea,
        description: record.description,
        prDetectable: record.pr_detectable.toLowerCase() === 'true',
      },
    });
    imported++;
  }

  console.log(`✅ Imported ${imported} criteria`);
}

async function importProcessedPRs() {
  console.log('\n🔄 Importing processed PRs...');

  if (!fs.existsSync(PROCESSED_PRS_PATH)) {
    console.log('⚠️  Processed PRs file not found, skipping...');
    return;
  }

  const processedData = JSON.parse(fs.readFileSync(PROCESSED_PRS_PATH, 'utf8'));
  let imported = 0;
  let skipped = 0;

  for (const [repo, prs] of Object.entries(processedData)) {
    console.log(`  Processing ${repo}...`);

    for (const pr of prs as ProcessedPR[]) {
      if (pr.skipped) {
        skipped++;
        continue;
      }

      // Check if already imported
      const existing = await prisma.evidenceEntry.findFirst({
        where: {
          prNumber: pr.pr_number,
          repository: repo,
        },
      });

      if (existing) {
        console.log(`    Skipping ${repo}#${pr.pr_number} (already exists)`);
        continue;
      }

      // Create evidence entry
      const evidence = await prisma.evidenceEntry.create({
        data: {
          type: 'PR',
          title: pr.pr_title,
          description: pr.pr_body || null,
          content: JSON.stringify({
            prNumber: pr.pr_number,
            prUrl: pr.pr_url,
            components: pr.components,
            body: pr.pr_body,
          }),
          prNumber: pr.pr_number,
          prUrl: pr.pr_url,
          repository: repo,
          mergedAt: new Date(pr.merged_at),
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          components: pr.components ? JSON.stringify(pr.components) : null,
          timestamp: new Date(pr.merged_at),
        },
      });

      // Create criteria relationships
      if (Array.isArray(pr.evidence)) {
        for (const item of pr.evidence) {
          const criterionId = parseInt(item.criterion_id);
          if (isNaN(criterionId)) continue;

          await prisma.evidenceCriterion.create({
            data: {
              evidenceId: evidence.id,
              criterionId,
              confidence: item.confidence,
              explanation: item.evidence,
            },
          });
        }
      }

      imported++;
    }
  }

  console.log(`✅ Imported ${imported} PRs, skipped ${skipped}`);
}

async function importSlackEvidence() {
  console.log('\n💬 Importing Slack evidence...');

  if (!fs.existsSync(SLACK_EVIDENCE_PATH)) {
    console.log('⚠️  Slack evidence file not found, skipping...');
    return;
  }

  const slackData = JSON.parse(fs.readFileSync(SLACK_EVIDENCE_PATH, 'utf8')) as SlackEvidence[];
  let imported = 0;

  for (const item of slackData) {
    // Check if already imported
    const existing = await prisma.evidenceEntry.findFirst({
      where: {
        slackLink: item.slack_link,
      },
    });

    if (existing) {
      console.log(`  Skipping Slack evidence "${item.title}" (already exists)`);
      continue;
    }

    // Create evidence entry
    const evidence = await prisma.evidenceEntry.create({
      data: {
        type: 'SLACK',
        title: item.title,
        description: item.description,
        content: JSON.stringify({
          messageText: item.message_text,
          screenshotPath: item.screenshot_path,
        }),
        slackLink: item.slack_link,
        timestamp: new Date(item.timestamp),
      },
    });

    // Create criterion relationship
    const criterionId = parseInt(item.criterion_id);
    if (!isNaN(criterionId) && criterionId > 0) {
      await prisma.evidenceCriterion.create({
        data: {
          evidenceId: evidence.id,
          criterionId,
          confidence: item.confidence,
          explanation: item.description,
        },
      });
    }

    imported++;
  }

  console.log(`✅ Imported ${imported} Slack evidence items`);
}

async function importReviewDocuments() {
  console.log('\n📄 Importing review documents...');

  if (!fs.existsSync(LATTICE_DIR)) {
    console.log('⚠️  Lattice directory not found, skipping...');
    return;
  }

  const years = fs.readdirSync(LATTICE_DIR)
    .filter(f => {
      const fullPath = path.join(LATTICE_DIR, f);
      return fs.statSync(fullPath).isDirectory() && f !== 'example';
    });

  let imported = 0;

  for (const year of years) {
    const yearDir = path.join(LATTICE_DIR, year);

    // Import employee review
    const employeeFile = path.join(yearDir, 'employee-review.md');
    if (fs.existsSync(employeeFile)) {
      const content = fs.readFileSync(employeeFile, 'utf8');
      await prisma.reviewDocument.upsert({
        where: {
          year_type: {
            year,
            type: 'EMPLOYEE',
          },
        },
        update: {
          content,
          weight: calculateReviewWeight(year),
        },
        create: {
          year,
          type: 'EMPLOYEE',
          content,
          weight: calculateReviewWeight(year),
        },
      });
      imported++;
    }

    // Import manager review
    const managerFile = path.join(yearDir, 'manager-review.md');
    if (fs.existsSync(managerFile)) {
      const content = fs.readFileSync(managerFile, 'utf8');
      await prisma.reviewDocument.upsert({
        where: {
          year_type: {
            year,
            type: 'MANAGER',
          },
        },
        update: {
          content,
          weight: calculateReviewWeight(year),
        },
        create: {
          year,
          type: 'MANAGER',
          content,
          weight: calculateReviewWeight(year),
        },
      });
      imported++;
    }
  }

  console.log(`✅ Imported ${imported} review documents`);
}

async function importConfig() {
  console.log('\n⚙️  Importing configuration...');

  const config = loadParentConfig();
  if (!config) {
    console.log('⚠️  Parent config.json not found, skipping...');
    return;
  }

  const configEntries = [
    { key: 'github_token', value: config.github_token, encrypted: true },
    { key: 'anthropic_api_key', value: config.anthropic_api_key, encrypted: true },
    { key: 'repos', value: JSON.stringify(config.repos), encrypted: false },
  ];

  if (config.jira_host) {
    configEntries.push(
      { key: 'jira_host', value: config.jira_host, encrypted: false },
      { key: 'jira_email', value: config.jira_email || '', encrypted: false },
      { key: 'jira_api_token', value: config.jira_api_token || '', encrypted: true },
      { key: 'jira_project_keys', value: JSON.stringify(config.jira_project_keys || []), encrypted: false }
    );
  }

  if (config.user_context) {
    configEntries.push({ key: 'user_context', value: config.user_context, encrypted: false });
  }

  let imported = 0;
  for (const entry of configEntries) {
    await prisma.config.upsert({
      where: { key: entry.key },
      update: {
        value: entry.value,
        encrypted: entry.encrypted,
      },
      create: {
        key: entry.key,
        value: entry.value,
        encrypted: entry.encrypted,
      },
    });
    imported++;
  }

  console.log(`✅ Imported ${imported} configuration entries`);
}

async function printStats() {
  console.log('\n📊 Database Statistics:');

  const criteriaCount = await prisma.criterion.count();
  const evidenceCount = await prisma.evidenceEntry.count();
  const prCount = await prisma.evidenceEntry.count({ where: { type: 'PR' } });
  const slackCount = await prisma.evidenceEntry.count({ where: { type: 'SLACK' } });
  const reviewDocsCount = await prisma.reviewDocument.count();
  const configCount = await prisma.config.count();

  console.log(`  Criteria: ${criteriaCount}`);
  console.log(`  Evidence: ${evidenceCount} (${prCount} PRs, ${slackCount} Slack)`);
  console.log(`  Review Documents: ${reviewDocsCount}`);
  console.log(`  Config Entries: ${configCount}`);
}

async function main() {
  console.log('🚀 DevTrail Data Import');
  console.log('=======================\n');

  try {
    await importCriteria();
    await importConfig();
    await importProcessedPRs();
    await importSlackEvidence();
    await importReviewDocuments();
    await printStats();

    console.log('\n✨ Import completed successfully!');
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
