#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');

// Paths
const PROCESSED_PATH = path.join(__dirname, '..', 'data', 'processed-prs.json');
const CRITERIA_PATH = path.join(__dirname, '..', 'criteria.csv');
const LATTICE_DIR = path.join(__dirname, '..', 'lattice');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
// We'll dynamically find all review files in the lattice directory

// Claude model will be loaded from config
let CLAUDE_MODEL = 'claude-4-opus'; // Default model

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

// Function to find all review files in the lattice directory
function findReviewFiles() {
  const reviewFiles = {
    goals: [],
    managerReviews: [],
    employeeReviews: []
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
      
      // Check for goals file
      if (files.includes('goals.md')) {
        reviewFiles.goals.push({
          path: path.join(dirPath, 'goals.md'),
          dir,
          weight
        });
      }
      
      // Check for manager review files
      const managerFiles = files.filter(f => f === 'manager-review.md' || f === 'manager.md');
      managerFiles.forEach(file => {
        reviewFiles.managerReviews.push({
          path: path.join(dirPath, file),
          dir,
          weight
        });
      });
      
      // Check for employee review files
      const employeeFiles = files.filter(f => f === 'employee-review.md' || f === 'employee.md');
      employeeFiles.forEach(file => {
        reviewFiles.employeeReviews.push({
          path: path.join(dirPath, file),
          dir,
          weight
        });
      });
    });
    
    // Sort all files by weight (descending)
    reviewFiles.goals.sort((a, b) => b.weight - a.weight);
    reviewFiles.managerReviews.sort((a, b) => b.weight - a.weight);
    reviewFiles.employeeReviews.sort((a, b) => b.weight - a.weight);
    
    return reviewFiles;
  } catch (error) {
    console.error(`Error finding review files: ${error.message}`);
    return reviewFiles;
  }
}

// Load goals from markdown files, prioritizing the most recent
function loadGoals() {
  const reviewFiles = findReviewFiles();
  if (reviewFiles.goals.length === 0) {
    console.error(chalk.red(`Error: No goals files found in the lattice directory`));
    process.exit(1);
  }
  
  // Use the most recent goals file
  const mostRecentGoals = reviewFiles.goals[0];
  console.log(chalk.blue(`Using goals from: ${mostRecentGoals.dir}`));
  return fs.readFileSync(mostRecentGoals.path, 'utf8');
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

// Get recent PRs for a specific goal
function getPRsForGoal(grouped, goalKeywords) {
  const relevantPRs = [];
  
  Object.values(grouped).forEach(criterion => {
    // Skip criteria with no evidence
    if (criterion.count === 0) return;
    
    // Check if criterion is relevant to the goal
    const criterionText = `${criterion.area} ${criterion.subarea} ${criterion.description}`.toLowerCase();
    const isRelevant = goalKeywords.some(keyword => criterionText.includes(keyword.toLowerCase()));
    
    if (isRelevant) {
      criterion.evidence.forEach(evidence => {
        relevantPRs.push({
          criterion: criterion.id,
          criterionArea: criterion.area,
          criterionSubarea: criterion.subarea,
          repo: evidence.repo,
          pr_number: evidence.pr_number,
          pr_title: evidence.pr_title,
          confidence: evidence.confidence,
          evidence: evidence.evidence
        });
      });
    }
  });
  
  // Sort by confidence
  return relevantPRs.sort((a, b) => b.confidence - a.confidence);
}

// Generate progress report for a specific goal
async function generateGoalProgress(goalTitle, goalDescription, keyResults, relevantPRs, config) {
  try {
    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });
    
    // Get user context
    const userContext = config.user_context || 'I am a senior developer content in my job with a great manager that supports me.';
    
    // Format PRs for the prompt
    const prText = relevantPRs.map(pr => 
      `PR: ${pr.repo}#${pr.pr_number} - ${pr.pr_title}\n` +
      `Criterion: ${pr.criterion}: [${pr.criterionArea} > ${pr.criterionSubarea}]\n` +
      `Confidence: ${pr.confidence}%\n` +
      `Evidence: ${pr.evidence}`
    ).join('\n\n');
    
    // Format key results
    const keyResultsText = keyResults.map(kr => `- ${kr}`).join('\n');
    
    // Create the prompt
    const prompt = `You are an expert at evaluating progress on performance goals. The developer has the following context:

${userContext}

I need to evaluate progress on the following goal:

## ${goalTitle}
${goalDescription}

Key Results:
${keyResultsText}

The following PRs and evidence are relevant to this goal:

${prText}

Based on this evidence, please:
1. Estimate a progress percentage (0-100%) for this goal
2. Provide 3-5 specific accomplishments that demonstrate progress
3. Identify any areas where more work is needed
4. Suggest next steps to complete the goal

For soft skills like communication, feedback, and collaboration, you can assume they are being successfully implemented.

Format your response in markdown with clear sections for Progress, Accomplishments, Areas for Improvement, and Next Steps.`;

    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });
    
    return completion.content[0].text.trim();
  } catch (error) {
    console.error(chalk.red(`Error generating progress for goal "${goalTitle}": ${error.message}`));
    return `## ${goalTitle}\n\nError generating progress report: ${error.message}`;
  }
}

// Parse goals from markdown
function parseGoals(goalsMarkdown) {
  const goals = [];
  let currentGoal = null;
  let currentKeyResults = [];
  
  const lines = goalsMarkdown.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Main goal (level 2 heading)
    if (line.startsWith('## ')) {
      // Save previous goal if exists
      if (currentGoal) {
        goals.push({
          title: currentGoal,
          keyResults: [...currentKeyResults],
          description: '' // We'll extract this from the next lines
        });
        currentKeyResults = [];
      }
      
      currentGoal = line.substring(3).trim();
      
      // Look for description in the next lines
      let description = '';
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('##') && !lines[j].startsWith('### ')) {
        if (lines[j].trim() && !lines[j].includes('Status:') && !lines[j].includes('Due Date:')) {
          description += lines[j].trim() + ' ';
        }
        j++;
      }
      
      // Update the last goal with description
      if (goals.length > 0) {
        goals[goals.length - 1].description = description.trim();
      }
    }
    
    // Key result (bullet point under "Key Results:" section)
    if (line.startsWith('1. **') || line.startsWith('2. **') || line.startsWith('3. **')) {
      const keyResult = line.substring(line.indexOf('**') + 2);
      const endIndex = keyResult.indexOf('**');
      if (endIndex > 0) {
        currentKeyResults.push(keyResult.substring(0, endIndex).trim());
      }
    }
  }
  
  // Add the last goal
  if (currentGoal) {
    goals.push({
      title: currentGoal,
      keyResults: currentKeyResults,
      description: '' // Already set above
    });
  }
  
  return goals;
}

// Define keywords for each goal
const goalKeywords = {
  'Productivity and Results Delivery': ['productivity', 'delivery', 'deadline', 'task', 'project', 'complete', 'communication', 'progress', 'challenge', 'success'],
  'Cross-Team Collaboration': ['collaboration', 'team', 'feedback', 'communicate', 'initiative', 'project', 'participate', 'cross-team', 'work with'],
  'Data Seeding Optimization and Best Practices': ['data', 'seed', 'test', 'optimization', 'performance', 'documentation', 'guide', 'best practice', 'efficiency']
};

// Generate progress report for all goals
async function generateGoalsProgressReport(grouped, config) {
  const reportFilename = getTimestampedFilename('goals_progress');
  let markdownContent = '# Goals Progress Report\n\n';
  markdownContent += `Generated on: ${new Date().toISOString().split('T')[0]}\n\n`;
  
  console.log(chalk.bold.blue('\n=== GOALS PROGRESS REPORT ===\n'));
  
  // Parse goals from markdown
  const goalsMarkdown = loadGoals();
  const goals = parseGoals(goalsMarkdown);
  
  // Generate progress for each goal
  for (const goal of goals) {
    console.log(chalk.yellow(`Processing goal: ${goal.title}...`));
    
    // Get relevant PRs for this goal
    const keywords = goalKeywords[goal.title] || [];
    const relevantPRs = getPRsForGoal(grouped, keywords);
    
    // Generate progress report
    const progressReport = await generateGoalProgress(
      goal.title, 
      goal.description, 
      goal.keyResults, 
      relevantPRs, 
      config
    );
    
    console.log(chalk.green(`Completed progress report for: ${goal.title}`));
    
    // Add to markdown content
    markdownContent += progressReport + '\n\n---\n\n';
  }
  
  // Save report to file
  fs.writeFileSync(reportFilename, markdownContent);
  console.log(chalk.green(`\nGoals Progress Report saved to: ${reportFilename}`));
  
  return reportFilename;
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
    
    const processedPRs = loadProcessedPRs();
    const criteria = loadCriteria();
    const grouped = groupByCriterion(processedPRs, criteria);
    
    // Generate goals progress report
    const reportPath = await generateGoalsProgressReport(grouped, config);
    console.log(chalk.green(`\nYour goals progress report has been saved to: ${reportPath}`));
    
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
