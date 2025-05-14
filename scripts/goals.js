#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');

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
  
  const prompt = `You are an expert career coach helping to prepare SMART goals for the upcoming year based on a performance review. 

Below is a summary of the person's work from GitHub pull requests, categorized by criteria:

CRITERIA WITH NO EVIDENCE (areas for potential growth):
${noEvidenceText}

CRITERIA WITH LOW EVIDENCE (areas for improvement):
${lowEvidenceText}

STRENGTHS (areas with strong evidence):
${strengthsText}

RECENT WORK SUMMARY:
${prSummary.slice(0, 20).join('\n')}

Based on this information, create AT LEAST 10 SMART goals for the upcoming year. Each goal should:
1. Be Specific, Measurable, Achievable, Relevant, and Time-bound
2. Include 3-5 specific sub-tasks or milestones for each goal
3. Address both areas for growth and ways to leverage existing strengths
4. Be relevant to the person's role as a software engineer
5. Use direct, informal language with action verbs (no pronouns like "I" or "the engineer")

Format each goal as:
## Goal Title
Goal description that is SMART (specific, measurable, achievable, relevant, time-bound)

### Milestones:
- Milestone 1 with specific completion criteria and timeline
- Milestone 2 with specific completion criteria and timeline
- Milestone 3 with specific completion criteria and timeline

Make sure each goal and milestone is concrete, actionable, and has clear success criteria. Include a mix of technical and soft skills goals.`;
  
  try {
    console.log(chalk.yellow('Generating SMART goals...'));
    
    const completion = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
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

// Main function
async function main() {
  try {
    const processedPRs = loadProcessedPRs();
    const criteria = loadCriteria();
    const grouped = groupByCriterion(processedPRs, criteria);
    
    // Load config for API key
    const configPath = path.join(__dirname, '..', 'config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('Missing config.json');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (!config.anthropic_api_key) {
      throw new Error('Missing anthropic_api_key in config.json');
    }
    
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
