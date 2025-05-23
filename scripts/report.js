#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');

// Paths
const PROCESSED_PATH = path.join(__dirname, '..', 'data', 'processed-prs.json');
const CRITERIA_PATH = path.join(__dirname, '..', 'criteria.csv');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const LATTICE_DIR = path.join(__dirname, '..', 'lattice');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Generate a timestamped filename
function getTimestampedFilename(prefix) {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .split('.')[0]; // Remove milliseconds
  return path.join(REPORTS_DIR, `${prefix}_${timestamp}.md`);
}

// Load processed PRs
function loadProcessedPRs() {
  if (!fs.existsSync(PROCESSED_PATH)) {
    console.error(chalk.red(`Error: File not found at ${PROCESSED_PATH}`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
}

// Load config and get user context
function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`Error: Missing config.json. Please copy config.example.json to config.json and update it.`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Find and load all review files from the lattice directory
function loadReviewFiles() {
  const reviews = {
    employee: [],
    manager: []
  };

  try {
    // Get all directories in the lattice folder
    const dirs = fs.readdirSync(LATTICE_DIR)
      .filter(dir => dir !== 'example' && fs.statSync(path.join(LATTICE_DIR, dir)).isDirectory())
      .sort(); // Sort chronologically

    // Process each directory
    dirs.forEach(dir => {
      const dirPath = path.join(LATTICE_DIR, dir);
      const files = fs.readdirSync(dirPath);

      // Calculate a weight based on recency (more recent = higher weight)
      // Format can be YYYY or YYYY-mid
      const yearMatch = dir.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;
      const isMidYear = dir.includes('-mid');
      const weight = year * 10 + (isMidYear ? 5 : 0); // Mid-year reviews are between annual reviews

      // Find employee review files
      const employeeFiles = files.filter(f => f === 'employee-review.md' || f === 'employee.md');
      employeeFiles.forEach(file => {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        reviews.employee.push({
          dir,
          file,
          content,
          weight
        });
      });

      // Find manager review files
      const managerFiles = files.filter(f => f === 'manager-review.md' || f === 'manager.md');
      managerFiles.forEach(file => {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        reviews.manager.push({
          dir,
          file,
          content,
          weight
        });
      });
    });

    // Sort all files by weight (descending)
    reviews.employee.sort((a, b) => b.weight - a.weight);
    reviews.manager.sort((a, b) => b.weight - a.weight);

    console.log(chalk.blue(`Found ${reviews.employee.length} employee reviews and ${reviews.manager.length} manager reviews`));
    return reviews;
  } catch (error) {
    console.error(chalk.red(`Error loading review files: ${error.message}`));
    return reviews;
  }
}

// Load criteria for lookup
function loadCriteria() {
  const csv = fs.readFileSync(CRITERIA_PATH, 'utf8');
  const lines = csv.split('\n').filter(line => line.trim());

  // Parse header
  const header = lines[0].split(',');
  const criteriaIdIndex = header.indexOf('criterion_id');
  const areaIndex = header.indexOf('area_of_concentration');
  const subareaIndex = header.indexOf('subarea');
  const descriptionIndex = header.indexOf('description');
  const prDetectableIndex = header.indexOf('pr_detectable');

  if (criteriaIdIndex === -1 || areaIndex === -1 || subareaIndex === -1 || descriptionIndex === -1) {
    console.error(chalk.red('Error: Invalid criteria CSV format'));
    process.exit(1);
  }

  // Parse criteria
  const criteria = {};
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length <= Math.max(criteriaIdIndex, areaIndex, subareaIndex, descriptionIndex)) {
      continue; // Skip invalid lines
    }

    const id = values[criteriaIdIndex];
    const prDetectable = prDetectableIndex !== -1 ?
      (values[prDetectableIndex]?.toLowerCase() === 'yes' || values[prDetectableIndex]?.toLowerCase() === 'true') :
      true; // Default to true if column doesn't exist

    criteria[id] = {
      id,
      area: values[areaIndex],
      subarea: values[subareaIndex],
      description: values[descriptionIndex].replace(/^"(.*)"$/, '$1'), // Remove quotes if present
      order: parseInt(id) || 999, // For sorting, default to high number if not numeric
      prDetectable: prDetectable // Whether this criterion can be detected from PR data
    };
  }

  return criteria;
}

// Group evidence by criterion
function groupByCriterion(processedPRs, criteria) {
  const grouped = {};

  // Initialize with all criteria in order
  Object.values(criteria).forEach(criterion => {
    grouped[criterion.id] = {
      ...criterion,
      evidence: [],
      totalConfidence: 0,
      count: 0,
      order: parseInt(criterion.id, 10) || 999 // Use ID for sorting
    };
  });

  // Process each PR
  Object.entries(processedPRs).forEach(([repo, prs]) => {
    prs.forEach(pr => {
      // Skip PRs that were skipped
      if (pr.skipped) return;

      // Process evidence array
      if (Array.isArray(pr.evidence)) {
        pr.evidence.forEach(item => {
          const criterionId = item.criterion_id;
          if (criterionId && criterionId !== 'NONE' && criterionId !== 'ERROR') {
            if (!grouped[criterionId]) {
              // Handle case where criterion ID isn't in our criteria list
              grouped[criterionId] = {
                id: criterionId,
                area: 'Unknown',
                subarea: 'Unknown',
                description: 'Unknown criterion',
                evidence: [],
                totalConfidence: 0,
                count: 0,
                order: parseInt(criterionId, 10) || 999
              };
            }

            grouped[criterionId].evidence.push({
              repo,
              pr_number: pr.pr_number,
              pr_title: pr.pr_title,
              confidence: item.confidence || 0,
              evidence: item.evidence
            });

            grouped[criterionId].totalConfidence += (item.confidence || 0);
            grouped[criterionId].count += 1;
          }
        });
      } else if (pr.evidence && pr.evidence.criterion_id) {
        // Handle old format (single evidence object)
        const criterionId = pr.evidence.criterion_id;
        if (criterionId && criterionId !== 'NONE' && criterionId !== 'ERROR') {
          if (!grouped[criterionId]) {
            grouped[criterionId] = {
              id: criterionId,
              area: 'Unknown',
              subarea: 'Unknown',
              description: 'Unknown criterion',
              evidence: [],
              totalConfidence: 0,
              count: 0,
              order: parseInt(criterionId, 10) || 999
            };
          }

          grouped[criterionId].evidence.push({
            repo,
            pr_number: pr.pr_number,
            pr_title: pr.pr_title,
            confidence: 100, // Default for old format
            evidence: pr.evidence.evidence
          });

          grouped[criterionId].totalConfidence += 100;
          grouped[criterionId].count += 1;
        }
      }
    });
  });

  return grouped;
}

// Print report and save to markdown file
function printReport(grouped) {
  const reportFilename = getTimestampedFilename('report');
  let markdownContent = '# ANNUAL REVIEW EVIDENCE REPORT\n\n';

  console.log(chalk.bold.blue('\n=== ANNUAL REVIEW EVIDENCE REPORT ===\n'));

  // Sort all criteria by ID (numerically) - include those with no evidence
  const sortedCriteria = Object.values(grouped)
    .sort((a, b) => a.order - b.order);

  // Print summary
  console.log(chalk.bold.green('SUMMARY:'));
  console.log(chalk.dim('─'.repeat(80)));
  markdownContent += '## SUMMARY\n\n';

  sortedCriteria.forEach(criterion => {
    if (criterion.count > 0) {
      const avgConfidence = criterion.count ? Math.round(criterion.totalConfidence / criterion.count) : 0;
      const confidenceColor =
        avgConfidence >= 80 ? chalk.green :
        avgConfidence >= 60 ? chalk.yellow :
        chalk.red;

      console.log(
        chalk.bold.cyan(`${criterion.id}: [${criterion.area} > ${criterion.subarea}]`) +
        chalk.bold(` (${criterion.count} PRs, `) +
        confidenceColor(`Avg Confidence: ${avgConfidence}%`) +
        chalk.bold(')')
      );
      console.log(chalk.white(criterion.description));

      markdownContent += `### ${criterion.id}: [${criterion.area} > ${criterion.subarea}] (${criterion.count} PRs, Avg Confidence: ${avgConfidence}%)\n\n`;
      markdownContent += `${criterion.description}\n\n`;
    } else {
      // Check if this criterion is detectable from PR data
      if (criterion.prDetectable === false) {
        console.log(
          chalk.bold.gray(`${criterion.id}: [${criterion.area} > ${criterion.subarea}]`) +
          chalk.bold.blue(' (Not Detectable from PR Data)')
        );
        console.log(chalk.gray(criterion.description));
        console.log(chalk.blue('This criterion typically requires direct observation or feedback and cannot be automatically detected from PR or ticket data.'));

        markdownContent += `### ${criterion.id}: [${criterion.area} > ${criterion.subarea}] (Not Detectable from PR Data)\n\n`;
        markdownContent += `${criterion.description}\n\n`;
        markdownContent += `*Note: This criterion typically requires direct observation or feedback and cannot be automatically detected from PR or ticket data.*\n\n`;
      } else {
        console.log(
          chalk.bold.gray(`${criterion.id}: [${criterion.area} > ${criterion.subarea}]`) +
          chalk.bold.red(' (No Evidence - Potential Area for Improvement)')
        );
        console.log(chalk.gray(criterion.description));

        markdownContent += `### ${criterion.id}: [${criterion.area} > ${criterion.subarea}] (No Evidence - Potential Area for Improvement)\n\n`;
        markdownContent += `${criterion.description}\n\n`;
        markdownContent += `*This may be an area to focus on for professional development.*\n\n`;
      }
    }
    console.log(chalk.dim('─'.repeat(80)));
    markdownContent += '---\n\n';
  });

  // Print detailed evidence for each criterion
  console.log(chalk.bold.green('\nDETAILED EVIDENCE:'));
  markdownContent += '## DETAILED EVIDENCE\n\n';

  sortedCriteria.forEach(criterion => {
    console.log('\n' + chalk.bold.cyan('='.repeat(80)));
    console.log(chalk.bold.cyan(`CRITERION ${criterion.id}: [${criterion.area} > ${criterion.subarea}]`));
    console.log(chalk.bold.cyan(criterion.description));
    console.log(chalk.bold.cyan('='.repeat(80)));

    markdownContent += `### CRITERION ${criterion.id}: [${criterion.area} > ${criterion.subarea}]\n\n`;
    markdownContent += `${criterion.description}\n\n`;
    markdownContent += '---\n\n';

    if (criterion.count > 0) {
      // Sort evidence by confidence
      const sortedEvidence = criterion.evidence.sort((a, b) => b.confidence - a.confidence);

      sortedEvidence.forEach((item, i) => {
        const confidenceColor =
          item.confidence >= 80 ? chalk.green :
          item.confidence >= 60 ? chalk.yellow :
          chalk.red;

        console.log(
          chalk.bold.white(`\n${i+1}. ${item.repo}#${item.pr_number}: `) +
          chalk.white(item.pr_title) +
          ' ' + confidenceColor(`(Confidence: ${item.confidence}%)`)
        );
        console.log(chalk.dim('─'.repeat(40)));
        console.log(chalk.italic.yellow(item.evidence));

        markdownContent += `#### ${i+1}. ${item.repo}#${item.pr_number}: ${item.pr_title} (Confidence: ${item.confidence}%)\n\n`;
        markdownContent += `${item.evidence}\n\n`;
        markdownContent += '---\n\n';
      });
    } else {
      console.log(chalk.bold.red('\nNo evidence found for this criterion.'));
      markdownContent += '**No evidence found for this criterion.**\n\n';
    }
  });

  console.log('\n' + chalk.bold.blue('=== END OF REPORT ===\n'));
  markdownContent += '\n# END OF REPORT\n';

  // Save report to file
  fs.writeFileSync(reportFilename, markdownContent);
  console.log(chalk.green(`\nReport saved to: ${reportFilename}`));
}

// Generate AI summary of evidence
async function generateAISummary(grouped, config) {
  const reportFilename = getTimestampedFilename('ai_report');
  let markdownContent = '# ANNUAL REVIEW AI SUMMARY REPORT\n\n';

  console.log(chalk.blue('Generating AI summary of evidence...'));

  const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

  // Sort all criteria by ID (numerically) - include those with no evidence
  const sortedCriteria = Object.values(grouped)
    .sort((a, b) => a.order - b.order);

  for (const criterion of sortedCriteria) {
    console.log(chalk.yellow(`Processing criterion ${criterion.id}...`));

    markdownContent += `## ${criterion.id}: [${criterion.area} > ${criterion.subarea}]\n\n`;
    markdownContent += `${criterion.description}\n\n`;

    if (criterion.count === 0) {
      console.log(chalk.bold.cyan(`\n${criterion.id}: [${criterion.area} > ${criterion.subarea}]`));
      console.log(chalk.white(criterion.description));
      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.bold.red('No evidence found for this criterion.'));
      console.log();

      markdownContent += '**No evidence found for this criterion.**\n\n';
      markdownContent += '---\n\n';
    } else {
      try {
        // Code for generating summary would go here
        // This section was removed due to syntax errors
      } catch (error) {
        const errorMsg = `Error generating summary for criterion ${criterion.id}: ${error.message}`;
        console.error(chalk.red(errorMsg));
        markdownContent += `**${errorMsg}**\n\n`;
        markdownContent += '---\n\n';
      }
    }
  }

  // Save report to file
  fs.writeFileSync(reportFilename, markdownContent);
  console.log(chalk.green(`\nAI Report saved to: ${reportFilename}`));
}

// Main function
async function main() {
  try {
    // Check for --ai flag
    const useAI = process.argv.includes('--ai');

    const processedPRs = loadProcessedPRs();
    const criteria = loadCriteria();
    const grouped = groupByCriterion(processedPRs, criteria);

    if (useAI) {
      // Load config for API key
      const configPath = path.join(__dirname, '..', 'config.json');
      if (!fs.existsSync(configPath)) {
        throw new Error('Missing config.json');
      }
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      if (!config.anthropic_api_key) {
        throw new Error('Missing anthropic_api_key in config.json');
      }

      await generateAISummary(grouped, config);
    } else {
      printReport(grouped);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  process.exit(1);
});
