#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const readline = require("readline");
const { Anthropic } = require("@anthropic-ai/sdk");

// Claude model will be loaded from config
let CLAUDE_MODEL = "claude-sonnet-4"; // Default model

// Paths
const PROCESSED_PATH = path.join(__dirname, "..", "data", "processed-prs.json");
const CRITERIA_PATH = path.join(__dirname, "..", "criteria.csv");
const REPORTS_DIR = path.join(__dirname, "..", "reports");
const LATTICE_DIR = path.join(__dirname, "..", "lattice");
// We'll dynamically find all review files in the lattice directory

// Function to find the most recent component analysis report
function findLatestComponentAnalysisReport() {
  if (!fs.existsSync(REPORTS_DIR)) return null;

  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter(
      (file) => file.startsWith("component_analysis_") && file.endsWith(".md")
    )
    .map((file) => ({
      name: file,
      path: path.join(REPORTS_DIR, file),
      time: fs.statSync(path.join(REPORTS_DIR, file)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  return files.length > 0 ? files[0].path : null;
}

// Function to extract component data from component analysis report
function extractComponentData(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return null;

  const content = fs.readFileSync(reportPath, "utf8");
  const components = [];

  // Extract component sections
  const componentSections = content.split("### ").slice(1); // Skip the first split which is before any component

  for (const section of componentSections) {
    const lines = section.split("\n");
    const nameAndRole = lines[0].match(/(.+) \((.+)\)/);

    if (nameAndRole) {
      const component = {
        name: nameAndRole[1].trim(),
        role: nameAndRole[2].trim(),
        metrics: {},
        githubContributors: {
          lead: null,
          contributors: [],
        },
        analysis: "",
        recentPRs: [],
      };

      // Extract metrics
      const metricsStart = lines.findIndex((line) =>
        line.includes("**Metrics:**")
      );
      if (metricsStart !== -1) {
        let i = metricsStart + 1;
        while (i < lines.length && lines[i].startsWith("- ")) {
          const metricMatch = lines[i].match(/- (.+): (.+)/);
          if (metricMatch) {
            component.metrics[metricMatch[1].toLowerCase().replace(/ /g, "_")] =
              metricMatch[2];
          }
          i++;
        }
      }

      // Extract GitHub contributors
      const contributorsStart = lines.findIndex((line) =>
        line.includes("**GitHub Contributors:**")
      );
      if (contributorsStart !== -1) {
        let i = contributorsStart + 1;

        // Extract lead contributor
        if (i < lines.length && lines[i].includes("**Lead Contributor:**")) {
          const leadMatch = lines[i].match(/- \*\*Lead Contributor:\*\* (.+)/);
          if (leadMatch && !leadMatch[1].includes("No clear lead")) {
            component.githubContributors.lead = leadMatch[1];
          }
          i++;
        }

        // Skip to top contributors
        while (i < lines.length && !lines[i].includes("**Top Contributors:**"))
          i++;
        i++; // Move past the header

        // Extract top contributors
        while (i < lines.length && lines[i].startsWith("  - ")) {
          const contributorMatch = lines[i].match(/  - (.+): (\d+) commits/);
          if (contributorMatch) {
            component.githubContributors.contributors.push({
              name: contributorMatch[1],
              commits: parseInt(contributorMatch[2], 10),
            });
          }
          i++;
        }
      }

      // Extract analysis
      const analysisStart = lines.findIndex((line) =>
        line.includes("**Analysis:**")
      );
      if (analysisStart !== -1) {
        let i = analysisStart + 1;
        let analysisText = [];
        while (i < lines.length && !lines[i].includes("**Recent PRs:**")) {
          if (lines[i].trim()) {
            analysisText.push(lines[i]);
          }
          i++;
        }
        component.analysis = analysisText.join("\n");
      }

      // Extract recent PRs
      const prsStart = lines.findIndex((line) =>
        line.includes("**Recent PRs:**")
      );
      if (prsStart !== -1) {
        let i = prsStart + 1;
        while (
          i < lines.length &&
          lines[i].startsWith("- ") &&
          !lines[i].includes("---")
        ) {
          component.recentPRs.push(lines[i].substring(2).trim());
          i++;
        }
      }

      components.push(component);
    }
  }

  return components;
}

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Generate a timestamped filename
function getTimestampedFilename(prefix) {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .split(".")[0]; // Remove milliseconds
  return path.join(REPORTS_DIR, `${prefix}_${timestamp}.md`);
}

// Load processed PRs
function loadProcessedPRs() {
  if (!fs.existsSync(PROCESSED_PATH)) {
    console.error(chalk.red(`Error: File not found at ${PROCESSED_PATH}`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PROCESSED_PATH, "utf8"));
}

// Function to find all review files in the lattice directory
function findReviewFiles() {
  const reviewFiles = {
    goals: [],
    managerReviews: [],
    employeeReviews: [],
  };

  try {
    // Get all directories in the lattice folder
    const dirs = fs
      .readdirSync(LATTICE_DIR)
      .filter(
        (dir) =>
          dir !== "example" &&
          fs.statSync(path.join(LATTICE_DIR, dir)).isDirectory()
      )
      .sort(); // Sort chronologically

    // Process each directory
    dirs.forEach((dir) => {
      const dirPath = path.join(LATTICE_DIR, dir);
      const files = fs.readdirSync(dirPath);

      // Calculate a weight based on recency (more recent = higher weight)
      // Format can be YYYY or YYYY-mid
      const yearMatch = dir.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;
      const isMidYear = dir.includes("-mid");
      const weight = year * 10 + (isMidYear ? 5 : 0); // Mid-year reviews are between annual reviews

      // Check for goals file
      if (files.includes("goals.md")) {
        reviewFiles.goals.push({
          path: path.join(dirPath, "goals.md"),
          dir,
          weight,
        });
      }

      // Check for manager review files
      const managerFiles = files.filter(
        (f) => f === "manager-review.md" || f === "manager.md"
      );
      managerFiles.forEach((file) => {
        reviewFiles.managerReviews.push({
          path: path.join(dirPath, file),
          dir,
          weight,
        });
      });

      // Check for employee review files
      const employeeFiles = files.filter(
        (f) => f === "employee-review.md" || f === "employee.md"
      );
      employeeFiles.forEach((file) => {
        reviewFiles.employeeReviews.push({
          path: path.join(dirPath, file),
          dir,
          weight,
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

// Function to load all goals files with weight based on recency
function loadGoals() {
  try {
    const reviewFiles = findReviewFiles();
    if (reviewFiles.goals.length === 0) {
      return null;
    }

    // Load all goals files, starting with the most recent
    let goalsContent = "";
    reviewFiles.goals.forEach((goalFile, index) => {
      const content = fs.readFileSync(goalFile.path, "utf8");
      const header = index === 0 ? "" : `\n\n## Goals from ${goalFile.dir}\n\n`;
      goalsContent += header + content;
    });

    return goalsContent;
  } catch (error) {
    console.error(`Error loading goals: ${error.message}`);
    return null;
  }
}

// Function to load all manager reviews with weight based on recency
function loadManagerReviews() {
  try {
    const reviewFiles = findReviewFiles();
    if (reviewFiles.managerReviews.length === 0) {
      return null;
    }

    // Load all manager review files, starting with the most recent
    let reviewContent = "";
    reviewFiles.managerReviews.forEach((reviewFile, index) => {
      const content = fs.readFileSync(reviewFile.path, "utf8");
      const header =
        index === 0 ? "" : `\n\n## Manager Review from ${reviewFile.dir}\n\n`;
      reviewContent += header + content;
    });

    return reviewContent;
  } catch (error) {
    console.error(`Error loading manager reviews: ${error.message}`);
    return null;
  }
}

// Function to load all employee reviews with weight based on recency
function loadEmployeeReviews() {
  try {
    const reviewFiles = findReviewFiles();
    if (reviewFiles.employeeReviews.length === 0) {
      return null;
    }

    // Load all employee review files, starting with the most recent
    let reviewContent = "";
    reviewFiles.employeeReviews.forEach((reviewFile, index) => {
      const content = fs.readFileSync(reviewFile.path, "utf8");
      const header =
        index === 0 ? "" : `\n\n## Self Review from ${reviewFile.dir}\n\n`;
      reviewContent += header + content;
    });

    return reviewContent;
  } catch (error) {
    console.error(`Error loading employee reviews: ${error.message}`);
    return null;
  }
}

// Load criteria for lookup
function loadCriteria() {
  const csv = fs.readFileSync(CRITERIA_PATH, "utf8");
  const lines = csv.split("\n").filter((line) => line.trim());

  // Skip header
  const criteriaLines = lines.slice(1);

  const criteria = {};
  for (const line of criteriaLines) {
    // Handle quoted fields correctly
    let fields = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && (i === 0 || line[i - 1] !== "\\")) {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        fields.push(currentField);
        currentField = "";
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
  Object.values(criteria).forEach((criterion) => {
    grouped[criterion.id] = {
      ...criterion,
      evidence: [],
      totalConfidence: 0,
      count: 0,
      order: parseInt(criterion.id, 10) || 999, // Use ID for sorting
    };
  });

  // Process each PR
  Object.entries(processedPRs).forEach(([repo, prs]) => {
    prs.forEach((pr) => {
      // Skip PRs that were skipped
      if (pr.skipped) return;

      // Process evidence array
      if (Array.isArray(pr.evidence)) {
        pr.evidence.forEach((item) => {
          const criterionId = item.criterion_id;
          if (
            criterionId &&
            criterionId !== "NONE" &&
            criterionId !== "ERROR"
          ) {
            if (!grouped[criterionId]) {
              // Handle case where criterion ID isn't in our criteria list
              grouped[criterionId] = {
                id: criterionId,
                area: "Unknown",
                subarea: "Unknown",
                description: "Unknown criterion",
                evidence: [],
                totalConfidence: 0,
                count: 0,
                order: parseInt(criterionId, 10) || 999,
              };
            }

            grouped[criterionId].evidence.push({
              repo,
              pr_number: pr.pr_number,
              pr_title: pr.pr_title,
              confidence: item.confidence || 0,
              evidence: item.evidence,
            });

            grouped[criterionId].totalConfidence += item.confidence || 0;
            grouped[criterionId].count += 1;
          }
        });
      } else if (pr.evidence && pr.evidence.criterion_id) {
        // Handle old format (single evidence object)
        const criterionId = pr.evidence.criterion_id;
        if (criterionId && criterionId !== "NONE" && criterionId !== "ERROR") {
          if (!grouped[criterionId]) {
            grouped[criterionId] = {
              id: criterionId,
              area: "Unknown",
              subarea: "Unknown",
              description: "Unknown criterion",
              evidence: [],
              totalConfidence: 0,
              count: 0,
              order: parseInt(criterionId, 10) || 999,
            };
          }

          grouped[criterionId].evidence.push({
            repo,
            pr_number: pr.pr_number,
            pr_title: pr.pr_title,
            confidence: 100, // Default for old format
            evidence: pr.evidence.evidence,
          });

          grouped[criterionId].totalConfidence += 100;
          grouped[criterionId].count += 1;
        }
      }
    });
  });

  return grouped;
}

// Get relevant examples for a criterion
function getExamplesForCriterion(criterion, maxExamples = 3) {
  if (!criterion || criterion.count === 0) {
    return "No specific examples found in your work.";
  }

  // Sort by confidence and get top examples
  const sortedEvidence = [...criterion.evidence]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxExamples);

  return sortedEvidence
    .map((e) => `- PR ${e.repo}#${e.pr_number}: ${e.pr_title}\n  ${e.evidence}`)
    .join("\n\n");
}

// Ask a question and get user input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(chalk.cyan(question + " "), (answer) => {
      resolve(answer.trim());
    });
  });
}

// Interactive review session
async function interactiveReview(grouped, criteria) {
  // Load config to get user context
  const config = loadConfig();
  const userContext =
    config.user_context ||
    "I am a senior developer content in my job with a great manager that supports me.";
  // Load processed PRs for question responses
  const processedPRs = loadProcessedPRs();

  // Load component analysis data if available
  const componentAnalysisPath = findLatestComponentAnalysisReport();
  const componentData = componentAnalysisPath
    ? extractComponentData(componentAnalysisPath)
    : null;

  const reportFilename = getTimestampedFilename("interactive_review");
  let markdownContent = "# INTERACTIVE ANNUAL PERFORMANCE REVIEW\n\n";
  markdownContent += "## Context\n\n";
  markdownContent += `${userContext}\n\n`;

  console.log(
    chalk.bold.blue("\n=== INTERACTIVE ANNUAL PERFORMANCE REVIEW ===\n")
  );

  // HR Guidance
  console.log(chalk.bold.green("\nYearly Review Guidelines:"));
  console.log(
    chalk.yellow(
      "• Reflect on performance over the past fiscal year (July 1 – present)"
    )
  );
  console.log(
    chalk.yellow(
      "• Review your goals, progress updates, and key project outcomes"
    )
  );
  console.log(chalk.yellow("• Write 3-5 complete sentences per question"));
  console.log(
    chalk.yellow(
      "• Include concrete examples, measurable outcomes, and relevant data"
    )
  );
  console.log(
    chalk.yellow(
      "• Focus on the impact of your actions on projects, your role, and your team"
    )
  );
  console.log(
    chalk.yellow(
      "• Highlight your achievements and the value you bring to the organization"
    )
  );
  console.log(chalk.dim("─".repeat(80)));

  // Display component analysis data if available
  if (componentData && componentData.length > 0) {
    console.log(chalk.bold.green("\nComponent Analysis:"));
    console.log(
      chalk.yellow(
        `Found data for ${componentData.length} components you've contributed to.`
      )
    );

    // Show lead components
    const leadComponents = componentData.filter((c) => c.role === "Lead");
    if (leadComponents.length > 0) {
      console.log(
        chalk.cyan(
          `\nYou are the LEAD for ${leadComponents.length} components:`
        )
      );
      leadComponents.forEach((comp) => {
        console.log(
          chalk.white(
            `• ${comp.name} (${comp.metrics.prs || 0} PRs, ${
              comp.metrics.total_changes || 0
            } changes)`
          )
        );
      });
    }

    // Show significant contributor components
    const significantComponents = componentData.filter(
      (c) => c.role === "Significant Contributor"
    );
    if (significantComponents.length > 0) {
      console.log(
        chalk.cyan(
          `\nYou are a SIGNIFICANT CONTRIBUTOR to ${significantComponents.length} components:`
        )
      );
      significantComponents.forEach((comp) => {
        console.log(
          chalk.white(
            `• ${comp.name} (${comp.metrics.prs || 0} PRs, ${
              comp.metrics.total_changes || 0
            } changes)`
          )
        );
      });
    }

    // Show components where you're not the lead but there is a clear lead
    const componentsWithOtherLeads = componentData
      .filter((c) => c.role !== "Lead" && c.githubContributors.lead)
      .slice(0, 5); // Limit to 5 to avoid overwhelming

    if (componentsWithOtherLeads.length > 0) {
      console.log(
        chalk.cyan("\nComponents you contribute to with other leads:")
      );
      componentsWithOtherLeads.forEach((comp) => {
        console.log(
          chalk.white(`• ${comp.name} - Lead: ${comp.githubContributors.lead}`)
        );
      });
    }

    console.log(chalk.dim("─".repeat(80)));
  }

  // Introduction
  markdownContent += "## Introduction\n\n";
  console.log(
    chalk.dim(
      "Remember to write 3-5 complete sentences with specific examples and metrics."
    )
  );
  const introduction = await askQuestion(
    "How would you describe your overall experience and impact this past fiscal year (July 1 - present)?"
  );
  markdownContent += `${introduction}\n\n`;

  // Sort criteria by area for better organization
  const criteriaByArea = {};
  Object.values(criteria).forEach((criterion) => {
    if (!criteriaByArea[criterion.area]) {
      criteriaByArea[criterion.area] = [];
    }
    criteriaByArea[criterion.area].push(criterion);
  });

  // Process each area
  for (const [area, areaCriteria] of Object.entries(criteriaByArea)) {
    console.log(chalk.bold.yellow(`\n${area}`));
    markdownContent += `## ${area}\n\n`;

    // Process each criterion in this area
    for (const criterion of areaCriteria) {
      const groupedCriterion = grouped[criterion.id];

      console.log(chalk.bold.cyan(`\n${criterion.id}: ${criterion.subarea}`));
      console.log(chalk.white(criterion.description));
      console.log(chalk.dim("─".repeat(80)));

      // Show examples from PRs
      const examples = getExamplesForCriterion(groupedCriterion);
      console.log(chalk.green("Examples from your work:"));
      console.log(examples);
      console.log(chalk.dim("─".repeat(80)));

      // Get AI-powered suggestions
      console.log(chalk.yellow("Generating AI suggestions..."));
      const aiSuggestions = await generateAISuggestions(criterion, examples);
      console.log(chalk.magenta("AI-powered talking points:"));
      console.log(aiSuggestions);
      console.log(chalk.dim("─".repeat(80)));

      // Ask for self-assessment with impact focus
      const assessment = await askQuestion(
        `How would you rate yourself on "${criterion.subarea}" (1-5)?`
      );
      console.log(
        chalk.dim(
          "Remember to include concrete examples, measurable outcomes, and relevant data."
        )
      );
      const explanation = await askQuestion(
        "Can you provide specific examples of how you demonstrated this and what impact it had on your projects, role, and team?"
      );
      console.log(
        chalk.dim(
          "Think about skills you want to develop and how they align with organizational goals."
        )
      );
      const growth = await askQuestion(
        "What opportunities do you see for growth in this area?"
      );

      markdownContent += `### ${criterion.id}: ${criterion.subarea}\n\n`;
      markdownContent += `${criterion.description}\n\n`;
      markdownContent += `**Self-Rating:** ${assessment}/5\n\n`;
      markdownContent += `**Self-Assessment & Impact:**\n${explanation}\n\n`;
      markdownContent += `**Growth Opportunities:**\n${growth}\n\n`;
      markdownContent += `**Examples from Work:**\n${examples}\n\n`;
      markdownContent += `**AI-Generated Talking Points:**\n${aiSuggestions}\n\n`;
      markdownContent += "---\n\n";
    }
  }

  // Reflection section
  console.log(chalk.bold.blue("\nThoughtful Reflection"));
  console.log(chalk.dim("─".repeat(80)));

  console.log(
    chalk.dim(
      "Include metrics, milestones, or historical context to quantify your impact."
    )
  );
  const biggestImpact = await askQuestion(
    "What do you believe was your biggest impact on the organization this fiscal year?"
  );
  console.log(
    chalk.dim(
      "Describe how this learning changed your approach or improved your effectiveness."
    )
  );
  const biggestLearning = await askQuestion(
    "What was your most significant learning or growth moment?"
  );
  console.log(
    chalk.dim(
      "Highlight specific team goals you helped achieve and broader organizational impacts."
    )
  );
  const teamContribution = await askQuestion(
    "How did your work contribute to the success of your team and the broader organization?"
  );

  markdownContent += "## Thoughtful Reflection\n\n";
  markdownContent += `**Biggest Impact:**\n${biggestImpact}\n\n`;
  markdownContent += `**Significant Learning:**\n${biggestLearning}\n\n`;
  markdownContent += `**Team Contribution:**\n${teamContribution}\n\n`;
  markdownContent += "---\n\n";

  // Goals review section
  console.log(chalk.bold.blue("\nGoals Review"));
  console.log(chalk.dim("─".repeat(80)));

  // Load and display goals
  const goalsContent = loadGoals();
  if (goalsContent) {
    console.log(chalk.green("Current 2024 Goals:"));
    console.log(chalk.dim("─".repeat(80)));
    console.log(goalsContent);
    console.log(chalk.dim("─".repeat(80)));

    markdownContent += "## Goals Review\n\n";
    markdownContent += `${goalsContent}\n\n`;
  }

  // Load and display employee self-reviews
  const employeeReviewContent = loadEmployeeReviews();
  if (employeeReviewContent) {
    console.log(chalk.green("\nEmployee Self-Reviews:"));
    console.log(chalk.dim("─".repeat(80)));
    console.log(employeeReviewContent);
    console.log(chalk.dim("─".repeat(80)));

    markdownContent += "## Employee Self-Reviews\n\n";
    markdownContent += `${employeeReviewContent}\n\n`;
  }

  // Load and display manager reviews
  const managerReviewContent = loadManagerReviews();
  if (managerReviewContent) {
    console.log(chalk.green("\nManager Reviews:"));
    console.log(chalk.dim("─".repeat(80)));
    console.log(managerReviewContent);
    console.log(chalk.dim("─".repeat(80)));

    markdownContent += "## Manager Reviews\n\n";
    markdownContent += `${managerReviewContent}\n\n`;
  }

  // Future growth section
  console.log(chalk.bold.blue("\nFuture Growth"));
  console.log(chalk.dim("─".repeat(80)));

  console.log(
    chalk.dim(
      "Connect these skills to your career aspirations and organizational needs."
    )
  );
  const developmentNeeds = await askQuestion(
    "What specific skills or experiences would help you grow in the coming fiscal year?"
  );
  console.log(
    chalk.dim(
      "Be specific about resources, training, or opportunities that would help you succeed."
    )
  );
  const supportNeeded = await askQuestion(
    "What support do you need from your manager or the organization to achieve your goals?"
  );
  console.log(
    chalk.dim(
      "Reflect on your proudest accomplishments and their significance."
    )
  );
  const proudestAccomplishment = await askQuestion(
    "What accomplishment from this fiscal year are you most proud of and why?"
  );

  markdownContent += `**Proudest Accomplishment:**\n${proudestAccomplishment}\n\n`;

  markdownContent += "## Future Growth\n\n";
  markdownContent += `**Development Needs:**\n${developmentNeeds}\n\n`;
  markdownContent += `**Support Needed:**\n${supportNeeded}\n\n`;
  markdownContent += "---\n\n";

  // Check if we should generate a goals progress report
  const generateReport = await askQuestion(
    "Would you like to generate a detailed goals progress report based on your PRs? (y/n)"
  ).then((answer) => answer.toLowerCase().startsWith("y"));

  if (generateReport) {
    console.log(chalk.yellow("\nGenerating goals progress report..."));

    try {
      // Run the goals-progress.js script
      const { execSync } = require("child_process");
      const reportOutput = execSync("node scripts/goals-progress.js", {
        cwd: path.join(__dirname, ".."),
      }).toString();

      // Extract the report path from the output
      const reportPathMatch = reportOutput.match(/saved to: (.+)/);
      const reportPath = reportPathMatch ? reportPathMatch[1].trim() : null;

      if (reportPath && fs.existsSync(reportPath)) {
        const reportContent = fs.readFileSync(reportPath, "utf8");
        console.log(
          chalk.green("\nGoals progress report generated successfully!")
        );
        console.log(chalk.dim("─".repeat(80)));
        console.log(
          reportContent.substring(0, 500) +
            "...\n(full report available in the reports directory)"
        );
        console.log(chalk.dim("─".repeat(80)));

        markdownContent += "### Automated Goals Progress Report\n\n";
        markdownContent += `A detailed goals progress report has been generated and saved to: ${reportPath}\n\n`;
        markdownContent += `Key findings from the report:\n\n`;
        markdownContent += `${reportContent.split("\n\n")[0]}\n\n`;
      } else {
        console.log(chalk.red("\nFailed to generate goals progress report."));
      }
    } catch (error) {
      console.error(
        chalk.red(`Error generating goals progress report: ${error.message}`)
      );
    }
  }

  if (goalsContent) {
    // Ask about goals progress
    const goalsProgress = await askQuestion(
      "How would you rate your overall progress on these goals (1-5)?"
    );
    const goalsComments = await askQuestion(
      "Any comments on your goals progress or adjustments needed?"
    );

    markdownContent += "### Goals Progress Assessment\n\n";
    markdownContent += `**Overall Progress Rating:** ${goalsProgress}/5\n\n`;
    markdownContent += `**Comments:**\n${goalsComments}\n\n`;
  } else {
    console.log(
      chalk.yellow("No goals file found. Skipping goals review section.")
    );
  }

  // FY25 Review Questions
  console.log(chalk.bold.blue("\nFY25 Review Questions"));
  console.log(chalk.dim("─".repeat(80)));

  // Question 1: Key Accomplishments
  console.log(chalk.bold.green("\nQuestion 1: Key Accomplishments"));
  console.log(
    chalk.yellow(
      "Reflecting on your focus and goals for FY25, what were your key accomplishments? Provide specific examples of your impact to your team, department or the organization."
    )
  );
  console.log(
    chalk.yellow(
      "Please include your Lattice goals and the extent to which you've achieved them as part of your response."
    )
  );

  // Generate AI response for Question 1
  console.log(chalk.dim("\nGenerating AI-suggested response..."));
  const accomplishmentsResponse = await generateQuestionResponse(
    "accomplishments",
    goalsContent,
    processedPRs,
    config,
    componentData
  );
  console.log(chalk.cyan("\nAI-Suggested Response:"));
  console.log(accomplishmentsResponse);

  // Ask for feedback
  const accomplishmentsFeedback = await askQuestion("\nFeedback? (Y/n)");
  let finalAccomplishmentsResponse = accomplishmentsResponse;

  if (accomplishmentsFeedback.toLowerCase() !== "n") {
    const feedbackText = await askQuestion("Please provide your feedback:");
    console.log(chalk.dim("\nRefining response based on feedback..."));
    finalAccomplishmentsResponse = await refineResponse(
      "accomplishments",
      accomplishmentsResponse,
      feedbackText,
      config
    );
    console.log(chalk.green("\nRefined Response:"));
    console.log(finalAccomplishmentsResponse);
  }

  // Question 2: Areas for Improvement
  console.log(chalk.bold.green("\nQuestion 2: Areas for Improvement"));
  console.log(
    chalk.yellow(
      "What are two areas in which you feel you could improve in to increase your impact at Presence?"
    )
  );

  // Generate AI response for Question 2
  console.log(chalk.dim("\nGenerating AI-suggested response..."));
  const improvementResponse = await generateQuestionResponse(
    "improvement",
    goalsContent,
    processedPRs,
    config,
    componentData
  );
  console.log(chalk.cyan("\nAI-Suggested Response:"));
  console.log(improvementResponse);

  // Ask for feedback
  const improvementFeedback = await askQuestion("\nFeedback? (Y/n)");
  let finalImprovementResponse = improvementResponse;

  if (improvementFeedback.toLowerCase() !== "n") {
    const feedbackText = await askQuestion("Please provide your feedback:");
    console.log(chalk.dim("\nRefining response based on feedback..."));
    finalImprovementResponse = await refineResponse(
      "improvement",
      improvementResponse,
      feedbackText,
      config
    );
    console.log(chalk.green("\nRefined Response:"));
    console.log(finalImprovementResponse);
  }

  // Question 3: Future Goals
  console.log(chalk.bold.green("\nQuestion 3: Future Goals"));
  console.log(
    chalk.yellow(
      "Please outline your performance and development goals for FY26. How can your manager support you to achieve these goals?"
    )
  );

  // Generate AI response for Question 3
  console.log(chalk.dim("\nGenerating AI-suggested response..."));
  const goalsResponse = await generateQuestionResponse(
    "goals",
    goalsContent,
    processedPRs,
    config
  );
  console.log(chalk.cyan("\nAI-Suggested Response:"));
  console.log(goalsResponse);

  // Ask for feedback
  const goalsFeedback = await askQuestion("\nFeedback? (Y/n)");
  let finalGoalsResponse = goalsResponse;

  if (goalsFeedback.toLowerCase() !== "n") {
    const feedbackText = await askQuestion("Please provide your feedback:");
    console.log(chalk.dim("\nRefining response based on feedback..."));
    finalGoalsResponse = await refineResponse(
      "goals",
      goalsResponse,
      feedbackText,
      config
    );
    console.log(chalk.green("\nRefined Response:"));
    console.log(finalGoalsResponse);
  }

  // Add responses to markdown content
  markdownContent += "## FY25 Review Questions\n\n";
  markdownContent += "### Key Accomplishments\n\n";
  markdownContent += `${finalAccomplishmentsResponse}\n\n`;
  markdownContent += "### Areas for Improvement\n\n";
  markdownContent += `${finalImprovementResponse}\n\n`;
  markdownContent += "### Future Goals\n\n";
  markdownContent += `${finalGoalsResponse}\n\n`;

  // Save report to file
  fs.writeFileSync(reportFilename, markdownContent);
  console.log(chalk.green(`\nInteractive Review saved to: ${reportFilename}`));

  rl.close();
  return reportFilename;
}

// Generate response for specific review questions
async function generateQuestionResponse(
  questionType,
  goalsContent,
  processedPRs,
  config,
  componentData = null
) {
  try {
    if (!config.anthropic_api_key) {
      return "AI response unavailable (missing API key)";
    }

    const userContext =
      config.user_context ||
      "I am a senior developer content in my job with a great manager that supports me.";
    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

    // Count PRs by repo for summary
    const prCountByRepo = {};
    Object.entries(processedPRs).forEach(([repo, prs]) => {
      prCountByRepo[repo] = prs.filter((pr) => !pr.skipped).length;
    });

    // Create a summary of PR work
    const prSummary = Object.entries(prCountByRepo)
      .map(([repo, count]) => `${repo}: ${count} PRs`)
      .join("\n");

    // Create a list of PR titles for context
    const prTitles = [];
    Object.entries(processedPRs).forEach(([repo, prs]) => {
      prs
        .filter((pr) => !pr.skipped)
        .forEach((pr) => {
          prTitles.push(`${repo}#${pr.pr_number}: ${pr.pr_title}`);
        });
    });

    // Create component analysis summary if available
    let componentSummary = "";
    if (componentData && componentData.length > 0) {
      // Lead components
      const leadComponents = componentData.filter((c) => c.role === "Lead");
      if (leadComponents.length > 0) {
        componentSummary += `\n\nYou are the LEAD for ${leadComponents.length} components:\n`;
        leadComponents.forEach((comp) => {
          componentSummary += `- ${comp.name} (${comp.metrics.prs || 0} PRs, ${
            comp.metrics.total_changes || 0
          } changes)\n`;
          if (comp.analysis) {
            componentSummary += `  Analysis: ${comp.analysis}\n`;
          }
        });
      }

      // Significant contributor components
      const significantComponents = componentData.filter(
        (c) => c.role === "Significant Contributor"
      );
      if (significantComponents.length > 0) {
        componentSummary += `\n\nYou are a SIGNIFICANT CONTRIBUTOR to ${significantComponents.length} components:\n`;
        significantComponents.forEach((comp) => {
          componentSummary += `- ${comp.name} (${comp.metrics.prs || 0} PRs, ${
            comp.metrics.total_changes || 0
          } changes)\n`;
          if (comp.analysis) {
            componentSummary += `  Analysis: ${comp.analysis}\n`;
          }
        });
      }

      // GitHub contribution data
      const componentsWithGitHubData = componentData.filter(
        (c) => c.githubContributors && c.githubContributors.lead
      );
      if (componentsWithGitHubData.length > 0) {
        componentSummary += `\n\nGitHub contribution data for key components:\n`;
        componentsWithGitHubData.slice(0, 3).forEach((comp) => {
          componentSummary += `- ${comp.name}: `;
          if (comp.githubContributors.lead) {
            componentSummary += `Lead: ${comp.githubContributors.lead}\n`;
          }
          if (
            comp.githubContributors.contributors &&
            comp.githubContributors.contributors.length > 0
          ) {
            componentSummary += `  Top contributors: ${comp.githubContributors.contributors
              .slice(0, 3)
              .map((c) => c.name)
              .join(", ")}\n`;
          }
        });
      }
    }

    let questionPrompt = "";

    if (questionType === "accomplishments") {
      questionPrompt = `Reflecting on your focus and goals for FY25, what were your key accomplishments? Provide specific examples of your impact to your team, department or the organization. Please include your Lattice goals and the extent to which you've achieved them as part of your response.`;
    } else if (questionType === "improvement") {
      questionPrompt = `What are two areas in which you feel you could improve in to increase your impact at Presence?`;
    } else if (questionType === "goals") {
      questionPrompt = `Please outline your performance and development goals for FY26. How can your manager support you to achieve these goals?`;
    }

    const prompt = `You are helping a software engineer prepare responses for their annual performance review at Presence Learning. Based on the information provided, draft a comprehensive response to the following question:

${questionPrompt}

CONTEXT ABOUT THE ENGINEER:
${userContext}

GOALS FROM LATTICE:
${goalsContent || "No goals available"}

PR WORK SUMMARY:
${prSummary}

RECENT PR TITLES (for context):
${prTitles.slice(0, 15).join("\n")}
${
  componentSummary
    ? `
COMPONENT ANALYSIS:
${componentSummary}`
    : ""
}

YEARLY REVIEW INSTRUCTIONS:
• Write 3-5 complete sentences per section
• Include concrete examples, measurable outcomes, and relevant data
• Be specific with metrics, milestones, or historical context
• Focus on impact to projects, team, and organization
• Connect achievements to business value

Please write a response that follows these instructions and sounds natural and authentic. The response should be in first person as if the engineer is writing it themselves.`;

    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    return `AI response unavailable: ${error.message}`;
  }
}

// Refine response based on feedback
async function refineResponse(
  questionType,
  originalResponse,
  feedback,
  config
) {
  try {
    if (!config.anthropic_api_key) {
      return "Response refinement unavailable (missing API key)";
    }

    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

    let questionPrompt = "";

    if (questionType === "accomplishments") {
      questionPrompt = `Reflecting on your focus and goals for FY25, what were your key accomplishments? Provide specific examples of your impact to your team, department or the organization. Please include your Lattice goals and the extent to which you've achieved them as part of your response.`;
    } else if (questionType === "improvement") {
      questionPrompt = `What are two areas in which you feel you could improve in to increase your impact at Presence?`;
    } else if (questionType === "goals") {
      questionPrompt = `Please outline your performance and development goals for FY26. How can your manager support you to achieve these goals?`;
    }

    const prompt = `You previously helped draft a response to the following performance review question:

${questionPrompt}

ORIGINAL RESPONSE:
${originalResponse}

USER FEEDBACK:
${feedback}

Please revise the response based on this feedback. The response should still:
• Be 3-5 complete sentences per section
• Include concrete examples, measurable outcomes, and relevant data
• Be specific with metrics, milestones, or historical context
• Focus on impact to projects, team, and organization
• Connect achievements to business value

Please write a revised response that incorporates the feedback while maintaining a natural, authentic tone in first person.`;

    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    return `Response refinement unavailable: ${error.message}`;
  }
}

// Generate AI-powered suggestions based on evidence
async function generateAISuggestions(criterion, examples) {
  try {
    // Load config for API key and context
    const config = loadConfig();
    if (!config.anthropic_api_key) {
      return "AI suggestions unavailable (missing API key)";
    }

    // Load goals if available
    const goalsContent = loadGoals();
    const goalsSection = goalsContent
      ? `\n\nThe developer has the following goals for 2024:\n${goalsContent}`
      : "";

    const userContext =
      config.user_context ||
      "I am a senior developer content in my job with a great manager that supports me.";
    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

    const prompt = `You are an expert reviewer helping with an annual performance review for a developer with the following context:

${userContext}${goalsSection}

Below is a performance criterion and evidence from their work:

Criterion: ${criterion.id}: [${criterion.area} > ${criterion.subarea}]
${criterion.description}

Evidence:
${examples}

YEARLY REVIEW INSTRUCTIONS:
• Focus on performance over the fiscal year (July 1 - present)
• Include concrete examples, measurable outcomes, and relevant data
• Highlight the impact of actions on projects, role, and team/organization
• Connect achievements to business value and organizational goals
• Be specific with metrics, milestones, or historical context

Based on this evidence and following the yearly review instructions, provide 3 specific talking points they could mention in their performance review. Each talking point should:
1. Be 3-5 sentences long
2. Include specific metrics or measurable outcomes
3. Highlight the impact on projects, team, and organization
4. Connect to business value
5. If relevant, relate to their 2024 goals

These should help the developer articulate their achievements related to this criterion in a way that aligns with the yearly review expectations.`;

    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    return `AI suggestions unavailable: ${error.message}`;
  }
}

// Load config and get user context
function loadConfig() {
  const configPath = path.join(__dirname, "..", "config.json");
  if (!fs.existsSync(configPath)) {
    console.error(
      chalk.red(
        `Error: Missing config.json. Please copy config.example.json to config.json and update it.`
      )
    );
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  // Set Claude model from config if available
  if (config.claude_model) {
    CLAUDE_MODEL = config.claude_model;
    console.log(chalk.blue(`Using Claude model: ${CLAUDE_MODEL}`));
  }

  return config;
}

// Main function
async function main() {
  try {
    console.log(chalk.bold("Loading data..."));

    const config = loadConfig();
    const processedPRs = loadProcessedPRs();
    const criteria = loadCriteria();
    const grouped = groupByCriterion(processedPRs, criteria);

    // Log user context
    if (config.user_context) {
      console.log(chalk.bold.blue("\nContext:"));
      console.log(chalk.italic(config.user_context));
      console.log();
    }

    // Start interactive review
    const reportPath = await interactiveReview(grouped, criteria);
    console.log(
      chalk.green(`\nYour performance review has been saved to: ${reportPath}`)
    );
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    rl.close();
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  process.exit(1);
});
