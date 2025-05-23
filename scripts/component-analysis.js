const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');
const { Octokit } = require('octokit');

// Paths
const PROCESSED_PATH = path.join(__dirname, '..', 'data', 'processed-prs.json');
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Load config
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(chalk.red(`Error: Config file not found at ${CONFIG_PATH}`));
      process.exit(1);
    }
    
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config;
  } catch (error) {
    console.error(chalk.red(`Error loading config: ${error.message}`));
    process.exit(1);
  }
}

// Load processed PRs
function loadProcessedPRs() {
  try {
    if (!fs.existsSync(PROCESSED_PATH)) {
      console.error(chalk.red(`Error: File not found at ${PROCESSED_PATH}`));
      process.exit(1);
    }
    
    const processedPRs = JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
    return processedPRs;
  } catch (error) {
    console.error(chalk.red(`Error loading processed PRs: ${error.message}`));
    process.exit(1);
  }
}

function analyzeComponents(processedPRs) {
  console.log(chalk.blue('Analyzing components from PRs...'));
  
  // Track components across all repos
  const componentData = {};
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  // Process all repos and PRs
  Object.entries(processedPRs).forEach(([repoFullName, prs]) => {
    prs.forEach(pr => {
      // Skip PRs that were skipped or don't have components data
      if (pr.skipped || !pr.components) return;
      
      // Skip PRs older than 12 months
      const mergedAt = new Date(pr.merged_at);
      if (mergedAt < oneYearAgo) return;
      
      // Process each component in this PR
      pr.components.forEach(component => {
        const componentName = component.name;
        
        // Initialize component data if not exists
        if (!componentData[componentName]) {
          componentData[componentName] = {
            name: componentName,
            pr_count: 0,
            total_changes: 0,
            additions: 0,
            deletions: 0,
            repos: new Set(),
            paths: new Set(), // Track all paths associated with this component
            pr_numbers: [],
            pr_titles: [],
            jira_keys: new Set(),
            jira_types: new Set(),
            avg_duration: 0,
            total_duration: 0,
            first_contribution: new Date(),
            last_contribution: new Date(0),
            criteria_matched: {},
          };
        }
        
        // Update component metrics
        const compData = componentData[componentName];
        compData.pr_count++;
        compData.repos.add(repoFullName);
        compData.pr_numbers.push(pr.pr_number);
        compData.pr_titles.push(pr.pr_title);
        
        // Track the path for this component
        if (component.path) {
          compData.paths.add(component.path);
        }
        
        if (pr.jira_key) compData.jira_keys.add(pr.jira_key);
        if (pr.jira_type) compData.jira_types.add(pr.jira_type);
        
        // Update changes
        if (pr.additions) compData.additions += pr.additions;
        if (pr.deletions) compData.deletions += pr.deletions;
        compData.total_changes += (pr.additions || 0) + (pr.deletions || 0);
        
        // Update duration
        if (pr.duration_days) {
          compData.total_duration += pr.duration_days;
        }
        
        // Update first/last contribution dates
        if (mergedAt < compData.first_contribution) {
          compData.first_contribution = mergedAt;
        }
        if (mergedAt > compData.last_contribution) {
          compData.last_contribution = mergedAt;
        }
      });
    });
  });
  
  // Calculate averages and determine roles
  Object.values(componentData).forEach(comp => {
    // Calculate average PR duration
    comp.avg_duration = comp.total_duration / comp.pr_count;
    
    // Determine role based on criteria
    determineComponentRole(comp);
  });
  
  return componentData;
}

function determineComponentRole(comp) {
  // Define criteria for different roles
  const criteria = {
    lead: {
      min_prs: 5,
      min_changes: 1000,
      min_duration_days: 90,
    },
    significant: {
      min_prs: 3,
      min_changes: 500,
      min_duration_days: 30,
    },
    support: {
      min_prs: 1,
      min_changes: 100,
      min_duration_days: 0,
    }
  };
  
  // Check which criteria are met
  const durationDays = (comp.last_contribution - comp.first_contribution) / (1000 * 60 * 60 * 24);
  
  comp.criteria_matched = {
    lead: {
      min_prs: comp.pr_count >= criteria.lead.min_prs,
      min_changes: comp.total_changes >= criteria.lead.min_changes,
      min_duration_days: durationDays >= criteria.lead.min_duration_days,
    },
    significant: {
      min_prs: comp.pr_count >= criteria.significant.min_prs,
      min_changes: comp.total_changes >= criteria.significant.min_changes,
      min_duration_days: durationDays >= criteria.significant.min_duration_days,
    },
    support: {
      min_prs: comp.pr_count >= criteria.support.min_prs,
      min_changes: comp.total_changes >= criteria.support.min_changes,
      min_duration_days: durationDays >= criteria.support.min_duration_days,
    }
  };
  
  // Determine role based on criteria
  if (comp.criteria_matched.lead.min_prs && 
      comp.criteria_matched.lead.min_changes && 
      comp.criteria_matched.lead.min_duration_days) {
    comp.role = 'Lead';
  } else if (comp.criteria_matched.significant.min_prs && 
             comp.criteria_matched.significant.min_changes && 
             comp.criteria_matched.significant.min_duration_days) {
    comp.role = 'Significant Contributor';
  } else if (comp.criteria_matched.support.min_prs && 
             comp.criteria_matched.support.min_changes) {
    comp.role = 'Support';
  } else {
    comp.role = 'Minor Contributor';
  }
}

// Generate GitHub contributor section for markdown report
function generateGitHubContributorSection(comp) {
  let markdownContent = '';
  
  if (comp.github_contributors) {
    markdownContent += `**GitHub Contributors:**\n`;
    
    // Add lead contributor if identified
    if (comp.github_contributors.lead) {
      const lead = comp.github_contributors.lead;
      markdownContent += `- **Lead Contributor:** ${lead.login} (${lead.commits} commits, active ${lead.first_commit.toISOString().split('T')[0]} to ${lead.last_commit.toISOString().split('T')[0]})\n`;
      
      // Add paths the lead has worked on
      if (lead.paths && lead.paths.length > 0) {
        markdownContent += `  - **Domains:** ${lead.paths.join(', ')}\n`;
      }
    } else {
      markdownContent += `- **Lead Contributor:** No clear lead identified\n`;
    }
    
    // Add top contributors (up to 5)
    markdownContent += `- **Top Contributors:**\n`;
    comp.github_contributors.all.slice(0, 5).forEach(contributor => {
      markdownContent += `  - ${contributor.login}: ${contributor.commits} commits`;
      
      // Show domains for each contributor
      if (contributor.paths && contributor.paths.length > 0) {
        // Limit to 3 paths to avoid clutter
        const pathsToShow = contributor.paths.slice(0, 3);
        if (pathsToShow.length === contributor.paths.length) {
          markdownContent += ` (${pathsToShow.join(', ')})\n`;
        } else {
          markdownContent += ` (${pathsToShow.join(', ')} and ${contributor.paths.length - 3} more)\n`;
        }
      } else {
        markdownContent += `\n`;
      }
    });
    markdownContent += `\n`;
  }
  
  return markdownContent;
}

async function generateComponentReport(componentData, config) {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const reportFilename = path.join(REPORTS_DIR, `component_analysis_${timestamp}.md`);
  
  // Count components by role
  const roleCounts = {
    Lead: 0,
    'Significant Contributor': 0,
    Support: 0,
    'Minor Contributor': 0,
  };
  
  Object.values(componentData).forEach(comp => {
    roleCounts[comp.role]++;
  });
  
  // Start building markdown content
  let markdownContent = `# Component Analysis Report\n\n`;
  markdownContent += `*Generated on ${new Date().toISOString().split('T')[0]}*\n\n`;
  
  // Add summary
  markdownContent += `## Summary\n\n`;
  markdownContent += `Total components contributed to: ${Object.keys(componentData).length}\n\n`;
  markdownContent += `- Lead role: ${roleCounts.Lead} components\n`;
  markdownContent += `- Significant contributor: ${roleCounts['Significant Contributor']} components\n`;
  markdownContent += `- Support role: ${roleCounts.Support} components\n`;
  
  // Add component table
  markdownContent += `\n## Top Components\n\n`;
  markdownContent += `| Component | Role | PRs | Changes | Avg Duration (days) | First Contribution | Last Contribution |\n`;
  markdownContent += `|-----------|------|-----|---------|---------------------|-------------------|-------------------|\n`;
  
  // Sort components by total changes
  const sortedComponents = Object.values(componentData)
    .sort((a, b) => b.total_changes - a.total_changes)
    .slice(0, 10); // Top 10 components
  
  sortedComponents.forEach(comp => {
    markdownContent += `| ${comp.name} | ${comp.role} | ${comp.pr_count} | ${comp.total_changes.toLocaleString()} | ${comp.avg_duration.toFixed(1)} | ${comp.first_contribution.toISOString().split('T')[0]} | ${comp.last_contribution.toISOString().split('T')[0]} |\n`;
  });
  
  // Add detailed analysis for significant components
  markdownContent += `\n## Detailed Component Analysis\n\n`;
  
  // Get significant components (Lead or Significant Contributor)
  const significantComponents = Object.values(componentData)
    .filter(comp => comp.role === 'Lead' || comp.role === 'Significant Contributor')
    .sort((a, b) => b.total_changes - a.total_changes);
  
  console.log(chalk.blue(`Generating AI analysis for ${significantComponents.length} significant components...`));
  
  // Create Anthropic client if API key is available
  let anthropic = null;
  if (config.anthropic_api_key) {
    anthropic = new Anthropic({
      apiKey: config.anthropic_api_key,
    });
  }
  
  // Generate detailed analysis for each significant component
  for (const comp of significantComponents) {
    try {
      // Generate AI analysis if API key is available
      let analysis = '';
      if (anthropic) {
        const prompt = `
You are analyzing a software engineer's contributions to a specific component or domain in a codebase.
Please provide a brief analysis (3-4 sentences) of their role and impact based on the following data:

Component name: ${comp.name}
Role: ${comp.role}
Number of PRs: ${comp.pr_count}
Total code changes: ${comp.total_changes.toLocaleString()} lines
Average PR duration: ${comp.avg_duration.toFixed(1)} days
Active period: ${comp.first_contribution.toISOString().split('T')[0]} to ${comp.last_contribution.toISOString().split('T')[0]}

Recent PR titles:
${comp.pr_titles.slice(0, 5).map(title => `- ${title}`).join('\n')}

Focus on:
1. The engineer's level of ownership and expertise in this component
2. The nature of their contributions (features, bugs, maintenance)
3. The impact and significance of their work
4. Any patterns or trends in their contributions
`;
        
        const completion = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }]
        });
        
        analysis = completion.content[0].text.trim();
      } else {
        analysis = 'AI analysis not available (Anthropic API key not configured).';
      }
      
      // Add to markdown
      markdownContent += `### ${comp.name} (${comp.role})\n\n`;
      markdownContent += `**Metrics:**\n`;
      markdownContent += `- PRs: ${comp.pr_count}\n`;
      markdownContent += `- Total Changes: ${comp.total_changes.toLocaleString()} lines\n`;
      markdownContent += `- Average PR Duration: ${comp.avg_duration.toFixed(1)} days\n`;
      markdownContent += `- Active Period: ${comp.first_contribution.toISOString().split('T')[0]} to ${comp.last_contribution.toISOString().split('T')[0]}\n\n`;
      
      // Add GitHub contributor information
      markdownContent += generateGitHubContributorSection(comp);
      
      markdownContent += `**Analysis:**\n${analysis}\n\n`;
      
      markdownContent += `**Recent PRs:**\n`;
      comp.pr_titles.slice(0, 5).forEach((title, i) => {
        markdownContent += `- ${title} (#${comp.pr_numbers[i]})\n`;
      });
      
      markdownContent += `\n---\n\n`;
    } catch (error) {
      console.error(chalk.red(`Error generating analysis for ${comp.name}: ${error.message}`));
      
      // Add basic info without AI analysis
      markdownContent += `### ${comp.name} (${comp.role})\n\n`;
      markdownContent += `**Metrics:**\n`;
      markdownContent += `- PRs: ${comp.pr_count}\n`;
      markdownContent += `- Total Changes: ${comp.total_changes.toLocaleString()} lines\n`;
      markdownContent += `- Average PR Duration: ${comp.avg_duration.toFixed(1)} days\n`;
      markdownContent += `- Active Period: ${comp.first_contribution.toISOString().split('T')[0]} to ${comp.last_contribution.toISOString().split('T')[0]}\n\n`;
      
      // Add GitHub contributor information
      markdownContent += generateGitHubContributorSection(comp);
      
      markdownContent += `**Recent PRs:**\n`;
      comp.pr_titles.slice(0, 5).forEach((title, i) => {
        markdownContent += `- ${title} (#${comp.pr_numbers[i]})\n`;
      });
      
      markdownContent += `\n---\n\n`;
    }
  }
  
  // Write report to file
  fs.writeFileSync(reportFilename, markdownContent);
  console.log(chalk.green(`Component analysis report saved to: ${reportFilename}`));
  
  return reportFilename;
}

// Get component contributors from GitHub
async function getComponentContributors(componentName, componentPaths, repos, config) {
  if (!config.github_token) {
    console.log(chalk.yellow('No GitHub token found, skipping contributor analysis'));
    return null;
  }
  
  try {
    const octokit = new Octokit({ auth: config.github_token });
    const contributors = {};
    
    for (const repoFullName of repos) {
      const [owner, repo] = repoFullName.split('/');
      
      console.log(chalk.dim(`Analyzing contributors for ${componentName} in ${repoFullName}...`));
      
      // For each path associated with this component
      for (const path of componentPaths) {
        console.log(chalk.dim(`Checking path: ${path} in ${repoFullName}...`));
        
        // Get commits for files in this component path
        // We'll use the GitHub search API to find commits touching files in this component path
        const searchQuery = `repo:${repoFullName} path:${path} type:commit`;
        
        try {
          // Search for commits
          const commits = await octokit.paginate(octokit.rest.search.commits, {
            q: searchQuery,
            per_page: 100,
          }, response => response.data);
          
          console.log(chalk.dim(`Found ${commits.length} commits for path ${path} in ${repoFullName}`));
          
          // Process each commit
          for (const commit of commits) {
            const author = commit.author ? commit.author.login : (commit.commit.author ? commit.commit.author.name : 'Unknown');
            
            if (!contributors[author]) {
              contributors[author] = {
                login: author,
                commits: 0,
                paths: new Set(),
                first_commit: new Date(),
                last_commit: new Date(0),
              };
            }
            
            contributors[author].commits++;
            contributors[author].paths.add(path);
            
            const commitDate = new Date(commit.commit.author.date);
            if (commitDate < contributors[author].first_commit) {
              contributors[author].first_commit = commitDate;
            }
            if (commitDate > contributors[author].last_commit) {
              contributors[author].last_commit = commitDate;
            }
          }
        } catch (error) {
          console.error(chalk.red(`Error searching commits for path ${path} in ${repoFullName}: ${error.message}`));
        }
      }
    }
    
    // Convert to array and sort by commit count
    const contributorsArray = Object.values(contributors)
      .map(contributor => ({
        ...contributor,
        paths: Array.from(contributor.paths)
      }))
      .sort((a, b) => b.commits - a.commits);
    
    // Determine the lead contributor
    let lead = null;
    if (contributorsArray.length > 0) {
      lead = contributorsArray[0];
      
      // Check if the lead has significantly more commits
      if (contributorsArray.length > 1) {
        const leadCommits = lead.commits;
        const secondCommits = contributorsArray[1].commits;
        
        // If the lead doesn't have at least 30% more commits than the second contributor,
        // and has been active for at least 60 days, consider them the lead
        if (leadCommits < secondCommits * 1.3) {
          const leadDuration = (lead.last_commit - lead.first_commit) / (1000 * 60 * 60 * 24);
          if (leadDuration < 60) {
            lead = null; // No clear lead
          }
        }
      }
    }
    
    return {
      all: contributorsArray,
      lead: lead
    };
  } catch (error) {
    console.error(chalk.red(`Error getting contributors for ${componentName}: ${error.message}`));
    return null;
  }
}

// Main function
async function main() {
  try {
    console.log(chalk.bold('Loading data...'));
    
    // Load config for API key
    const config = loadConfig();
    
    // Load processed PRs
    const processedPRs = loadProcessedPRs();
    
    // Analyze components
    const componentData = analyzeComponents(processedPRs);
    
    // Convert Sets to Arrays for all components
    Object.values(componentData).forEach(comp => {
      comp.repos = Array.from(comp.repos);
      comp.paths = Array.from(comp.paths);
      comp.jira_keys = Array.from(comp.jira_keys);
      comp.jira_types = Array.from(comp.jira_types);
    });
    
    // Get GitHub contributors for significant components
    const significantComponents = Object.values(componentData)
      .filter(c => c.role === 'Lead' || c.role === 'Significant Contributor');
    
    if (significantComponents.length > 0 && config.github_token) {
      console.log(chalk.blue(`Getting GitHub contributor data for ${significantComponents.length} significant components...`));
      
      for (const comp of significantComponents) {
        console.log(chalk.dim(`Getting contributors for ${comp.name}...`));
        comp.github_contributors = await getComponentContributors(comp.name, comp.paths, comp.repos, config);
      }
    }
    
    // Generate report
    await generateComponentReport(componentData, config);
    
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Run main function
main();
