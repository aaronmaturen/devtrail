#!/usr/bin/env tsx

/**
 * Migration Script: Import Markdown Reports to Database
 *
 * This script migrates existing markdown reports from /reports to the database.
 * It reads markdown files, extracts metadata from filenames, and creates Report records.
 *
 * Usage: tsx scripts/migrate-markdown-reports.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const prisma = new PrismaClient();

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}

const stats: MigrationStats = {
  total: 0,
  migrated: 0,
  skipped: 0,
  errors: 0,
};

// Map markdown filename prefixes to Report types
const REPORT_TYPE_MAP: Record<string, string> = {
  'report': 'EVIDENCE',
  'ai_report': 'SUMMARY',
  'enhanced_report': 'COMPREHENSIVE',
  'component_analysis': 'COMPONENT_ANALYSIS',
  'capitalization': 'CAPITALIZATION',
  'upward_review': 'UPWARD',
  'resume': 'RESUME',
  'review_package': 'REVIEW_PACKAGE',
  'interactive_review': 'INTERACTIVE_REVIEW',
  'goals': 'GOALS',
  'goals_progress': 'GOALS_PROGRESS',
  'summary': 'SUMMARY',
  'comprehensive_summary': 'COMPREHENSIVE',
};

/**
 * Extract report type from filename
 */
function extractReportType(filename: string): string | null {
  const baseName = basename(filename, '.md');

  // Try to match known prefixes
  for (const [prefix, type] of Object.entries(REPORT_TYPE_MAP)) {
    if (baseName.startsWith(prefix)) {
      return type;
    }
  }

  return null;
}

/**
 * Extract timestamp from filename
 * Handles formats like:
 * - report_2025-05-23_17-38-43-853Z.md
 * - report_2025-05-23T17-38-45.529Z.md
 */
function extractTimestamp(filename: string): Date {
  const baseName = basename(filename, '.md');

  // Try to extract ISO-like timestamp
  const isoMatch = baseName.match(/(\d{4}-\d{2}-\d{2})[T_](\d{2}[-:]?\d{2}[-:]?\d{2})/);

  if (isoMatch) {
    const dateStr = isoMatch[1];
    const timeStr = isoMatch[2].replace(/-/g, ':');
    const timestamp = new Date(`${dateStr}T${timeStr}Z`);

    if (!isNaN(timestamp.getTime())) {
      return timestamp;
    }
  }

  // Fallback to file modification time
  const reportPath = join(process.cwd(), '..', 'reports', filename);
  return statSync(reportPath).mtime;
}

/**
 * Extract evidence count from markdown content
 */
function extractEvidenceCount(content: string): number | null {
  // Look for patterns like "Total PRs: 123" or "Evidence Count: 45"
  const prCountMatch = content.match(/Total PRs?:\s*(\d+)/i);
  if (prCountMatch) {
    return parseInt(prCountMatch[1], 10);
  }

  const evidenceCountMatch = content.match(/Evidence Count:\s*(\d+)/i);
  if (evidenceCountMatch) {
    return parseInt(evidenceCountMatch[1], 10);
  }

  // Count markdown heading markers as rough estimate
  const headings = content.match(/^###\s+/gm);
  if (headings) {
    return headings.length;
  }

  return null;
}

/**
 * Extract criteria count from markdown content
 */
function extractCriteriaCount(content: string): number | null {
  // Look for patterns like "Criteria: 15" or count unique criterion IDs
  const criteriaCountMatch = content.match(/Criteria:\s*(\d+)/i);
  if (criteriaCountMatch) {
    return parseInt(criteriaCountMatch[1], 10);
  }

  // Count criterion ID references (e.g., "Criterion 12:")
  const criterionMatches = content.match(/Criterion\s+(\d+):/gi);
  if (criterionMatches) {
    const uniqueCriteria = new Set(
      criterionMatches.map(m => m.match(/\d+/)?.[0]).filter(Boolean)
    );
    return uniqueCriteria.size;
  }

  return null;
}

/**
 * Generate report name from filename and content
 */
function generateReportName(filename: string, type: string, timestamp: Date): string {
  const dateStr = timestamp.toISOString().split('T')[0];
  const typeName = type.replace(/_/g, ' ').toLowerCase();
  return `${typeName.charAt(0).toUpperCase() + typeName.slice(1)} Report - ${dateStr}`;
}

/**
 * Migrate a single markdown report
 */
async function migrateReport(filename: string, dryRun: boolean): Promise<void> {
  try {
    stats.total++;

    const reportPath = join(process.cwd(), '..', 'reports', filename);
    const content = readFileSync(reportPath, 'utf-8');

    const type = extractReportType(filename);
    if (!type) {
      console.log(`⚠️  Skipping ${filename}: Unknown report type`);
      stats.skipped++;
      return;
    }

    const timestamp = extractTimestamp(filename);
    const name = generateReportName(filename, type, timestamp);
    const evidenceCount = extractEvidenceCount(content);
    const criteriaCount = extractCriteriaCount(content);

    // Check if already migrated
    const existing = await prisma.report.findFirst({
      where: {
        type,
        createdAt: {
          gte: new Date(timestamp.getTime() - 1000), // 1 second tolerance
          lte: new Date(timestamp.getTime() + 1000),
        },
      },
    });

    if (existing) {
      console.log(`⏭️  Skipping ${filename}: Already exists in database (ID: ${existing.id})`);
      stats.skipped++;
      return;
    }

    if (dryRun) {
      console.log(`🔍 [DRY RUN] Would migrate: ${filename}`);
      console.log(`   Type: ${type}`);
      console.log(`   Name: ${name}`);
      console.log(`   Timestamp: ${timestamp.toISOString()}`);
      console.log(`   Evidence Count: ${evidenceCount ?? 'unknown'}`);
      console.log(`   Criteria Count: ${criteriaCount ?? 'unknown'}`);
      console.log(`   Content Length: ${content.length} characters`);
      stats.migrated++;
      return;
    }

    // Create report in database
    const report = await prisma.report.create({
      data: {
        name,
        type,
        content,
        evidenceCount,
        criteriaCount,
        metadata: JSON.stringify({
          migratedFrom: filename,
          migratedAt: new Date().toISOString(),
          originalTimestamp: timestamp.toISOString(),
        }),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    console.log(`✅ Migrated: ${filename} → ${report.id}`);
    stats.migrated++;
  } catch (error) {
    console.error(`❌ Error migrating ${filename}:`, error);
    stats.errors++;
  }
}

/**
 * Find all markdown reports recursively
 */
function findMarkdownReports(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        files.push(...findMarkdownReports(fullPath, baseDir));
      } else if (entry.endsWith('.md')) {
        // Add relative path from base directory
        const relativePath = fullPath.replace(baseDir + '/', '');
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }

  return files;
}

/**
 * Main migration function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🚀 DevTrail Markdown Report Migration\n');

  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no database changes will be made\n');
  }

  const reportsDir = join(process.cwd(), '..', 'reports');

  console.log(`📁 Scanning reports directory: ${reportsDir}\n`);

  const reportFiles = findMarkdownReports(reportsDir);

  if (reportFiles.length === 0) {
    console.log('⚠️  No markdown reports found');
    return;
  }

  console.log(`Found ${reportFiles.length} markdown report(s)\n`);

  // Migrate each report
  for (const file of reportFiles) {
    await migrateReport(file, dryRun);
  }

  // Print summary
  console.log('\n📊 Migration Summary:');
  console.log(`   Total reports found: ${stats.total}`);
  console.log(`   Successfully migrated: ${stats.migrated}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log(`   Errors: ${stats.errors}`);

  if (dryRun) {
    console.log('\n💡 Run without --dry-run to perform actual migration');
  } else {
    console.log('\n✨ Migration complete!');
  }
}

// Run migration
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
