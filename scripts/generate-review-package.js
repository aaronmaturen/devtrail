#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Define the scripts to run in order
const scripts = [
  { name: 'sync', description: 'Syncing PR data from GitHub and Jira' },
  { name: 'components', description: 'Analyzing component contributions and leadership' },
  { name: 'report', description: 'Generating detailed PR evidence report' },
  { name: 'report-enhanced', description: 'Generating enhanced report with PR and review data' },
  { name: 'summary', description: 'Generating AI summary report' },
  { name: 'goals', description: 'Generating SMART career goals' }
];

// Create a timestamp for the report
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const reportDir = path.join(__dirname, '..', 'reports');
const reportPath = path.join(reportDir, `review_package_${timestamp}.md`);

// Ensure reports directory exists
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

// Function to run a script and capture its output
function runScript(scriptName) {
  console.log(chalk.blue(`\n=== Running ${scriptName} ===`));
  
  try {
    const output = execSync(`npm run ${scriptName}`, { 
      cwd: path.join(__dirname, '..'),
      stdio: ['inherit', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    
    console.log(chalk.green(`✓ ${scriptName} completed successfully`));
    return { success: true, output };
  } catch (error) {
    console.error(chalk.red(`✗ ${scriptName} failed: ${error.message}`));
    return { success: false, output: error.message };
  }
}

// Function to extract report paths from script output
function extractReportPath(output) {
  const match = output.match(/saved to: (.+\.md)/);
  return match ? match[1].trim() : null;
}

// Main function to run all scripts
async function main() {
  console.log(chalk.bold.blue('=== Generating Complete Performance Review Package ===\n'));
  
  // Initialize the report content
  let packageReport = `# Performance Review Package\n\n`;
  packageReport += `*Generated on ${new Date().toISOString().split('T')[0]}*\n\n`;
  packageReport += `## Generated Reports\n\n`;
  
  // Run each script in sequence
  const results = [];
  
  for (const script of scripts) {
    console.log(chalk.yellow(`\nRunning: ${script.name} - ${script.description}...`));
    const result = runScript(script.name);
    
    // Extract report path if available
    const reportPath = extractReportPath(result.output);
    
    results.push({
      name: script.name,
      description: script.description,
      success: result.success,
      reportPath
    });
    
    // Add a small delay between scripts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Generate the package report
  packageReport += `| Script | Description | Status | Report |\n`;
  packageReport += `|--------|-------------|--------|--------|\n`;
  
  for (const result of results) {
    const status = result.success ? '✅ Success' : '❌ Failed';
    const report = result.reportPath ? `[View Report](${result.reportPath})` : 'No report generated';
    
    packageReport += `| ${result.name} | ${result.description} | ${status} | ${report} |\n`;
  }
  
  // Add instructions for interactive review
  packageReport += `\n## Next Steps\n\n`;
  packageReport += `To complete your performance review, run the interactive review script:\n\n`;
  packageReport += `\`\`\`bash\nnode scripts/interactive-review.js\n\`\`\`\n\n`;
  packageReport += `This will guide you through a structured review process using the data collected in the reports above.\n`;
  
  // Write the package report
  fs.writeFileSync(reportPath, packageReport);
  
  console.log(chalk.bold.green('\n=== Performance Review Package Generated ==='));
  console.log(chalk.white(`Package report saved to: ${reportPath}`));
  console.log(chalk.yellow('\nTo complete your review, run:'));
  console.log(chalk.cyan('node scripts/interactive-review.js'));
}

// Run the main function
main().catch(error => {
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  process.exit(1);
});
