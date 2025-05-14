#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');

// Paths
const PROCESSED_PATH = path.join(__dirname, '..', 'data', 'processed-prs.json');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

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

// Filter PRs from the last 3 months
function getRecentPRs(processedPRs) {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  const recentPRs = {};
  
  Object.entries(processedPRs).forEach(([repo, prs]) => {
    const recentReposPRs = prs.filter(pr => {
      if (pr.skipped) return false;
      
      // Check if merged_at exists and is within last 3 months
      if (!pr.merged_at) return false;
      
      const mergedAt = new Date(pr.merged_at);
      return !isNaN(mergedAt) && mergedAt >= threeMonthsAgo;
    });
    
    if (recentReposPRs.length > 0) {
      recentPRs[repo] = recentReposPRs;
    }
  });
  
  return recentPRs;
}

// Group PRs by month
function groupPRsByMonth(recentPRs) {
  const monthGroups = {};
  
  Object.entries(recentPRs).forEach(([repo, prs]) => {
    prs.forEach(pr => {
      if (!pr.merged_at) return;
      
      const mergedAt = new Date(pr.merged_at);
      if (isNaN(mergedAt)) return;
      
      // Format as YYYY-MM
      const monthKey = `${mergedAt.getFullYear()}-${String(mergedAt.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = [];
      }
      
      monthGroups[monthKey].push({
        ...pr,
        repo
      });
    });
  });
  
  return monthGroups;
}

// Identify potential new features for capitalization
async function identifyCapitalizableFeatures(monthlyPRs, config) {
  const reportFilename = getTimestampedFilename('capitalization');
  let markdownContent = '# SOFTWARE CAPITALIZATION REPORT\n\n';
  markdownContent += `## Last 3 Months (${new Date().toISOString().split('T')[0]})\n\n`;
  
  // Sort months in reverse chronological order
  const sortedMonths = Object.keys(monthlyPRs).sort().reverse();
  
  if (sortedMonths.length === 0) {
    markdownContent += 'No PRs found from the last 3 months.\n\n';
    fs.writeFileSync(reportFilename, markdownContent);
    console.log(chalk.green(`\nEmpty capitalization report saved to: ${reportFilename}`));
    return;
  }
  
  console.log(chalk.blue('Analyzing PRs for capitalizable features...'));
  
  const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });
  
  // Process each month
  for (const month of sortedMonths) {
    const prs = monthlyPRs[month];
    const monthName = new Date(`${month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' });
    
    console.log(chalk.yellow(`\nProcessing ${monthName} (${prs.length} PRs)...`));
    
    markdownContent += `\n## ${monthName}\n\n`;
    markdownContent += '| Feature | Description | Hours | PR References |\n';
    markdownContent += '|---------|-------------|-------|---------------|\n';
    
    // Prepare PR data for analysis
    const prData = [];
    const totalPRs = prs.length;
    
    prs.forEach(pr => {
      // Extract relevant PR data
      const prInfo = {
        repo: pr.repo,
        number: pr.pr_number,
        title: pr.pr_title,
        body: pr.pr_body || '',
        merged_at: pr.merged_at,
        jira_key: pr.jira_key || '',
        jira_title: pr.jira_title || '',
        jira_description: pr.jira_description || '',
        commits: pr.commits || [],
        comments: pr.comments || []
      };
      
      prData.push(prInfo);
    });
    
    if (totalPRs === 0) {
      console.log(chalk.red(`No PRs found for ${monthName}`));
      markdownContent += '| No capitalizable features found | - | - | - |\n\n';
      continue;
    }
    
    // Prepare data for Claude
    const prompt = `You are a software capitalization expert helping to identify which development work qualifies as capitalizable expenses. 

For software development, capitalizable work typically includes:
1. New feature development
2. Major enhancements to existing functionality
3. Development of new integrations or APIs
4. Significant UI/UX redesigns that add functionality
5. Development of new modules or components

Work that is NOT typically capitalizable includes:
1. Bug fixes
2. Minor UI tweaks
3. Refactoring without adding functionality
4. Documentation updates
5. Routine maintenance

Below is a list of pull requests from ${monthName}:

${prData.map(pr => `
PR: ${pr.repo}#${pr.number} - ${pr.title}
Merged: ${pr.merged_at}
${pr.jira_key ? `Jira: ${pr.jira_key} - ${pr.jira_title}` : ''}
${pr.body ? `Description: ${pr.body.substring(0, 200)}${pr.body.length > 200 ? '...' : ''}` : ''}
`).join('\n')}

For each PR that represents capitalizable work (new features or significant enhancements), provide:
1. A descriptive feature name (what was built)
2. A very brief description (less than 10 words)
3. An estimated number of hours spent (rounded to nearest 5)
4. The PR reference(s)

Group related PRs that are part of the same feature together.

Format your response as a table with these columns:
Feature | Description | Hours | PR References

Only include PRs that represent capitalizable work. If a PR is for bug fixes, maintenance, or other non-capitalizable work, exclude it.`;
    
    try {
      console.log(chalk.yellow(`Identifying capitalizable features for ${monthName}...`));
      
      const completion = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 2048,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const capitalizationTable = completion.content[0].text.trim();
      
      // Extract just the table content (skip any explanatory text)
      let tableContent = capitalizationTable;
      if (capitalizationTable.includes('|')) {
        const tableLines = capitalizationTable.split('\n').filter(line => line.includes('|'));
        // Skip the header row and separator row if present
        const dataRows = tableLines.filter(line => !line.match(/^\s*\|[\s-]*\|[\s-]*\|[\s-]*\|[\s-]*\|\s*$/));
        tableContent = dataRows.join('\n');
      }
      
      console.log(chalk.green(`Capitalizable Features for ${monthName}:`));
      console.log(tableContent);
      
      markdownContent += tableContent + '\n\n';
    } catch (error) {
      console.error(chalk.red(`Error identifying capitalizable features for ${monthName}: ${error.message}`));
      markdownContent += `| Error processing ${monthName} | ${error.message} | - | - |\n\n`;
    }
  }
  
  markdownContent += '\n## Notes\n\n';
  markdownContent += '- Hours are estimates rounded to the nearest 5\n';
  markdownContent += '- Only includes work from the last 3 calendar months\n';
  markdownContent += '- Only capitalizable work (new features, enhancements) is included\n';
  markdownContent += '- Bug fixes, maintenance, and minor tweaks are excluded\n';
  
  // Save report to file
  fs.writeFileSync(reportFilename, markdownContent);
  console.log(chalk.green(`\nCapitalization report saved to: ${reportFilename}`));
}

// Main function
async function main() {
  try {
    const processedPRs = loadProcessedPRs();
    const recentPRs = getRecentPRs(processedPRs);
    const monthlyPRs = groupPRsByMonth(recentPRs);
    
    // Load config for API key
    const configPath = path.join(__dirname, '..', 'config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('Missing config.json');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (!config.anthropic_api_key) {
      throw new Error('Missing anthropic_api_key in config.json');
    }
    
    await identifyCapitalizableFeatures(monthlyPRs, config);
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
