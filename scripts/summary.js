#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');

// Paths
const PROCESSED_PATH = path.join(__dirname, '..', 'data', 'processed-prs.json');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const LATTICE_DIR = path.join(__dirname, '..', 'lattice');

// Claude model will be loaded from config
let CLAUDE_MODEL = 'claude-opus-4-20250514'; // Default model

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

// Load config
function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`Error: Missing config.json. Please copy config.example.json to config.json and update it.`));
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Set Claude model from config if available
  if (config.claude_model) {
    CLAUDE_MODEL = config.claude_model;
    console.log(chalk.blue(`Using Claude model: ${CLAUDE_MODEL}`));
  }
  
  return config;
}

// Load processed PRs
function loadProcessedPRs() {
  if (!fs.existsSync(PROCESSED_PATH)) {
    console.error(chalk.red(`Error: File not found at ${PROCESSED_PATH}`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
}

// Find the most recent report of a specific type
function findLatestReport(prefix) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(file => file.startsWith(prefix) && file.endsWith('.md'))
    .map(file => ({
      name: file,
      path: path.join(REPORTS_DIR, file),
      time: fs.statSync(path.join(REPORTS_DIR, file)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);
  
  return files.length > 0 ? files[0].path : null;
}

// Extract key information from a report
function extractReportContent(reportPath, maxLength = 1000) {
  if (!reportPath || !fs.existsSync(reportPath)) return '';
  
  const content = fs.readFileSync(reportPath, 'utf8');
  // Extract the most important parts (first section and summaries)
  const sections = content.split('##');
  const intro = sections[0] || '';
  
  // Look for summary sections
  const summarySection = sections.find(section => 
    section.toLowerCase().includes('summary') || 
    section.toLowerCase().includes('overview') ||
    section.toLowerCase().includes('highlights')
  );
  
  let extractedContent = intro;
  if (summarySection) {
    extractedContent += '\n\n' + summarySection;
  }
  
  // Truncate if too long
  if (extractedContent.length > maxLength) {
    extractedContent = extractedContent.substring(0, maxLength) + '...';
  }
  
  return extractedContent;
}

// Generate a comprehensive summary
async function generateSummary() {
  try {
    console.log(chalk.blue('Generating comprehensive summary...'));
    
    // Load config for API key
    const config = loadConfig();
    
    // Load processed PRs
    const processedPRs = loadProcessedPRs();
    
    // Find latest reports
    const evidenceReportPath = findLatestReport('evidence_report');
    const enhancedReportPath = findLatestReport('enhanced_report');
    const aiSummaryPath = findLatestReport('ai_summary');
    const goalsPath = findLatestReport('goals');
    const componentAnalysisPath = findLatestReport('component_analysis');
    const capitalizationPath = findLatestReport('capitalization');
    
    // Extract content from reports
    const evidenceContent = extractReportContent(evidenceReportPath, 500);
    const enhancedContent = extractReportContent(enhancedReportPath, 500);
    const aiSummaryContent = extractReportContent(aiSummaryPath, 500);
    const goalsContent = extractReportContent(goalsPath, 500);
    const componentContent = extractReportContent(componentAnalysisPath, 500);
    const capitalizationContent = extractReportContent(capitalizationPath, 500);
    
    // Count PRs by repo for summary
    const prCountByRepo = {};
    Object.entries(processedPRs).forEach(([repo, prs]) => {
      prCountByRepo[repo] = prs.filter(pr => !pr.skipped).length;
    });
    
    // Create a summary of PR work
    const prSummary = Object.entries(prCountByRepo)
      .map(([repo, count]) => `${repo}: ${count} PRs`)
      .join('\n');
    
    // Create a list of PR titles for context (limited to 20)
    const prTitles = [];
    Object.entries(processedPRs).forEach(([repo, prs]) => {
      prs.filter(pr => !pr.skipped).forEach(pr => {
        prTitles.push(`${repo}#${pr.pr_number}: ${pr.pr_title}`);
      });
    });
    
    // Count PRs by month
    const prsByMonth = {};
    Object.entries(processedPRs).forEach(([repo, prs]) => {
      prs.filter(pr => !pr.skipped).forEach(pr => {
        const date = new Date(pr.merged_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!prsByMonth[monthKey]) {
          prsByMonth[monthKey] = 0;
        }
        prsByMonth[monthKey]++;
      });
    });
    
    // Sort months chronologically
    const sortedMonths = Object.entries(prsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => `${month}: ${count} PRs`)
      .join('\n');
    
    // Get user context
    const userContext = config.user_context || 'I am a senior developer content in my job with a great manager that supports me.';
    
    // Create prompt for Claude
    const prompt = `You are helping a software engineer create a concise summary of their performance based on various reports and data. The summary should be no more than 7 paragraphs or 1000 words, focusing on general sentiments while providing high-level examples from the data.

CONTEXT ABOUT THE ENGINEER:
${userContext}

PR WORK SUMMARY:
${prSummary}

PRs BY MONTH:
${sortedMonths}

EVIDENCE REPORT EXCERPTS:
${evidenceContent || 'No evidence report available'}

ENHANCED REPORT EXCERPTS:
${enhancedContent || 'No enhanced report available'}

AI SUMMARY EXCERPTS:
${aiSummaryContent || 'No AI summary available'}

GOALS EXCERPTS:
${goalsContent || 'No goals report available'}

COMPONENT ANALYSIS EXCERPTS:
${componentContent || 'No component analysis available'}

CAPITALIZATION REPORT EXCERPTS:
${capitalizationContent || 'No capitalization report available'}

RECENT PR TITLES (for context):
${prTitles.slice(0, 20).join('\n')}

Based on all this information, please write a comprehensive yet concise summary (no more than 7 paragraphs or 1000 words) that:
1. Highlights key accomplishments and contributions
2. Identifies patterns in the work (e.g., focus areas, types of tasks)
3. Notes growth areas and skill development
4. Mentions impact on projects and teams
5. Includes specific examples from the data where relevant
6. Summarizes component ownership and leadership
7. Provides a forward-looking conclusion with career direction

The summary should be written in first person as if the engineer is writing it themselves. Make it professional but conversational, suitable for a performance review.`;
    
    // Check if API key is available
    if (!config.anthropic_api_key) {
      console.error(chalk.red('Error: Missing Anthropic API key in config.json'));
      process.exit(1);
    }
    
    // Create Anthropic client
    const anthropic = new Anthropic({
      apiKey: config.anthropic_api_key,
    });
    
    // Generate summary with Claude
    console.log(chalk.yellow('Generating AI summary...'));
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const summary = completion.content[0].text.trim();
    
    // Create the report
    const reportFilename = getTimestampedFilename('comprehensive_summary');
    let markdownContent = `# Comprehensive Performance Summary\n\n`;
    markdownContent += `*Generated on ${new Date().toISOString().split('T')[0]}*\n\n`;
    markdownContent += summary;
    
    // Write report to file
    fs.writeFileSync(reportFilename, markdownContent);
    console.log(chalk.green(`Comprehensive summary saved to: ${reportFilename}`));
    
    return reportFilename;
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Main function
async function main() {
  try {
    await generateSummary();
  } catch (error) {
    console.error(chalk.red(`Unhandled error: ${error.message}`));
    process.exit(1);
  }
}

// Run the main function
main();
