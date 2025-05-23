#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');
const JiraClient = require('jira-client');

// Paths
const PROCESSED_PATH = path.join(__dirname, '..', 'data', 'processed-prs.json');
const CRITERIA_PATH = path.join(__dirname, '..', 'criteria.csv');
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

// Load config and get user context
function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`Error: Missing config.json. Please copy config.example.json to config.json and update it.`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Load processed PRs
function loadProcessedPRs() {
  if (!fs.existsSync(PROCESSED_PATH)) {
    console.error(chalk.red(`Error: File not found at ${PROCESSED_PATH}`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
}

// Load criteria for lookup
function loadCriteria() {
  const csv = fs.readFileSync(CRITERIA_PATH, 'utf8');
  const lines = csv.split('\n').filter(line => line.trim());
  
  // Skip header
  const criteriaLines = lines.slice(1);
  
  const criteria = {};
  for (const line of criteriaLines) {
    // Handle quoted fields correctly
    let fields = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Add the last field
    fields.push(currentField);
    
    if (fields.length >= 4) {
      const [id, area, subarea, description] = fields;
      criteria[id] = { id, area, subarea, description };
    }
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

// Analyze criteria coverage and generate goals
async function generateGoals(grouped, config) {
  const reportFilename = getTimestampedFilename('goals');
  let markdownContent = '# SMART GOALS FOR NEXT YEAR\n\n';
  
  console.log(chalk.blue('Analyzing PR data and generating SMART goals...'));
  
  const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });
  
  // Sort all criteria by ID (numerically)
  const sortedCriteria = Object.values(grouped)
    .sort((a, b) => a.order - b.order);
  
  // Find criteria with no or low evidence
  const criteriaWithNoEvidence = sortedCriteria.filter(c => c.count === 0);
  const criteriaWithLowEvidence = sortedCriteria.filter(c => c.count > 0 && c.count < 3);
  
  // Find criteria with high evidence (strengths)
  const criteriaWithHighEvidence = sortedCriteria
    .filter(c => c.count >= 5)
    .sort((a, b) => {
      // Sort by average confidence
      const avgConfA = a.count ? Math.round(a.totalConfidence / a.count) : 0;
      const avgConfB = b.count ? Math.round(b.totalConfidence / b.count) : 0;
      return avgConfB - avgConfA;
    })
    .slice(0, 5); // Top 5 strengths
  
  // Prepare data for Claude
  const noEvidenceText = criteriaWithNoEvidence.map(c => 
    `${c.id}: [${c.area} > ${c.subarea}] ${c.description}`
  ).join('\n\n');
  
  const lowEvidenceText = criteriaWithLowEvidence.map(c => {
    const avgConfidence = c.count ? Math.round(c.totalConfidence / c.count) : 0;
    return `${c.id}: [${c.area} > ${c.subarea}] ${c.description} (${c.count} PRs, Avg Confidence: ${avgConfidence}%)`;
  }).join('\n\n');
  
  const strengthsText = criteriaWithHighEvidence.map(c => {
    const avgConfidence = c.count ? Math.round(c.totalConfidence / c.count) : 0;
    return `${c.id}: [${c.area} > ${c.subarea}] ${c.description} (${c.count} PRs, Avg Confidence: ${avgConfidence}%)`;
  }).join('\n\n');
  
  // Generate summary of all PRs for context
  const prSummary = [];
  Object.entries(loadProcessedPRs()).forEach(([repo, prs]) => {
    prs.forEach(pr => {
      if (!pr.skipped) {
        prSummary.push(`${repo}#${pr.pr_number}: ${pr.pr_title}`);
      }
    });
  });
  
  // Get user context from config
  const userContext = config.user_context || 'I am a senior developer content in my job with a great manager that supports me.';
  
  // Get future Jira tickets if available
  let futureTicketsText = 'No future tickets available.';
  if (config.jiraTickets && config.jiraTickets.length > 0) {
    futureTicketsText = config.jiraTickets.map(ticket => {
      return `${ticket.key}: ${ticket.summary} (${ticket.status})`;
    }).join('\n');
  }
  
  // Build the prompt
  const prompt = `You are an expert at creating SMART goals for software engineers. The developer has the following context:

${userContext}

Based on the following evidence from GitHub pull requests and upcoming Jira tickets, create SMART goals for the next performance period.

CRITERIA WITH NO EVIDENCE (areas for potential growth):
${noEvidenceText}

CRITERIA WITH LOW EVIDENCE (areas for improvement):
${lowEvidenceText}

STRENGTHS (areas with strong evidence):
${strengthsText}

RECENT WORK SUMMARY:
${prSummary.slice(0, 20).join('\n')}

UPCOMING JIRA TICKETS (future work):
${futureTicketsText}

For each goal:
1. Make it specific and clear what success looks like
2. Include how it will be measured
3. Ensure it's achievable but stretching
4. Make it relevant to both the engineer's growth and the organization's needs
5. Include a timeframe (typically within the next 6-12 months)

Format each goal as:

## Goal Title
**SMART Goal:** [The complete goal statement]
**Success Criteria:** [How to know when this goal is achieved]
**Alignment:** [How this goal aligns with career growth and organizational needs]
**Timeline:** [When this should be completed by]`;
  
  try {
    console.log(chalk.yellow('Generating SMART goals...'));
    
    const completion = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const goals = completion.content[0].text.trim();
    
    console.log(chalk.green('\nSMART Goals Generated:'));
    console.log(goals);
    
    markdownContent += goals + '\n';
    
    // Save report to file
    fs.writeFileSync(reportFilename, markdownContent);
    console.log(chalk.green(`\nGoals saved to: ${reportFilename}`));
  } catch (error) {
    console.error(chalk.red(`Error generating goals: ${error.message}`));
  }
}

// Fetch future Jira tickets
async function fetchFutureJiraTickets(config) {
  if (!config.jira_host || !config.jira_email || !config.jira_api_token || !config.jira_projects) {
    console.log(chalk.yellow('Jira configuration incomplete. Skipping Jira ticket fetch.'));
    return [];
  }

  try {
    console.log(chalk.blue('Initializing Jira client...'));
    const jira = new JiraClient({
      protocol: 'https',
      host: config.jira_host.replace(/^https?:\/\//, ''),
      username: config.jira_email,
      password: config.jira_api_token,
      apiVersion: '2',
      strictSSL: true
    });

    const projectKeys = config.jira_projects.join(',');
    
    // JQL query to find future work tickets that aren't actively being worked on
    // This works with standard Jira workflows and custom ones
    const jql = `project in (${projectKeys}) AND status not in ("In Progress", "In Review", "In Testing", Done, Closed, Resolved) ORDER BY priority DESC, updated DESC`;
    
    console.log(chalk.blue(`Fetching future tickets with JQL: ${jql}`));
    const issues = await jira.searchJira(jql, { maxResults: 20 });
    
    console.log(chalk.green(`Found ${issues.issues.length} future tickets`));
    
    return issues.issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name || 'Unknown',
      description: issue.fields.description || ''
    }));
  } catch (error) {
    console.error(chalk.red(`Error fetching Jira tickets: ${error.message}`));
    return [];
  }
}

// Main function
async function main() {
  try {
    console.log(chalk.bold('Loading data...'));
    
    // Load config for API key and user context
    const config = loadConfig();
    if (!config.anthropic_api_key) {
      throw new Error('Missing anthropic_api_key in config.json');
    }
    
    // Log user context if available
    if (config.user_context) {
      console.log(chalk.bold.blue('\nContext:'));
      console.log(chalk.italic(config.user_context));
      console.log();
    }
    
    // Fetch future Jira tickets
    console.log(chalk.bold('Fetching future Jira tickets...'));
    const jiraTickets = await fetchFutureJiraTickets(config);
    config.jiraTickets = jiraTickets;
    
    const processedPRs = loadProcessedPRs();
    const criteria = loadCriteria();
    const grouped = groupByCriterion(processedPRs, criteria);
    
    await generateGoals(grouped, config);
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
