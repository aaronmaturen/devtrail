#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { Anthropic } = require("@anthropic-ai/sdk");

// Import review analyzer
const reviewAnalyzer = require("./review-analyzer");

// Paths
const PROCESSED_PATH = path.join(__dirname, "..", "data", "processed-prs.json");
const CRITERIA_PATH = path.join(__dirname, "..", "criteria.csv");
const REPORTS_DIR = path.join(__dirname, "..", "reports");

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Generate a timestamped filename
function getTimestampedFilename(prefix) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/:/g, "-");
  return path.join(REPORTS_DIR, `${prefix}_${timestamp}.md`);
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
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

// Load criteria for lookup
function loadCriteria() {
  const csv = fs.readFileSync(CRITERIA_PATH, "utf8");
  const lines = csv.split("\n").filter((line) => line.trim());
  const headers = lines[0].split(",");

  // Find indices for each field
  const idIndex = headers.indexOf("criterion_id");
  const areaIndex = headers.indexOf("area_of_concentration");
  const subareaIndex = headers.indexOf("subarea");
  const descriptionIndex = headers.indexOf("description");
  const prDetectableIndex = headers.indexOf("pr_detectable");

  if (
    idIndex === -1 ||
    areaIndex === -1 ||
    subareaIndex === -1 ||
    descriptionIndex === -1
  ) {
    console.error(
      chalk.red(
        "Error: Invalid criteria CSV format. Expected columns: criterion_id, area_of_concentration, subarea, description"
      )
    );
    process.exit(1);
  }

  const criteria = {};

  for (let i = 1; i < lines.length; i++) {
    // Handle quoted values with commas
    const values = [];
    let currentValue = "";
    let inQuotes = false;

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(currentValue);
        currentValue = "";
      } else {
        currentValue += char;
      }
    }

    values.push(currentValue);

    const id = values[idIndex];
    const area = values[areaIndex];
    const subarea = values[subareaIndex];
    const description = values[descriptionIndex].replace(/^"|"$/g, ""); // Remove quotes
    const prDetectable =
      prDetectableIndex !== -1
        ? values[prDetectableIndex]?.toLowerCase() === "yes" ||
          values[prDetectableIndex]?.toLowerCase() === "true"
        : true;

    criteria[id] = {
      id,
      area,
      subarea,
      description,
      prDetectable,
      evidence: [],
      count: 0,
    };
  }

  return criteria;
}

// Group PRs by criteria
function groupByCriteria(prs, criteria) {
  const grouped = { ...criteria };

  prs.forEach((pr) => {
    if (!pr.criteria || !pr.criteria.length) return;

    pr.criteria.forEach((criterionMatch) => {
      const { criterion_id, confidence, evidence } = criterionMatch;

      if (grouped[criterion_id]) {
        grouped[criterion_id].evidence.push({
          repo: pr.repo,
          pr_number: pr.number,
          pr_title: pr.title,
          evidence,
          confidence,
        });

        grouped[criterion_id].count++;
      }
    });
  });

  // Sort evidence by confidence
  Object.values(grouped).forEach((criterion) => {
    criterion.evidence.sort((a, b) => b.confidence - a.confidence);
  });

  return grouped;
}

// Generate report with AI summaries
async function generateReport(grouped, reviewEvidence, config) {
  const reportFilename = getTimestampedFilename("report");
  let markdownContent = `# Performance Review Report\n\n`;
  markdownContent += `Generated on: ${new Date().toLocaleString()}\n\n`;

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: config.anthropic_api_key,
  });

  // Process each criterion
  for (const criterion of Object.values(grouped)) {
    console.log(
      chalk.bold.cyan(
        `\nProcessing criterion ${criterion.id}: [${criterion.area} > ${criterion.subarea}]`
      )
    );

    markdownContent += `## ${criterion.id}: [${criterion.area} > ${criterion.subarea}]\n\n`;
    markdownContent += `${criterion.description}\n\n`;

    // Check if we have PR evidence
    const hasPrEvidence = criterion.count > 0;

    // Check if we have review evidence
    const hasReviewEvidence =
      reviewEvidence[criterion.id] &&
      reviewEvidence[criterion.id].reviewEvidence &&
      reviewEvidence[criterion.id].reviewEvidence.length > 0;

    // If no evidence from either source
    if (!hasPrEvidence && !hasReviewEvidence) {
      console.log(chalk.bold.yellow(`No evidence found for this criterion.`));

      // Check if this criterion is detectable from PR data
      if (criterion.prDetectable) {
        markdownContent += `**Potential Area for Improvement**: No evidence found for this criterion in PRs or reviews.\n\n`;
      } else {
        markdownContent += `**Not Detectable from PR Data**: This criterion typically requires direct observation or feedback and may not be evident in PR activity.\n\n`;
      }

      markdownContent += "---\n\n";
      continue;
    }

    // Prepare evidence for Claude
    let prEvidenceText = "";
    if (hasPrEvidence) {
      prEvidenceText = criterion.evidence
        .map((e) => {
          return `PR: ${e.repo}#${e.pr_number} - ${e.pr_title}\nEvidence: ${e.evidence}`;
        })
        .join("\n\n");
    } else {
      prEvidenceText = "No PR evidence available.";
    }

    // Prepare review evidence
    let reviewEvidenceText = "";
    if (hasReviewEvidence) {
      reviewEvidenceText = reviewEvidence[criterion.id].reviewEvidence
        .map((e) => {
          return `${e.source}:\n${e.evidence}`;
        })
        .join("\n\n");
    } else {
      reviewEvidenceText = "No review evidence available.";
    }

    // Get user context from config
    const userContext =
      config.user_context ||
      "I am a senior developer content in my job with a great manager that supports me.";

    const prompt = `You are an expert reviewer helping to prepare evidence for an annual performance review for a developer with the following context:

${userContext}

Below is evidence from GitHub pull requests and performance reviews that match criterion ${criterion.id}:

${criterion.area} > ${criterion.subarea}: ${criterion.description}

----

PR Evidence:
${prEvidenceText}

----

Review Evidence:
${reviewEvidenceText}

----

Based on this evidence, create 3-5 concise, specific bullet points that summarize the key accomplishments and behaviors demonstrated. Write in DIRECT, INFORMAL language using action verbs without pronouns (no "I", "my", "the engineer", etc.). Start each bullet with a strong action verb. Focus on concrete examples and impact. Each bullet point should be 1-2 sentences maximum. Be specific about what was done and its value. Give more weight to recent performance reviews than older ones.`;

    try {
      const completion = await anthropic.messages.create({
        model: "claude-opus-4-20250514",
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });

      const summary = completion.content[0].text.trim();

      console.log(
        chalk.bold.cyan(
          `\n${criterion.id}: [${criterion.area} > ${criterion.subarea}]`
        )
      );
      console.log(chalk.white(criterion.description));
      console.log(chalk.dim("─".repeat(80)));
      console.log(chalk.green(summary));
      console.log();

      markdownContent += summary + "\n\n";
      markdownContent += "---\n\n";
    } catch (error) {
      const errorMsg = `Error generating summary for criterion ${criterion.id}: ${error.message}`;
      console.error(chalk.red(errorMsg));
      markdownContent += `**${errorMsg}**\n\n`;
      markdownContent += "---\n\n";
    }
  }

  // Save report to file
  fs.writeFileSync(reportFilename, markdownContent);

  // Generate AI summary if requested
  if (process.argv.includes("--ai-summary")) {
    await generateAISummary(grouped, reviewEvidence, config);
  }

  return reportFilename;
}

// Generate AI summary of evidence
async function generateAISummary(grouped, reviewEvidence, config) {
  const anthropic = new Anthropic({
    apiKey: config.anthropic_api_key,
  });

  if (!anthropic) {
    console.error(chalk.red("Error: Anthropic API client not initialized"));
    return null;
  }

  const userContext =
    config.user_context ||
    "I am a senior developer content in my job with a great manager that supports me.";

  // Prepare the evidence for each criterion
  const criteriaEvidence = {};
  Object.values(grouped).forEach((criterion) => {
    criteriaEvidence[criterion.id] = {
      id: criterion.id,
      area: criterion.area,
      subarea: criterion.subarea,
      description: criterion.description,
      prEvidence:
        criterion.count > 0
          ? criterion.evidence
              .map(
                (e) =>
                  `PR: ${e.repo}#${e.pr_number} - ${e.pr_title}\nEvidence: ${e.evidence}`
              )
              .join("\n\n")
          : "No PR evidence available.",
      reviewEvidence:
        reviewEvidence[criterion.id]?.reviewEvidence?.length > 0
          ? reviewEvidence[criterion.id].reviewEvidence
              .map((e) => `${e.source}:\n${e.evidence}`)
              .join("\n\n")
          : "No review evidence available.",
    };
  });

  // Create the prompt
  const prompt = `You are an expert reviewer helping with an annual performance review for a developer with the following context:
${userContext}

Based on the evidence provided from both PR analysis and performance reviews, generate a comprehensive summary of the developer's performance across different criteria. Focus on concrete examples and achievements.

Evidence by criterion:
${Object.values(criteriaEvidence)
  .map(
    (c) =>
      `${c.id}. ${c.area} > ${c.subarea}: ${c.description}\n\n` +
      `PR Evidence:\n${c.prEvidence}\n\n` +
      `Review Evidence:\n${c.reviewEvidence}`
  )
  .join("\n\n---\n\n")}

Provide a well-structured summary that highlights strengths, areas for improvement, and specific accomplishments. Include recommendations for future growth based on the evidence. Give more weight to recent performance reviews than older ones.`;

  console.log(chalk.yellow("Generating AI summary..."));

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 4000,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });

    const summaryFilename = getTimestampedFilename("ai_summary");
    const summaryContent = `# AI-Generated Performance Summary\n\n${response.content[0].text}`;
    fs.writeFileSync(summaryFilename, summaryContent);

    console.log(chalk.green(`\nAI Summary saved to: ${summaryFilename}`));
    return response.content[0].text;
  } catch (error) {
    console.error(chalk.red(`Error generating AI summary: ${error.message}`));
    return null;
  }
}

// Main function
async function main() {
  try {
    // Load config
    const config = loadConfig();

    // Load criteria
    const criteria = loadCriteria();

    // Load processed PRs
    if (!fs.existsSync(PROCESSED_PATH)) {
      console.error(
        chalk.red(
          `Error: Missing processed PR data at ${PROCESSED_PATH}. Please run sync.js first.`
        )
      );
      process.exit(1);
    }

    const processedPRsData = JSON.parse(
      fs.readFileSync(PROCESSED_PATH, "utf8")
    );
    const processedPRs = Array.isArray(processedPRsData)
      ? processedPRsData
      : [];

    if (!Array.isArray(processedPRs)) {
      console.error(chalk.red(`Error: Processed PR data is not an array.`));
      process.exit(1);
    }

    // Load and analyze review files
    const reviews = reviewAnalyzer.loadReviewFiles();
    const reviewEvidence = reviewAnalyzer.analyzeReviewContent(
      reviews,
      criteria
    );

    console.log(chalk.blue(`Loaded ${processedPRs.length} processed PRs`));
    console.log(chalk.blue(`Loaded ${Object.keys(criteria).length} criteria`));
    console.log(
      chalk.blue(
        `Analyzed ${
          reviews.employee.length + reviews.manager.length
        } review files`
      )
    );

    // Group PRs by criteria
    const grouped = groupByCriteria(processedPRs, criteria);

    // Generate report
    const reportFilename = await generateReport(
      grouped,
      reviewEvidence,
      config
    );

    console.log(chalk.green(`\nReport saved to: ${reportFilename}`));
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  process.exit(1);
});
