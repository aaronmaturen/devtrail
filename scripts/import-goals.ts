#!/usr/bin/env tsx

/**
 * Import existing goals from markdown files into database
 * This script reads goals_*.md files from ../reports/ and imports them into the database
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { prisma } from '../lib/db/prisma';

const REPORTS_DIR = path.join(__dirname, '../../reports');
const GOALS_DIR = path.join(__dirname, '../../reports/goals');
const GOALS_FILE_PATTERN = /^goals_(\d{4}-\d{2}-\d{2})_.*\.md$/;
const PROGRESS_FILE_PATTERN = /^goals_progress_(\d{4}-\d{2}-\d{2})_.*\.md$/;

interface ParsedGoal {
  title: string;
  description: string;
  category: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  timeline: string;
  successCriteria: string[];
}

interface ParsedProgress {
  goalTitle: string;
  progressPercent: number;
  accomplishments: string[];
  areasForImprovement: string[];
  nextSteps: string[];
  notes: string;
}

/**
 * Parse a goal section from markdown
 */
function parseGoalSection(text: string): ParsedGoal | null {
  const lines = text.split('\n');

  // Extract title (should be ## heading)
  const titleMatch = text.match(/^##\s+(.+)$/m);
  if (!titleMatch) return null;
  const title = titleMatch[1].trim();

  // Extract SMART goal description
  const smartGoalMatch = text.match(/\*\*SMART Goal:\*\*\s+([\s\S]+?)(?=\n\n|\*\*)/);
  const description = smartGoalMatch ? smartGoalMatch[1].trim() : '';

  // Extract Success Criteria
  const successCriteriaMatch = text.match(/\*\*Success Criteria:\*\*\s+([\s\S]+?)(?=\n\n\*\*|$)/);
  const successCriteria: string[] = [];
  if (successCriteriaMatch) {
    const criteriaText = successCriteriaMatch[1];
    const criteriaLines = criteriaText.split('\n').filter(l => l.trim().startsWith('-'));
    successCriteria.push(...criteriaLines.map(l => l.replace(/^-\s*/, '').trim()));
  }

  // Extract Timeline
  const timelineMatch = text.match(/\*\*Timeline:\*\*\s+(.+)$/m);
  const timeline = timelineMatch ? timelineMatch[1].trim() : '';

  // Extract Alignment
  const alignmentMatch = text.match(/\*\*Alignment:\*\*\s+([\s\S]+?)(?=\n\n|\*\*|$)/);
  const alignment = alignmentMatch ? alignmentMatch[1].trim() : '';

  // Determine category from title keywords
  const titleLower = title.toLowerCase();
  let category = 'TECHNICAL';
  if (titleLower.includes('leadership') || titleLower.includes('mentor')) {
    category = 'LEADERSHIP';
  } else if (titleLower.includes('communication') || titleLower.includes('stakeholder')) {
    category = 'COMMUNICATION';
  } else if (titleLower.includes('security')) {
    category = 'TECHNICAL';
  } else if (titleLower.includes('delivery') || titleLower.includes('process')) {
    category = 'DELIVERY';
  }

  // Calculate target date from timeline
  const targetDate = new Date();
  if (timeline.includes('month')) {
    const monthsMatch = timeline.match(/(\d+)\s*month/);
    if (monthsMatch) {
      targetDate.setMonth(targetDate.getMonth() + parseInt(monthsMatch[1]));
    }
  }

  return {
    title,
    description,
    category,
    specific: description,
    measurable: successCriteria.join('\n'),
    achievable: alignment,
    relevant: alignment,
    timeBound: timeline,
    timeline,
    successCriteria,
  };
}

/**
 * Parse goals markdown file
 */
async function parseGoalsFile(filePath: string): Promise<ParsedGoal[]> {
  const content = await fs.readFile(filePath, 'utf-8');

  // Split into goal sections (each starts with ##)
  const sections = content.split(/(?=^## )/m).filter(s => s.trim() && !s.startsWith('# SMART GOALS'));

  const goals: ParsedGoal[] = [];
  for (const section of sections) {
    const parsed = parseGoalSection(section);
    if (parsed) {
      goals.push(parsed);
    }
  }

  return goals;
}

/**
 * Parse progress markdown file
 */
async function parseProgressFile(filePath: string): Promise<ParsedProgress[]> {
  const content = await fs.readFile(filePath, 'utf-8');

  // Split into goal progress sections (each starts with # followed by a goal name)
  const sections = content.split(/(?=^# (?:Progress Evaluation|.*Progress|.*Evaluation):)/m)
    .filter(s => s.trim() && !s.startsWith('# Goals Progress Report'));

  const progressEntries: ParsedProgress[] = [];

  for (const section of sections) {
    // Extract goal title
    const titleMatch = section.match(/^# (?:Progress Evaluation:|.*Progress Evaluation:)?\s*(.+?)(?:\n|$)/m);
    if (!titleMatch) continue;
    const goalTitle = titleMatch[1].trim();

    // Extract progress percentage
    const progressMatch = section.match(/##\s*Progress:\s*(\d+)%/);
    const progressPercent = progressMatch ? parseInt(progressMatch[1]) : 0;

    // Extract accomplishments
    const accomplishments: string[] = [];
    const accomplishmentsMatch = section.match(/##\s*Accomplishments\s+([\s\S]+?)(?=\n## |$)/);
    if (accomplishmentsMatch) {
      const items = accomplishmentsMatch[1].match(/###\s*\d+\.\s*\*\*(.+?)\*\*/g);
      if (items) {
        accomplishments.push(...items.map(item => {
          const match = item.match(/\*\*(.+?)\*\*/);
          return match ? match[1] : item;
        }));
      }
    }

    // Extract areas for improvement
    const areasForImprovement: string[] = [];
    const improvementMatch = section.match(/##\s*Areas for Improvement\s+([\s\S]+?)(?=\n## |$)/);
    if (improvementMatch) {
      const items = improvementMatch[1].match(/###\s*\d+\.\s*\*\*(.+?)\*\*/g);
      if (items) {
        areasForImprovement.push(...items.map(item => {
          const match = item.match(/\*\*(.+?)\*\*/);
          return match ? match[1] : item;
        }));
      }
    }

    // Extract next steps
    const nextSteps: string[] = [];
    const nextStepsMatch = section.match(/##\s*Next Steps\s+([\s\S]+?)(?=\n---\n|$)/);
    if (nextStepsMatch) {
      const items = nextStepsMatch[1].match(/###\s*\d+\.\s*\*\*(.+?)\*\*/g);
      if (items) {
        nextSteps.push(...items.map(item => {
          const match = item.match(/\*\*(.+?)\*\*/);
          return match ? match[1] : item;
        }));
      }
    }

    progressEntries.push({
      goalTitle,
      progressPercent,
      accomplishments,
      areasForImprovement,
      nextSteps,
      notes: section.substring(0, 500), // Store a summary
    });
  }

  return progressEntries;
}

/**
 * Import goals from markdown files
 */
async function importGoals() {
  try {
    console.log('🔍 Scanning for goals markdown files...');

    // Scan both REPORTS_DIR and GOALS_DIR
    const directories = [
      { path: REPORTS_DIR, name: 'reports' },
      { path: GOALS_DIR, name: 'reports/goals' }
    ];

    let goalsFiles: string[] = [];
    let progressFiles: string[] = [];
    let selectedGoalsDir = REPORTS_DIR;

    for (const dir of directories) {
      try {
        const files = await fs.readdir(dir.path);
        const dirGoalsFiles = files.filter(f => GOALS_FILE_PATTERN.test(f));
        const dirProgressFiles = files.filter(f => PROGRESS_FILE_PATTERN.test(f));

        console.log(`  📁 ${dir.name}: ${dirGoalsFiles.length} goals file(s), ${dirProgressFiles.length} progress file(s)`);

        if (dirGoalsFiles.length > 0) {
          goalsFiles = dirGoalsFiles.map(f => path.join(dir.path, f));
          selectedGoalsDir = dir.path;
        }
        if (dirProgressFiles.length > 0) {
          progressFiles = dirProgressFiles.map(f => path.join(dir.path, f));
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error(`  ⚠️  Error scanning ${dir.name}:`, error.message);
        }
      }
    }

    if (goalsFiles.length === 0) {
      console.log('⚠️  No goals files found. Expected files matching pattern: goals_YYYY-MM-DD_*.md');
      return;
    }

    // Use the most recent goals file
    const latestGoalsFile = goalsFiles.sort().reverse()[0];
    console.log(`\n📖 Reading goals from: ${path.basename(latestGoalsFile)}`);

    // Parse goals
    const parsedGoals = await parseGoalsFile(latestGoalsFile);
    console.log(`✅ Parsed ${parsedGoals.length} goal(s)`);

    // Parse progress if available
    let progressData: ParsedProgress[] = [];
    if (progressFiles.length > 0) {
      const latestProgressFile = progressFiles.sort().reverse()[0];
      console.log(`📊 Reading progress from: ${path.basename(latestProgressFile)}`);
      progressData = await parseProgressFile(latestProgressFile);
      console.log(`✅ Parsed ${progressData.length} progress entry/entries`);
    }

    // Check if goals already exist
    const existingGoalsCount = await prisma.goal.count();
    if (existingGoalsCount > 0) {
      console.log(`\n⚠️  Database already contains ${existingGoalsCount} goal(s).`);
      console.log('   Proceeding will add more goals. Press Ctrl+C to cancel or wait 3 seconds to continue...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Import each goal
    console.log('\n📥 Importing goals...');
    let imported = 0;
    const goalMap = new Map<string, string>(); // Map title to ID

    for (const goal of parsedGoals) {
      try {
        // Find matching progress data
        const progress = progressData.find(p =>
          p.goalTitle.toLowerCase().includes(goal.title.toLowerCase().substring(0, 20)) ||
          goal.title.toLowerCase().includes(p.goalTitle.toLowerCase().substring(0, 20))
        );

        const progressPercent = progress ? progress.progressPercent : 0;

        // Goals from /reports/goals/ are from previous FY and should be marked as completed
        // if they have progress data or if the file is from the goals subdirectory
        const isHistoricalGoal = latestGoalsFile.includes('/goals/');
        const status = isHistoricalGoal ? 'COMPLETED' :
                      progressPercent >= 90 ? 'COMPLETED' :
                      progressPercent >= 50 ? 'ACTIVE' :
                      progressPercent > 0 ? 'ACTIVE' : 'ACTIVE';

        const createdGoal = await prisma.goal.create({
          data: {
            title: goal.title,
            description: goal.description,
            category: goal.category,
            status,
            priority: 'HIGH',
            specific: goal.specific,
            measurable: goal.measurable,
            achievable: goal.achievable,
            relevant: goal.relevant,
            timeBound: goal.timeBound,
            targetDate: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // 6 months from now
            progressPercent,
            generatedFrom: JSON.stringify({
              source: 'cli-import',
              goalsFile: path.basename(latestGoalsFile),
              progressFile: progressFiles.length > 0 ? path.basename(progressFiles[0]) : null
            }),
          },
        });

        goalMap.set(goal.title, createdGoal.id);

        // Create progress entry if we have progress data
        if (progress) {
          await prisma.goalProgress.create({
            data: {
              goalId: createdGoal.id,
              progressPercent: progress.progressPercent,
              notes: `Accomplishments:\n${progress.accomplishments.join('\n')}\n\nAreas for Improvement:\n${progress.areasForImprovement.join('\n')}\n\nNext Steps:\n${progress.nextSteps.join('\n')}`,
              aiSummary: progress.notes,
            },
          });
        }

        imported++;
        console.log(`  ✓ Imported: ${goal.title} (${progressPercent}% complete)`);
      } catch (error) {
        console.error(`  ✗ Failed to import "${goal.title}":`, error);
      }
    }

    console.log(`\n🎉 Successfully imported ${imported} of ${parsedGoals.length} goals`);
    console.log(`\n💡 You can view your goals in Prisma Studio: npm run db:studio`);
  } catch (error) {
    console.error('❌ Error importing goals:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importGoals();
