#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const csvParse = require("csv-parse/sync");
const { Anthropic } = require("@anthropic-ai/sdk");

// Paths
const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const CRITERIA_PATH = path.join(__dirname, "..", "criteria.csv");
const PROCESSED_PATH = path.join(__dirname, "..", "data", "processed-prs.json");
const SLACK_DATA_PATH = path.join(__dirname, "..", "data", "slack-evidence.json");
const REPORTS_DIR = path.join(__dirname, "..", "reports");

// Ensure directories exist
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Generate timestamped filename
function getTimestampedFilename(prefix) {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .split('.')[0];
  return path.join(REPORTS_DIR, `${prefix}_${timestamp}.md`);
}

// Load configuration
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(chalk.red(`Error: Missing config.json. Please copy config.example.json to config.json and update it.`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

// Load criteria from CSV
function loadCriteria() {
  if (!fs.existsSync(CRITERIA_PATH)) {
    console.error(chalk.red(`Error: Criteria file not found at ${CRITERIA_PATH}`));
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(CRITERIA_PATH, "utf8");
  const records = csvParse.parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });
  
  return records;
}

// Load processed PRs
function loadProcessedPRs() {
  if (!fs.existsSync(PROCESSED_PATH)) {
    console.error(chalk.red(`Error: Processed PRs file not found at ${PROCESSED_PATH}. Run 'npm run sync' first.`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PROCESSED_PATH, "utf8"));
}

// Load Slack evidence data
function loadSlackEvidence() {
  if (!fs.existsSync(SLACK_DATA_PATH)) {
    console.log(chalk.yellow(`No Slack evidence found at ${SLACK_DATA_PATH}. Creating empty dataset.`));
    return [];
  }
  return JSON.parse(fs.readFileSync(SLACK_DATA_PATH, "utf8"));
}

// Save Slack evidence data
function saveSlackEvidence(slackData) {
  const dataDir = path.dirname(SLACK_DATA_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(SLACK_DATA_PATH, JSON.stringify(slackData, null, 2));
}

// Analyze Slack message with AI to determine criteria and description
async function analyzeSlackMessage(message, criteria, config) {
  const anthropic = new Anthropic({
    apiKey: config.anthropic_api_key,
  });

  const criteriaContext = criteria.map(c => 
    `${c.criterion_id}: ${c.area_of_concentration} > ${c.subarea} - ${c.description}`
  ).join('\n');

  const prompt = `Analyze this Slack message for performance review evidence:

MESSAGE: "${message}"

AVAILABLE CRITERIA:
${criteriaContext}

Please analyze this message and respond with a JSON object containing:
1. "description": A brief 1-2 sentence description of what this evidence demonstrates
2. "criteria_ids": An array of criterion IDs (numbers) that this message provides evidence for
3. "confidence": A confidence score (1-100) for how well this message serves as evidence

Focus on identifying concrete examples of:
- Technical contributions and code quality
- Mentoring and collaboration
- Communication and documentation
- Process improvements
- Business impact
- Leadership and decision making

Respond only with valid JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: config.claude_model || "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    });

    const analysis = JSON.parse(response.content[0].text);
    return {
      description: analysis.description,
      criteria_ids: analysis.criteria_ids,
      confidence: analysis.confidence
    };
  } catch (error) {
    console.error(chalk.yellow(`Warning: AI analysis failed: ${error.message}`));
    return {
      description: "Slack message evidence (analysis failed)",
      criteria_ids: [],
      confidence: 50
    };
  }
}

// Add new Slack evidence entry
async function addSlackEvidence(message, link, screenshot, config, criteria) {
  console.log(chalk.blue('Analyzing message with AI...'));
  const analysis = await analyzeSlackMessage(message, criteria, config);
  
  const slackData = loadSlackEvidence();
  
  const newEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    message: message,
    link: link,
    screenshot: screenshot,
    criteria_ids: analysis.criteria_ids,
    description: analysis.description,
    confidence: analysis.confidence,
    ai_analyzed: true
  };
  
  slackData.push(newEntry);
  saveSlackEvidence(slackData);
  
  console.log(chalk.green(`✓ Added Slack evidence entry with ID: ${newEntry.id}`));
  console.log(chalk.cyan(`Description: ${analysis.description}`));
  console.log(chalk.cyan(`Matched Criteria: ${analysis.criteria_ids.join(', ')}`));
  console.log(chalk.cyan(`Confidence: ${analysis.confidence}%`));
  
  return newEntry.id;
}

// Organize evidence by criteria
function organizeEvidenceByCategory(processedPRs, slackEvidence, criteria) {
  const categories = {};
  
  // Initialize categories based on criteria structure
  criteria.forEach(criterion => {
    const category = criterion.area_of_concentration;
    const subarea = criterion.subarea;
    
    if (!categories[category]) {
      categories[category] = {};
    }
    
    if (!categories[category][subarea]) {
      categories[category][subarea] = [];
    }
    
    // Initialize criterion entry
    const criterionEntry = {
      id: criterion.criterion_id,
      description: criterion.description,
      pr_evidence: [],
      slack_evidence: []
    };
    
    categories[category][subarea].push(criterionEntry);
  });
  
  // Add PR evidence to appropriate categories
  Object.values(processedPRs).flat().forEach(pr => {
    if (pr.skipped || !pr.criteria_matches) return;
    
    pr.criteria_matches.forEach(match => {
      const criterion = criteria.find(c => c.criterion_id == match.criterion_id);
      if (!criterion) return;
      
      const category = criterion.area_of_concentration;
      const subarea = criterion.subarea;
      const criterionEntry = categories[category][subarea].find(c => c.id == match.criterion_id);
      
      if (criterionEntry) {
        criterionEntry.pr_evidence.push({
          type: 'PR',
          title: pr.pr_title,
          url: pr.pr_url,
          merged_at: pr.merged_at,
          confidence: match.confidence,
          explanation: match.explanation,
          components: pr.components || [],
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changed_files
        });
      }
    });
  });
  
  // Add Slack evidence to appropriate categories
  slackEvidence.forEach(slack => {
    slack.criteria_ids.forEach(criterionId => {
      const criterion = criteria.find(c => c.criterion_id == criterionId);
      if (!criterion) return;
      
      const category = criterion.area_of_concentration;
      const subarea = criterion.subarea;
      const criterionEntry = categories[category][subarea].find(c => c.id == criterionId);
      
      if (criterionEntry) {
        criterionEntry.slack_evidence.push({
          type: 'Slack',
          message: slack.message,
          link: slack.link,
          screenshot: slack.screenshot,
          description: slack.description,
          timestamp: slack.timestamp,
          confidence: slack.confidence
        });
      }
    });
  });
  
  return categories;
}

// Generate Google Drive friendly markdown
function generateGoogleDriveReport(categories, config) {
  let report = `# Performance Evidence Report - Google Drive Ready\n\n`;
  report += `*Generated on: ${new Date().toLocaleDateString()}*\n\n`;
  report += `---\n\n`;
  
  // Instructions for Google Drive
  report += `## How to Use This Report in Google Drive\n\n`;
  report += `1. **Copy & Paste**: Each section below can be copied directly into Google Docs\n`;
  report += `2. **Screenshots**: Slack screenshots are referenced by filename - upload them to Drive\n`;
  report += `3. **Links**: All PR and Slack links are preserved for easy access\n`;
  report += `4. **Formatting**: Markdown formatting will be preserved when pasted into Google Docs\n\n`;
  report += `---\n\n`;
  
  Object.keys(categories).forEach(categoryName => {
    report += `# ${categoryName}\n\n`;
    
    Object.keys(categories[categoryName]).forEach(subareaName => {
      report += `## ${subareaName}\n\n`;
      
      categories[categoryName][subareaName].forEach(criterion => {
        const totalEvidence = criterion.pr_evidence.length + criterion.slack_evidence.length;
        
        if (totalEvidence === 0) return; // Skip criteria with no evidence
        
        report += `### Criterion ${criterion.id}\n\n`;
        report += `**Description**: ${criterion.description}\n\n`;
        report += `**Total Evidence Items**: ${totalEvidence}\n\n`;
        
        // PR Evidence
        if (criterion.pr_evidence.length > 0) {
          report += `#### Pull Request Evidence (${criterion.pr_evidence.length} items)\n\n`;
          
          criterion.pr_evidence.forEach((pr, index) => {
            report += `**${index + 1}. ${pr.title}**\n`;
            report += `- **Link**: [View PR](${pr.url})\n`;
            report += `- **Merged**: ${new Date(pr.merged_at).toLocaleDateString()}\n`;
            report += `- **Confidence**: ${pr.confidence}%\n`;
            report += `- **Components**: ${pr.components.join(', ') || 'N/A'}\n`;
            report += `- **Changes**: +${pr.additions}/-${pr.deletions} lines, ${pr.changed_files} files\n`;
            report += `- **Evidence**: ${pr.explanation}\n\n`;
          });
        }
        
        // Slack Evidence
        if (criterion.slack_evidence.length > 0) {
          report += `#### Slack Evidence (${criterion.slack_evidence.length} items)\n\n`;
          
          criterion.slack_evidence.forEach((slack, index) => {
            report += `**${index + 1}. ${slack.description || 'Slack Message'}**\n`;
            report += `- **Date**: ${new Date(slack.timestamp).toLocaleDateString()}\n`;
            report += `- **Link**: [View in Slack](${slack.link})\n`;
            if (slack.confidence) {
              report += `- **AI Confidence**: ${slack.confidence}%\n`;
            }
            if (slack.screenshot) {
              report += `- **Screenshot**: ${slack.screenshot} *(Upload this file to Google Drive)*\n`;
            }
            report += `- **Message Content**:\n`;
            report += `  > ${slack.message.replace(/\n/g, '\n  > ')}\n\n`;
          });
        }
        
        report += `---\n\n`;
      });
    });
  });
  
  // Summary section
  report += `# Evidence Summary\n\n`;
  let totalPRs = 0;
  let totalSlack = 0;
  let coverageStats = {};
  
  Object.keys(categories).forEach(categoryName => {
    coverageStats[categoryName] = { criteria: 0, withEvidence: 0 };
    
    Object.keys(categories[categoryName]).forEach(subareaName => {
      categories[categoryName][subareaName].forEach(criterion => {
        coverageStats[categoryName].criteria++;
        const hasEvidence = criterion.pr_evidence.length > 0 || criterion.slack_evidence.length > 0;
        if (hasEvidence) {
          coverageStats[categoryName].withEvidence++;
        }
        totalPRs += criterion.pr_evidence.length;
        totalSlack += criterion.slack_evidence.length;
      });
    });
  });
  
  report += `## Overall Statistics\n\n`;
  report += `- **Total PR Evidence**: ${totalPRs} items\n`;
  report += `- **Total Slack Evidence**: ${totalSlack} items\n`;
  report += `- **Total Evidence Items**: ${totalPRs + totalSlack}\n\n`;
  
  report += `## Coverage by Category\n\n`;
  Object.keys(coverageStats).forEach(category => {
    const stats = coverageStats[category];
    const percentage = Math.round((stats.withEvidence / stats.criteria) * 100);
    report += `- **${category}**: ${stats.withEvidence}/${stats.criteria} criteria (${percentage}%)\n`;
  });
  
  return report;
}

// Interactive CLI for adding Slack evidence
async function interactiveSlackEntry() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
  
  console.log(chalk.blue('\n=== Add Slack Evidence ===\n'));
  console.log(chalk.yellow('AI will automatically analyze your message to determine:'));
  console.log(chalk.yellow('- Brief description of the evidence'));
  console.log(chalk.yellow('- Which criteria it matches'));
  console.log(chalk.yellow('- Confidence score\n'));
  
  try {
    const message = await question('Slack message content: ');
    const link = await question('Slack message link: ');
    const screenshot = await question('Screenshot filename (optional): ');
    
    rl.close();
    
    const config = loadConfig();
    const criteria = loadCriteria();
    
    const entryId = await addSlackEvidence(message, link, screenshot, config, criteria);
    console.log(chalk.green(`Successfully added Slack evidence entry: ${entryId}`));
    
  } catch (error) {
    rl.close();
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--add-slack')) {
    await interactiveSlackEntry();
    return;
  }
  
  console.log(chalk.blue('Loading data...'));
  
  const config = loadConfig();
  const criteria = loadCriteria();
  const processedPRs = loadProcessedPRs();
  const slackEvidence = loadSlackEvidence();
  
  console.log(chalk.green(`✓ Loaded ${criteria.length} criteria`));
  console.log(chalk.green(`✓ Loaded ${Object.values(processedPRs).flat().length} PRs`));
  console.log(chalk.green(`✓ Loaded ${slackEvidence.length} Slack evidence items`));
  
  console.log(chalk.blue('Organizing evidence by category...'));
  const categories = organizeEvidenceByCategory(processedPRs, slackEvidence, criteria);
  
  console.log(chalk.blue('Generating Google Drive report...'));
  const report = generateGoogleDriveReport(categories, config);
  
  const outputFile = getTimestampedFilename('google_drive_evidence');
  fs.writeFileSync(outputFile, report);
  
  console.log(chalk.green(`✓ Google Drive evidence report generated: ${outputFile}`));
  console.log(chalk.yellow('\nNext steps:'));
  console.log('1. Open the generated report file');
  console.log('2. Copy sections directly into Google Docs');
  console.log('3. Upload any referenced screenshots to Google Drive');
  console.log('4. Use --add-slack flag to add Slack evidence before regenerating');
}

// Handle command line arguments
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  });
}

module.exports = {
  addSlackEvidence,
  organizeEvidenceByCategory,
  generateGoogleDriveReport,
  analyzeSlackMessage
};