#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Create a timestamp for the report
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const reportDir = path.join(__dirname, '..', 'reports');
const reportPath = path.join(reportDir, `resume_${timestamp}.md`);

// Ensure reports directory exists
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

// Function to generate resume statements based on PR data if available, or generate sample statements
function generateResumeStatements() {
  try {
    // Load data from data directory if available
    const dataDir = path.join(__dirname, '..', 'data');
    const prDataPath = path.join(dataDir, 'prs.json');
    
    if (fs.existsSync(prDataPath)) {
      const prData = JSON.parse(fs.readFileSync(prDataPath, 'utf8'));
      
      // Extract relevant information for resume statements
      const projectStats = analyzeProjectData(prData);
      
      // Generate resume statements focused on architectural and staff engineering
      return generateArchitecturalStatements(projectStats);
    } else {
      // If PR data is not available, generate sample statements
      console.log(chalk.yellow('PR data not found. Generating sample resume statements.'));
      return generateSampleStatements();
    }
  } catch (error) {
    console.error(chalk.red(`Error generating resume statements: ${error.message}`));
    // Fall back to sample statements if there's an error
    console.log(chalk.yellow('Falling back to sample statements.'));
    return generateSampleStatements();
  }
}

// Analyze PR data to extract project statistics
function analyzeProjectData(prData) {
  // Initialize project statistics
  const stats = {
    totalPRs: prData.length,
    technologies: new Set(),
    components: {},
    reviewsGiven: 0,
    largeChanges: 0,
    architecturalChanges: 0,
    mentorshipInstances: 0
  };
  
  // Process each PR to gather statistics
  prData.forEach(pr => {
    // Extract technologies from PR title, body and files
    extractTechnologies(pr, stats.technologies);
    
    // Count reviews given to others
    if (pr.reviews && pr.reviews.length > 0) {
      stats.reviewsGiven += pr.reviews.length;
    }
    
    // Identify large changes (PRs with significant additions/deletions)
    if (pr.additions + pr.deletions > 500) {
      stats.largeChanges++;
    }
    
    // Identify architectural changes based on keywords in title or body
    if (isArchitecturalChange(pr)) {
      stats.architecturalChanges++;
    }
    
    // Identify mentorship instances based on review comments
    if (isMentorshipInstance(pr)) {
      stats.mentorshipInstances++;
    }
    
    // Track component contributions
    trackComponentContributions(pr, stats.components);
  });
  
  return stats;
}

// Extract technologies mentioned in PR
function extractTechnologies(pr, technologies) {
  const techKeywords = [
    'react', 'angular', 'vue', 'javascript', 'typescript', 'node', 'express',
    'graphql', 'rest', 'api', 'aws', 'azure', 'gcp', 'docker', 'kubernetes',
    'ci/cd', 'jenkins', 'github actions', 'terraform', 'microservices', 'serverless'
  ];
  
  const content = `${pr.title} ${pr.body}`.toLowerCase();
  
  techKeywords.forEach(tech => {
    if (content.includes(tech)) {
      technologies.add(tech);
    }
  });
}

// Determine if PR represents an architectural change
function isArchitecturalChange(pr) {
  const architecturalKeywords = [
    'architecture', 'refactor', 'redesign', 'restructure', 'framework',
    'infrastructure', 'platform', 'migration', 'modernize', 'pattern',
    'scalability', 'performance', 'optimization', 'system design'
  ];
  
  const content = `${pr.title} ${pr.body}`.toLowerCase();
  
  return architecturalKeywords.some(keyword => content.includes(keyword));
}

// Determine if PR represents a mentorship instance
function isMentorshipInstance(pr) {
  if (!pr.reviews) return false;
  
  const mentorshipKeywords = [
    'suggest', 'recommend', 'consider', 'learn', 'improve', 'better practice',
    'best practice', 'pattern', 'approach', 'alternative', 'guidance'
  ];
  
  // Check if any review comments contain mentorship keywords
  return pr.reviews.some(review => {
    if (!review.body) return false;
    const reviewBody = review.body.toLowerCase();
    return mentorshipKeywords.some(keyword => reviewBody.includes(keyword));
  });
}

// Track contributions to different components
function trackComponentContributions(pr, components) {
  if (!pr.files) return;
  
  pr.files.forEach(file => {
    // Extract component name from file path
    const pathParts = file.filename.split('/');
    if (pathParts.length > 1) {
      const component = pathParts[0];
      components[component] = (components[component] || 0) + 1;
    }
  });
}

// Generate architectural and staff engineering focused resume statements
function generateArchitecturalStatements(stats) {
  const statements = [];
  
  // Statement about architectural leadership
  if (stats.architecturalChanges > 0) {
    statements.push(
      `Led ${stats.architecturalChanges} major architectural initiatives, including system redesigns, framework migrations, and infrastructure modernizations that improved scalability and maintainability.`
    );
  }
  
  // Statement about technical leadership across components
  const topComponents = Object.entries(stats.components)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
    
  if (topComponents.length > 0) {
    statements.push(
      `Demonstrated technical leadership across multiple system components including ${topComponents.join(', ')}, driving consistency in implementation patterns and ensuring architectural integrity.`
    );
  }
  
  // Statement about mentorship and code quality
  if (stats.mentorshipInstances > 0) {
    statements.push(
      `Elevated team capabilities through technical mentorship in ${stats.mentorshipInstances} documented instances, focusing on architectural patterns, code quality, and engineering best practices.`
    );
  }
  
  // Statement about technology expertise
  if (stats.technologies.size > 0) {
    const techList = Array.from(stats.technologies).slice(0, 5).join(', ');
    statements.push(
      `Established expertise in ${techList}, implementing robust architectural solutions that balanced innovation with maintainability and performance.`
    );
  }
  
  // Statement about code reviews and quality standards
  if (stats.reviewsGiven > 0) {
    statements.push(
      `Championed engineering excellence through ${stats.reviewsGiven} in-depth code reviews, establishing architectural guidelines and quality standards that improved system resilience and reduced technical debt.`
    );
  }
  
  // Limit to 5 most impressive statements
  return statements.slice(0, 5);
}

// Generate sample architectural and staff engineering focused resume statements
function generateSampleStatements() {
  return [
    'Led the architectural transformation of a legacy monolithic application into a modern microservices architecture, resulting in 40% improved system performance and 60% faster deployment cycles.',
    'Established and enforced architectural standards across 5 development teams, implementing design reviews and technical planning processes that reduced critical production issues by 35%.',
    'Designed and implemented a comprehensive CI/CD pipeline with automated testing, reducing deployment time from days to minutes while ensuring 99.9% uptime for critical services.',
    'Mentored 12 senior and mid-level engineers through architectural decision-making processes, elevating team capabilities in distributed systems design and scalable architecture patterns.',
    'Pioneered the adoption of event-driven architecture and domain-driven design principles, enabling the business to scale to handle 10x transaction volume without proportional infrastructure cost increases.'
  ];
}

// Main function to run the script
async function main() {
  console.log(chalk.bold.blue('=== Generating Resume Statements ===\n'));
  
  const statements = generateResumeStatements();
  
  if (!statements || statements.length === 0) {
    console.error(chalk.red('Failed to generate resume statements.'));
    process.exit(1);
  }
  
  // Generate the report content
  let reportContent = `# Resume Statements\n\n`;
  reportContent += `*Generated on ${new Date().toISOString().split('T')[0]}*\n\n`;
  reportContent += `## Architectural and Staff Engineering Highlights\n\n`;
  
  statements.forEach(statement => {
    reportContent += `- ${statement}\n`;
  });
  
  reportContent += `\n## How to Use These Statements\n\n`;
  reportContent += `These statements are designed to highlight your architectural and staff engineering contributions. `;
  reportContent += `They can be used in your resume, LinkedIn profile, or during performance reviews. `;
  reportContent += `Consider customizing them further with specific project names or technologies as appropriate.\n`;
  
  // Write the report
  fs.writeFileSync(reportPath, reportContent);
  
  console.log(chalk.green(`✓ Resume statements generated successfully!`));
  console.log(chalk.white(`Report saved to: ${reportPath}`));
  
  // Print the statements to the console
  console.log(chalk.yellow('\nGenerated Resume Statements:'));
  statements.forEach((statement, index) => {
    console.log(chalk.cyan(`${index + 1}. ${statement}`));
  });
}

// Run the main function
main().catch(error => {
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  process.exit(1);
});
