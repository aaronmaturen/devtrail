#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const readline = require("readline");
const { Anthropic } = require("@anthropic-ai/sdk");

// Paths
const PROCESSED_PATH = path.join(__dirname, "..", "data", "processed-prs.json");
const CRITERIA_PATH = path.join(__dirname, "..", "criteria.csv");
const REPORTS_DIR = path.join(__dirname, "..", "reports");
const LATTICE_DIR = path.join(__dirname, "..", "lattice");
const PRESENCE_WAY_PATH = path.join(__dirname, "..", "presence_way.md");
// We'll dynamically find all review files in the lattice directory

// Function to load the Presence Way framework
function loadPresenceWay() {
  if (!fs.existsSync(PRESENCE_WAY_PATH)) {
    console.log(
      chalk.yellow(`Presence Way framework not found at ${PRESENCE_WAY_PATH}`)
    );
    return null;
  }

  try {
    const content = fs.readFileSync(PRESENCE_WAY_PATH, "utf8");
    console.log(chalk.green("Loaded Presence Way framework"));
    return content;
  } catch (error) {
    console.error(
      chalk.red(`Error loading Presence Way framework: ${error.message}`)
    );
    return null;
  }
}

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
      mtime: fs.statSync(path.join(REPORTS_DIR, file)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].path : null;
}

// Function to extract component data from component analysis report
function extractComponentData(reportPath) {
  try {
    const content = fs.readFileSync(reportPath, "utf8");
    const components = [];

    // Extract component sections
    const componentSections = content.split(/^## /m).slice(1);
    for (const section of componentSections) {
      const lines = section.split("\n");
      const componentName = lines[0].trim();

      // Extract lead information
      const leadMatch = section.match(/Lead: (.+)/);
      const lead = leadMatch ? leadMatch[1].trim() : "No lead identified";

      // Extract contributors
      const contributorsMatch = section.match(/Contributors: (.+)/);
      const contributors = contributorsMatch
        ? contributorsMatch[1].trim().split(", ")
        : [];

      // Extract PR count
      const prCountMatch = section.match(/PR Count: (\d+)/);
      const prCount = prCountMatch ? parseInt(prCountMatch[1]) : 0;

      // Extract description
      const descriptionMatch = section.match(
        /Description:\s*\n([\s\S]*?)(?:\n##|\n\*\*|$)/
      );
      const description = descriptionMatch
        ? descriptionMatch[1].trim()
        : "No description available";

      components.push({
        name: componentName,
        lead,
        contributors,
        prCount,
        description,
      });
    }

    return components;
  } catch (error) {
    console.error(
      chalk.red(`Error extracting component data: ${error.message}`)
    );
    return null;
  }
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
  if (!fs.existsSync(LATTICE_DIR)) {
    console.log(chalk.yellow(`Lattice directory not found at ${LATTICE_DIR}`));
    return { goals: [], managerReviews: [], employeeReviews: [] };
  }

  // Find all subdirectories (years)
  const years = fs
    .readdirSync(LATTICE_DIR)
    .filter((item) => {
      const itemPath = path.join(LATTICE_DIR, item);
      return (
        fs.statSync(itemPath).isDirectory() &&
        !item.startsWith(".") &&
        item !== "example"
      );
    })
    .sort()
    .reverse(); // Most recent years first

  const goals = [];
  const managerReviews = [];
  const employeeReviews = [];

  for (const year of years) {
    const yearPath = path.join(LATTICE_DIR, year);

    // Check if files exist
    const goalsPath = path.join(yearPath, "goals.md");
    const managerReviewPath = path.join(yearPath, "manager-review.md");
    const employeeReviewPath = path.join(yearPath, "employee-review.md");

    if (fs.existsSync(goalsPath)) {
      goals.push({
        year,
        path: goalsPath,
        weight: 1 + years.indexOf(year) * 0.5, // More weight to recent years
      });
    }

    if (fs.existsSync(managerReviewPath)) {
      managerReviews.push({
        year,
        path: managerReviewPath,
        weight: 1 + years.indexOf(year) * 0.5,
      });
    }

    if (fs.existsSync(employeeReviewPath)) {
      employeeReviews.push({
        year,
        path: employeeReviewPath,
        weight: 1 + years.indexOf(year) * 0.5,
      });
    }
  }

  return { goals, managerReviews, employeeReviews };
}

// Function to load all goals files with weight based on recency
function loadGoals() {
  const { goals } = findReviewFiles();

  if (goals.length === 0) {
    console.log(chalk.yellow("No goals files found"));
    return null;
  }

  let combinedContent = "";

  for (const goal of goals) {
    try {
      const content = fs.readFileSync(goal.path, "utf8");
      combinedContent += `## Goals for ${goal.year}\n\n${content}\n\n`;
    } catch (error) {
      console.error(
        chalk.red(`Error reading goals file for ${goal.year}: ${error.message}`)
      );
    }
  }

  return combinedContent.trim();
}

// Function to load all manager reviews with weight based on recency
function loadManagerReviews() {
  const { managerReviews } = findReviewFiles();

  if (managerReviews.length === 0) {
    console.log(chalk.yellow("No manager review files found"));
    return null;
  }

  let combinedContent = "";

  for (const review of managerReviews) {
    try {
      const content = fs.readFileSync(review.path, "utf8");
      combinedContent += `## Manager Review for ${review.year}\n\n${content}\n\n`;
    } catch (error) {
      console.error(
        chalk.red(
          `Error reading manager review file for ${review.year}: ${error.message}`
        )
      );
    }
  }

  return combinedContent.trim();
}

// Function to load all employee reviews with weight based on recency
function loadEmployeeReviews() {
  const { employeeReviews } = findReviewFiles();

  if (employeeReviews.length === 0) {
    console.log(chalk.yellow("No employee review files found"));
    return null;
  }

  let combinedContent = "";

  for (const review of employeeReviews) {
    try {
      const content = fs.readFileSync(review.path, "utf8");
      combinedContent += `## Self Review for ${review.year}\n\n${content}\n\n`;
    } catch (error) {
      console.error(
        chalk.red(
          `Error reading employee review file for ${review.year}: ${error.message}`
        )
      );
    }
  }

  return combinedContent.trim();
}

// Load criteria for lookup
function loadCriteria() {
  if (!fs.existsSync(CRITERIA_PATH)) {
    console.error(chalk.red(`Error: File not found at ${CRITERIA_PATH}`));
    process.exit(1);
  }

  const csv = fs.readFileSync(CRITERIA_PATH, "utf8");
  const lines = csv.split("\n").filter((line) => line.trim());
  const headers = lines[0].split(",");

  const criteria = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const criterion = {};

    for (let j = 0; j < headers.length; j++) {
      criterion[headers[j]] = values[j];
    }

    // Skip if criterion_id is not defined
    if (!criterion.criterion_id) continue;

    criteria[criterion.criterion_id] = {
      id: criterion.criterion_id,
      area: criterion.area_of_concentration,
      subarea: criterion.subarea,
      description: criterion.description,
      examples: [],
    };
  }

  return criteria;
}

// Group evidence by criterion
function groupByCriterion(processedPRs, criteria) {
  // Initialize examples array for each criterion
  Object.values(criteria).forEach((criterion) => {
    criterion.examples = [];
  });

  // Process each PR and add its evidence to the appropriate criteria
  Object.entries(processedPRs).forEach(([repo, prs]) => {
    prs.forEach((pr) => {
      // Skip PRs that were marked to be skipped
      if (pr.skipped) return;

      // Process evidence for this PR
      if (pr.evidence && Array.isArray(pr.evidence)) {
        pr.evidence.forEach((evidence) => {
          const criterionId = evidence.criterion_id;

          // Skip if criterion not found
          if (!criteria[criterionId]) return;

          // Add example to criterion
          criteria[criterionId].examples.push({
            repo,
            pr_number: pr.pr_number,
            pr_title: pr.pr_title,
            pr_url: pr.pr_url,
            confidence: evidence.confidence,
            evidence: evidence.evidence,
          });
        });
      }
    });
  });

  // Sort examples by confidence (highest first)
  Object.values(criteria).forEach((criterion) => {
    criterion.examples.sort((a, b) => b.confidence - a.confidence);
  });

  return criteria;
}

// Get relevant examples for a criterion
function getExamplesForCriterion(criterion, maxExamples = 3) {
  if (!criterion || !criterion.examples) return [];

  return criterion.examples.slice(0, maxExamples);
}

// Ask a question and get user input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(chalk.bold(question) + " ", (answer) => {
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

  // HR Guidelines
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

  // Load goals and reviews
  const goalsContent = loadGoals();
  const managerReviewsContent = loadManagerReviews();
  const employeeReviewsContent = loadEmployeeReviews();

  // Show component analysis if available
  if (componentData && componentData.length > 0) {
    console.log(chalk.bold.green("\nComponent Analysis:"));

    // Find components where user is lead
    const leadComponents = componentData.filter(
      (comp) => comp.lead === config.github_username
    );

    if (leadComponents.length > 0) {
      console.log(chalk.bold.cyan("\nComponents you lead:"));
      leadComponents.forEach((comp) => {
        console.log(
          chalk.white(
            `• ${comp.name} (${comp.prCount} PRs, ${comp.contributors.length} contributors)`
          )
        );
      });
    }

    // Find components where user is contributor
    const contributorComponents = componentData.filter(
      (comp) =>
        comp.lead !== config.github_username &&
        comp.contributors.includes(config.github_username)
    );

    if (contributorComponents.length > 0) {
      console.log(chalk.bold.cyan("\nComponents you contribute to:"));
      contributorComponents.forEach((comp) => {
        console.log(
          chalk.white(
            `• ${comp.name} (${comp.prCount} PRs, lead: ${comp.lead})`
          )
        );
      });
    }

    console.log(chalk.dim("─".repeat(80)));
  }

  // Start with accomplishments question
  console.log(
    chalk.bold.green(
      "\nQuestion 1: Reflecting on your focus and goals for FY25, what were your key accomplishments? Provide specific examples of your impact to your team, department or the organization. Please include your Lattice goals and the extent to which you've achieved them as part of your response."
    )
  );

  // Generate AI response
  console.log(chalk.blue("\nGenerating AI-assisted response..."));
  let accomplishmentsResponse;
  try {
    accomplishmentsResponse = await generateQuestionResponse(
      "accomplishments",
      goalsContent,
      processedPRs,
      config,
      componentData
    );
    console.log(chalk.dim("─".repeat(80)));
    console.log(chalk.white(accomplishmentsResponse));
    console.log(chalk.dim("─".repeat(80)));
  } catch (error) {
    console.error(chalk.red(`Failed to generate response: ${error.message}`));
    accomplishmentsResponse = "[Unable to generate AI response. Please provide your own.]";
  }

  // Keep revising until satisfied
  let keepRevising = true;
  while (keepRevising) {
    let userChoice;
    try {
      userChoice = await askQuestion(
        chalk.yellow(
          "\nWould you like to keep this response, revise it, or start over? (keep/revise/restart):"
        )
      );
    } catch (error) {
      console.error(chalk.red(`Error getting user input: ${error.message}`));
      userChoice = "keep"; // Default to keep if there's an error
    }
    
    if (userChoice.toLowerCase() === "keep") {
      keepRevising = false;
    } else if (userChoice.toLowerCase() === "revise") {
      const feedback = await askQuestion(
        chalk.yellow(
          "What feedback do you have for the AI to improve this response?"
        )
      );
      console.log(chalk.blue("\nRevising response based on your feedback..."));
      accomplishmentsResponse = await refineResponse(
        "accomplishments",
        accomplishmentsResponse,
        feedback,
        config
      );
      console.log(chalk.dim("─".repeat(80)));
      console.log(chalk.white(accomplishmentsResponse));
      console.log(chalk.dim("─".repeat(80)));
    } else if (userChoice.toLowerCase() === "restart") {
      console.log(chalk.blue("\nGenerating a new response from scratch..."));
      accomplishmentsResponse = await generateQuestionResponse(
        "accomplishments",
        goalsContent,
        processedPRs,
        config,
        componentData
      );
      console.log(chalk.dim("─".repeat(80)));
      console.log(chalk.white(accomplishmentsResponse));
      console.log(chalk.dim("─".repeat(80)));
    }
  }

  // Add to markdown
  markdownContent += "## Key Accomplishments\n\n";
  markdownContent += `${accomplishmentsResponse}\n\n`;

  // Areas for improvement question
  console.log(
    chalk.bold.green(
      "\nQuestion 2: What are two areas in which you feel you could improve in to increase your impact at Presence?"
    )
  );

  // Generate AI response
  console.log(chalk.blue("\nGenerating AI-assisted response..."));
  let improvementResponse;
  try {
    improvementResponse = await generateQuestionResponse(
      "improvement",
      goalsContent,
      processedPRs,
      config,
      componentData
    );
    console.log(chalk.dim("─".repeat(80)));
    console.log(chalk.white(improvementResponse));
    console.log(chalk.dim("─".repeat(80)));
  } catch (error) {
    console.error(chalk.red(`Failed to generate response: ${error.message}`));
    improvementResponse = "[Unable to generate AI response. Please provide your own.]";
  }

  // Keep revising until satisfied
  keepRevising = true;
  while (keepRevising) {
    const userChoice = await askQuestion(
      chalk.yellow(
        "\nWould you like to keep this response, revise it, or start over? (keep/revise/restart):"
      )
    );
    
    if (userChoice.toLowerCase() === "keep") {
      keepRevising = false;
    } else if (userChoice.toLowerCase() === "revise") {
      const feedback = await askQuestion(
        chalk.yellow(
          "What feedback do you have for the AI to improve this response?"
        )
      );
      console.log(chalk.blue("\nRevising response based on your feedback..."));
      improvementResponse = await refineResponse(
        "improvement",
        improvementResponse,
        feedback,
        config
      );
      console.log(chalk.dim("─".repeat(80)));
      console.log(chalk.white(improvementResponse));
      console.log(chalk.dim("─".repeat(80)));
    } else if (userChoice.toLowerCase() === "restart") {
      console.log(chalk.blue("\nGenerating a new response from scratch..."));
      improvementResponse = await generateQuestionResponse(
        "improvement",
        goalsContent,
        processedPRs,
        config,
        componentData
      );
      console.log(chalk.dim("─".repeat(80)));
      console.log(chalk.white(improvementResponse));
      console.log(chalk.dim("─".repeat(80)));
    }
  }

  // Add to markdown
  markdownContent += "## Areas for Improvement\n\n";
  markdownContent += `${improvementResponse}\n\n`;

  // Goals question
  console.log(
    chalk.bold.green(
      "\nQuestion 3: Please outline your performance and development goals for FY26. How can your manager support you to achieve these goals?"
    )
  );

  // Generate AI response
  console.log(chalk.blue("\nGenerating AI-assisted response..."));
  let goalsResponse;
  try {
    goalsResponse = await generateQuestionResponse(
      "goals",
      goalsContent,
      processedPRs,
      config,
      componentData
    );
    console.log(chalk.dim("─".repeat(80)));
    console.log(chalk.white(goalsResponse));
    console.log(chalk.dim("─".repeat(80)));
  } catch (error) {
    console.error(chalk.red(`Failed to generate response: ${error.message}`));
    goalsResponse = "[Unable to generate AI response. Please provide your own.]";
  }

  // Keep revising until satisfied
  keepRevising = true;
  while (keepRevising) {
    const userChoice = await askQuestion(
      chalk.yellow(
        "\nWould you like to keep this response, revise it, or start over? (keep/revise/restart):"
      )
    );
    
    if (userChoice.toLowerCase() === "keep") {
      keepRevising = false;
    } else if (userChoice.toLowerCase() === "revise") {
      const feedback = await askQuestion(
        chalk.yellow(
          "What feedback do you have for the AI to improve this response?"
        )
      );
      console.log(chalk.blue("\nRevising response based on your feedback..."));
      goalsResponse = await refineResponse(
        "goals",
        goalsResponse,
        feedback,
        config
      );
      console.log(chalk.dim("─".repeat(80)));
      console.log(chalk.white(goalsResponse));
      console.log(chalk.dim("─".repeat(80)));
    } else if (userChoice.toLowerCase() === "restart") {
      console.log(chalk.blue("\nGenerating a new response from scratch..."));
      goalsResponse = await generateQuestionResponse(
        "goals",
        goalsContent,
        processedPRs,
        config,
        componentData
      );
      console.log(chalk.dim("─".repeat(80)));
      console.log(chalk.white(goalsResponse));
      console.log(chalk.dim("─".repeat(80)));
    }
  }

  // Add to markdown
  markdownContent += "## Goals for FY26\n\n";
  markdownContent += `${goalsResponse}\n\n`;

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
  componentData
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
      const leadComponents = componentData.filter(
        (comp) => comp.lead === config.github_username
      );
      if (leadComponents.length > 0) {
        componentSummary += "Components you lead:\n";
        leadComponents.forEach((comp) => {
          componentSummary += `- ${comp.name} (${comp.prCount} PRs, ${comp.contributors.length} contributors)\n`;
        });
      }

      // Contributor components
      const contributorComponents = componentData.filter(
        (comp) =>
          comp.lead !== config.github_username &&
          comp.contributors.includes(config.github_username)
      );
      if (contributorComponents.length > 0) {
        componentSummary += "\nComponents you contribute to:\n";
        contributorComponents.forEach((comp) => {
          componentSummary += `- ${comp.name} (${comp.prCount} PRs, lead: ${comp.lead})\n`;
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

    const prompt = `You are helping a software engineer prepare responses for their annual performance review at Presence Learning. Based on the information provided, draft a response to the following question:

${questionPrompt}

CONTEXT ABOUT THE ENGINEER:
${userContext}

GOALS FROM LATTICE:
${goalsContent || "No goals available"}

PR WORK SUMMARY:
${prSummary}

RECENT PR TITLES (for context):
${prTitles.slice(0, 15).join("\n")}${
      componentSummary
        ? `
COMPONENT ANALYSIS:
${componentSummary}`
        : ""
    }${
      config.presenceWayContent
        ? `

PRESENCE WAY FRAMEWORK:
${config.presenceWayContent}`
        : ""
    }

When drafting the response, align it with the Presence Way framework and values when applicable.

YEARLY REVIEW INSTRUCTIONS:
• CRITICAL: Write EXACTLY 3-5 complete sentences total - no more, no less
• Focus on quality over quantity - each sentence should be meaningful and impactful
• Include concrete examples, measurable outcomes, and relevant data
• Be specific with metrics, milestones, or historical context
• Focus on impact to projects, team, and organization
• Connect achievements to business value

Please write a response that follows these instructions and sounds natural and authentic. The response should be in first person as if the engineer is writing it themselves. Count your sentences carefully before submitting.`;

    const completion = await anthropic.messages.create({
      model: config.claude_model,
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    console.error(chalk.red(`Error generating response: ${error.message}`));
    
    // Check for rate limit errors
    if (error.message.includes('rate_limit') || error.status === 429) {
      return `Rate limit exceeded. Please try again in a minute or provide your own response.\n\nSuggested approach:\n1. Reflect on your key accomplishments related to your goals\n2. Include specific metrics and impact\n3. Keep it concise (3-5 sentences)`;
    }
    
    return `Error generating AI response: ${error.message}`;
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
      return "AI response unavailable (missing API key)";
    }

    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

    const prompt = `You previously helped draft a response to the following performance review question:

${
  questionType === "accomplishments"
    ? "Reflecting on your focus and goals for FY25, what were your key accomplishments?"
    : questionType === "improvement"
    ? "What are two areas in which you feel you could improve in to increase your impact at Presence?"
    : "Please outline your performance and development goals for FY26. How can your manager support you to achieve these goals?"
}

Here is the original response you drafted:

${originalResponse}

The user has provided the following feedback on how to improve this response:

${feedback}

Please revise the response based on this feedback. Keep the same general structure and content, but make the requested changes. The response should still be in first person as if the engineer is writing it themselves.`;

    const completion = await anthropic.messages.create({
      model: config.claude_model,
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    console.error(chalk.red(`Error refining response: ${error.message}`));
    return `Error refining AI response: ${error.message}`;
  }
}

// Generate AI-powered suggestions based on evidence
async function generateAISuggestions(criterion, examples) {
  try {
    const config = loadConfig();
    if (!config.anthropic_api_key) {
      return "AI suggestions unavailable (missing API key)";
    }

    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

    // Prepare examples text
    const examplesText = examples
      .map(
        (ex) =>
          `PR: ${ex.repo}#${ex.pr_number} - ${ex.pr_title}\nEvidence: ${ex.evidence}`
      )
      .join("\n\n");

    const prompt = `You are an expert reviewer helping with an annual performance review for a developer with the following context:

${config.user_context || ""}

I need your help analyzing evidence for the following performance criterion:

${criterion.id}. ${criterion.area} > ${criterion.subarea}: ${
      criterion.description
    }

Here is the evidence from the developer's pull requests:

${examplesText || "No specific evidence available"}

Based on this evidence, please suggest 2-3 bullet points the developer could include in their performance review that:
1. Highlight specific achievements related to this criterion
2. Quantify impact where possible
3. Connect to business value
4. Use strong action verbs
5. Are specific and concrete

Format each bullet as a complete sentence that could be included in a performance review. Write in first person (using "I").`;

    const completion = await anthropic.messages.create({
      model: config.claude_model,
      max_tokens: 1000,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    console.error(chalk.red(`Error generating suggestions: ${error.message}`));
    return `Error generating AI suggestions: ${error.message}`;
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

  // Load the Presence Way framework
  const presenceWayContent = loadPresenceWay();
  if (presenceWayContent) {
    // Add to config for use in prompts
    config.presenceWayContent = presenceWayContent;
  }

  return config;
}

// Load all necessary data
function loadData() {
  // Load processed PRs
  const processedPRs = loadProcessedPRs();
  
  // Load criteria
  const criteria = loadCriteria();
  
  // Group evidence by criterion
  const grouped = groupByCriterion(processedPRs, criteria);
  
  return { grouped, criteria };
}

// Main function
async function main() {
  try {
    console.log(chalk.blue("Loading data..."));
    const { grouped, criteria } = loadData();

    try {
      // Start interactive review
      const reportPath = await interactiveReview(grouped, criteria);
      console.log(
        chalk.green(`\nYour performance review has been saved to: ${reportPath}`)
      );
    } catch (error) {
      console.error(chalk.red(`Error during interactive review: ${error.message}`));
      // Don't exit here, let the outer catch handle it
    }
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
