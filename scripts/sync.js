#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Octokit } = require("octokit");
const csvParse = require("csv-parse/sync");
const { Anthropic } = require("@anthropic-ai/sdk");
const JiraClient = require("jira-client");
const pino = require("pino");

// Configure Pino logger
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
  level: "debug", // Set to 'info' for less verbose output
});

// Paths
const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const CRITERIA_PATH = path.join(__dirname, "..", "criteria.csv");
const DATA_DIR = path.join(__dirname, "..", "data");
const PROCESSED_PATH = path.join(DATA_DIR, "processed-prs.json");

// Extract components/domains from file paths
function extractComponents(filePaths) {
  // Initialize components object
  const components = {};
  const pathDepths = {}; // Track the max depth for each path prefix

  // Process each file path to find meaningful components
  filePaths.forEach((filePath) => {
    // Skip empty paths
    if (!filePath) return;

    // Split the path into segments
    const segments = filePath.split("/");

    // Skip files at the root level
    if (segments.length <= 1) {
      if (!components["root"]) components["root"] = 0;
      components["root"]++;
      return;
    }

    // Track all possible path combinations with their depths
    // This helps us find the most specific/deepest components
    for (let i = 1; i <= segments.length - 1; i++) {
      const pathPrefix = segments.slice(0, i).join("/");
      if (!pathDepths[pathPrefix] || i > pathDepths[pathPrefix]) {
        pathDepths[pathPrefix] = i;
      }

      // Count occurrences of each path prefix
      if (!components[pathPrefix]) components[pathPrefix] = 0;
      components[pathPrefix]++;
    }

    // Handle special cases for common project structures

    // 1. Frontend component directories
    const frontendPatterns = [
      { base: "src/components", depth: 3 },
      { base: "app/components", depth: 3 },
      { base: "src/pages", depth: 3 },
      { base: "src/views", depth: 3 },
      { base: "src/containers", depth: 3 },
      { base: "src/features", depth: 3 },
      { base: "components", depth: 2 },
    ];

    frontendPatterns.forEach((pattern) => {
      const baseSegments = pattern.base.split("/");
      const matchIndex = segments.findIndex((seg, i) => {
        if (i + baseSegments.length > segments.length) return false;
        return baseSegments.every((baseSeg, j) => segments[i + j] === baseSeg);
      });

      if (
        matchIndex >= 0 &&
        segments.length > matchIndex + baseSegments.length
      ) {
        // Get the component name (next segment after the pattern)
        const componentName = segments
          .slice(matchIndex, matchIndex + baseSegments.length + 1)
          .join("/");
        if (!components[componentName]) components[componentName] = 0;
        components[componentName] += 2; // Give higher weight to component directories
      }
    });

    // 2. Backend component directories
    const backendPatterns = [
      "controllers",
      "routes",
      "models",
      "services",
      "api",
      "middleware",
    ];

    backendPatterns.forEach((pattern) => {
      const index = segments.findIndex((s) => s === pattern);
      if (index >= 0 && index < segments.length - 1) {
        // Get the component with its child (e.g., controllers/users)
        const componentPath = segments.slice(index, index + 2).join("/");
        if (!components[componentPath]) components[componentPath] = 0;
        components[componentPath] += 2; // Give higher weight to backend components
      }
    });

    // 3. Capture full file path for specific file types that indicate important components
    const significantFileExtensions = [
      ".component.ts",
      ".component.js",
      ".controller.ts",
      ".controller.js",
      ".service.ts",
      ".service.js",
    ];
    const lastSegment = segments[segments.length - 1];

    if (significantFileExtensions.some((ext) => lastSegment.endsWith(ext))) {
      // For component files, capture the directory they're in
      const dirPath = segments.slice(0, segments.length - 1).join("/");
      if (!components[dirPath]) components[dirPath] = 0;
      components[dirPath] += 3; // Give even higher weight to directories with component files
    }
  });

  // Prioritize deeper paths and more frequent occurrences
  const weightedComponents = Object.entries(components).map(([path, count]) => {
    const depth = (path.match(/\//g) || []).length + 1; // Count segments
    const weight = count * (depth * 0.5); // Weight by depth and frequency
    return { path, count, depth, weight };
  });

  // Sort by weight and return top 10 (more than before to capture deeper paths)
  return weightedComponents
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map(({ path, count, depth }) => ({ name: path, count, depth }));
}

// Load config and get user context
function loadConfig() {
  logger.debug(`Loading config from ${CONFIG_PATH}`);
  if (!fs.existsSync(CONFIG_PATH)) {
    logger.error(`Config file not found at ${CONFIG_PATH}`);
    throw new Error("Missing config.json");
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  // Set default dry_run to true if not specified
  if (config.dry_run === undefined) {
    config.dry_run = true;
    logger.info("dry_run not specified in config, defaulting to true");
  }
  logger.debug(
    { repos: config.repos, dry_run: config.dry_run },
    "Config loaded successfully"
  );
  return config;
}

function loadCriteria() {
  logger.debug(`Loading criteria from ${CRITERIA_PATH}`);
  const csv = fs.readFileSync(CRITERIA_PATH, "utf8");
  const allCriteria = csvParse.parse(csv, {
    columns: true,
    skip_empty_lines: true,
  });
  
  // Filter criteria based on pr_detectable field
  const prDetectableCriteria = allCriteria.filter(criterion => 
    criterion.pr_detectable && 
    (criterion.pr_detectable.toLowerCase() === 'true' || criterion.pr_detectable === '1')
  );
  
  logger.debug(`Loaded ${allCriteria.length} total criteria, ${prDetectableCriteria.length} PR-detectable`);
  return prDetectableCriteria;
}

function loadProcessedPRs() {
  logger.debug(`Loading processed PRs from ${PROCESSED_PATH}`);
  if (!fs.existsSync(PROCESSED_PATH)) {
    logger.info(`No existing processed PRs file found at ${PROCESSED_PATH}`);
    return {};
  }
  const processed = JSON.parse(fs.readFileSync(PROCESSED_PATH, "utf8"));
  const repoCount = Object.keys(processed).length;
  const prCount = Object.values(processed).reduce(
    (sum, prs) => sum + prs.length,
    0
  );
  logger.info(`Loaded ${prCount} processed PRs across ${repoCount} repos`);
  return processed;
}

function saveProcessedPRs(processed) {
  logger.debug(`Saving processed PRs to ${PROCESSED_PATH}`);
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify(processed, null, 2));
  const repoCount = Object.keys(processed).length;
  const prCount = Object.values(processed).reduce(
    (sum, prs) => sum + prs.length,
    0
  );
  logger.info(`Saved ${prCount} processed PRs across ${repoCount} repos`);
}

async function callClaude({
  pr,
  comments,
  filenames,
  criteria,
  jiraInfo,
  anthropicApiKey,
  userContext,
  components,
  claude_model,
}) {
  logger.debug(
    { pr: { number: pr.number, title: pr.title } },
    "Calling Claude for PR analysis"
  );
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Extract file extensions to help with tech stack identification
  const fileExtensions = filenames
    .split("\n")
    .map((file) => {
      const parts = file.split(".");
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : "";
    })
    .filter((ext) => ext)
    .reduce((acc, ext) => {
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {});

  // Get top 5 file extensions
  const topExtensions = Object.entries(fileExtensions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext, count]) => `${ext} (${count})`)
    .join(", ");

  const prompt = `You are an expert reviewer helping a developer with the following context:

${userContext}

You need to analyze a GitHub pull request and match it against specific criteria. Be thorough in your analysis and look for concrete evidence in the PR details, file paths, components, and Jira information.

---
PR DETAILS
Title: ${pr.title}
Description: ${pr.body || "No description provided"}

Comments: 
${comments || "No comments"}

File Types: ${topExtensions}

Changed Files:
${filenames}

Components: ${JSON.stringify(components)}

---
JIRA TICKET INFO:
${jiraInfo || "None"}

---
REVIEW CRITERIA:
${criteria
  .map(
    (c) =>
      `${c.criterion_id}: [${c.area_of_concentration} > ${c.subarea}] ${c.description}`
  )
  .join("\n")}

---
INSTRUCTIONS:
1. Carefully analyze the PR details, file paths, components, and Jira information
2. Look for evidence of the developer demonstrating skills related to ANY of the criteria
3. Even if the evidence is subtle, identify matches when they exist
4. Consider these common patterns that might match criteria:
   - Bug fixes often demonstrate debugging skills (criteria 5-6)
   - Code with tests shows quality focus (criteria 3-4)
   - Complex PRs with many components may show architecture skills (criteria 7-8)
   - PRs with security fixes match security criteria (criterion 9)
   - PRs with mentoring in comments match staff engineer criteria (criteria 1-2)
5. Assign a confidence score (0-100) for each match
6. Try to find at least one matching criterion if possible
7. Return up to 3 of the strongest matches

Reply in this exact JSON format:
{
  "matches": [
    {
      "criterion_id": "<id>",
      "confidence": <score 0-100>,
      "evidence": "<detailed explanation with specific evidence>"
    },
    ...
  ]
}

If no criteria match, return an empty array for matches: {"matches": []}`;

  // Ensure the model name is valid
  const modelToUse = claude_model.endsWith('-0') ? claude_model : claude_model + '-0';
  logger.info(`Using Claude model: ${modelToUse}`);
  
  // Increase max_tokens to allow for more detailed analysis
  const completion = await anthropic.messages.create({
    model: modelToUse,
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });
  // Log the raw response from Claude for debugging
  logger.info({
    raw_response: completion.content[0].text.substring(0, 500) + "...", // Truncate for readability
    model: claude_model
  }, "Raw Claude response (truncated)");
  
  // Try to parse JSON from Claude's output
  let matches = [];
  try {
    // Clean up the response text to handle potential formatting issues
    let responseText = completion.content[0].text.trim();
    
    // Try to extract JSON if it's embedded in other text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/m);
    if (jsonMatch) {
      responseText = jsonMatch[0];
      logger.debug("Extracted JSON from response text");
    }
    
    logger.debug({ responseText: responseText.substring(0, 500) + "..." }, "Attempting to parse JSON");
    
    const response = JSON.parse(responseText);
    logger.debug({ response }, "Successfully parsed Claude response");

    // Validate response format
    if (response && Array.isArray(response.matches)) {
      matches = response.matches;
      logger.info({ matchCount: matches.length }, "Found matches in Claude response");
    } else if (response && response.criterion_id) {
      // Handle old format for backward compatibility
      matches = [
        {
          criterion_id: response.criterion_id,
          confidence: 100,
          evidence: response.evidence,
        },
      ];
      logger.info("Found match in old format");
    } else {
      logger.warn({ response: JSON.stringify(response).substring(0, 200) }, "Unexpected response format from Claude");
      matches = [];
    }
  } catch (e) {
    logger.warn(
      { error: e.message, response: completion.content[0].text.substring(0, 500) },
      "Failed to parse Claude response"
    );
    matches = [];
  }
  return matches;
}

async function main() {
  logger.info("Starting GitHub PR analysis");
  const config = loadConfig();
  const criteria = loadCriteria();
  const processed = loadProcessedPRs();

  // Log user context if available
  if (config.user_context) {
    logger.info(`Context: ${config.user_context}`);
  }

  logger.debug("Initializing GitHub client");
  const octokit = new Octokit({ auth: config.github_token });

  // Get authenticated user's login
  let myLogin = null;
  try {
    logger.debug("Getting authenticated user");
    const me = await octokit.rest.users.getAuthenticated();
    myLogin = me.data.login;
    logger.info(`Authenticated as ${myLogin}`);
  } catch (e) {
    logger.error({ error: e.message }, "Failed to get authenticated user");
    process.exit(1);
  }

  for (const repo of config.repos) {
    logger.info(`Processing repo: ${repo}`);
    const [owner, repoName] = repo.split("/");
    if (!processed[repo]) processed[repo] = [];
    // Calculate date 1 year ago
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    logger.debug(`Filtering PRs merged after ${oneYearAgo.toISOString()}`);

    logger.debug("Fetching PRs from GitHub");
    let prs = (
      await octokit.paginate(octokit.rest.pulls.list, {
        owner,
        repo: repoName,
        state: "closed", // only closed PRs
        per_page: 100,
      })
    ).filter((pr) => {
      // Only include PRs that are merged and merged within the last year
      return (
        pr.state === "closed" &&
        pr.merged_at &&
        new Date(pr.merged_at) > oneYearAgo
      );
    });

    logger.info(`Found ${prs.length} PRs merged within the last year`);

    // Sort by most recently merged and limit to 5 for dry run
    prs = prs.sort((a, b) => new Date(b.merged_at) - new Date(a.merged_at));
    if (config.dry_run) {
      const originalCount = prs.length;
      prs = prs.slice(0, 5); // most recent 5 merged PRs for dry run
      logger.info(
        `DRY RUN: Limited to ${prs.length} most recent PRs (from ${originalCount})`
      );
    }
    // Set up Jira client if config present
    let jira = null;
    if (config.jira_host && config.jira_email && config.jira_api_token) {
      logger.debug(`Initializing Jira client for ${config.jira_host}`);
      jira = new JiraClient({
        protocol: "https",
        host: config.jira_host.replace(/^https?:\/\//, ""),
        username: config.jira_email,
        password: config.jira_api_token,
        apiVersion: "3",
        strictSSL: true,
      });
    }

    // Regex for Jira ticket keys (e.g., ABC-123)
    const jiraKeyRegex = /([A-Z][A-Z0-9]+-\d+)/g;
    logger.debug("Starting PR processing loop");

    for (const pr of prs) {
      logger.debug(
        { pr: { number: pr.number, title: pr.title, merged_at: pr.merged_at } },
        "Processing PR"
      );
      // Check if this PR is already processed (by pr_number in processed[repo])
      if (Array.isArray(processed[repo])) {
        const existingPRIndex = processed[repo].findIndex(
          (p) => p.pr_number === pr.number
        );
        if (existingPRIndex !== -1) {
          // Add merged_at if it's missing in the existing PR
          if (!processed[repo][existingPRIndex].merged_at && pr.merged_at) {
            logger.info(
              `[${repo}#${pr.number}] Adding missing merged_at date to existing PR`
            );
            processed[repo][existingPRIndex].merged_at = pr.merged_at;
          } else {
            logger.info(`[${repo}#${pr.number}] Skipped: already processed`);
          }
          continue;
        }
      }
      // Fetch comments
      logger.debug(`Fetching comments for PR #${pr.number}`);
      const commentsResp = await octokit.rest.issues.listComments({
        owner,
        repo: repoName,
        issue_number: pr.number,
        per_page: 100,
      });
      const commentsArr = commentsResp.data;
      const comments = commentsArr.map((c) => c.body || "").join("\n");
      logger.debug(`Found ${commentsArr.length} comments`);
      // Only process PRs we interacted with
      const interacted =
        (pr.user && pr.user.login === myLogin) ||
        commentsArr.some((c) => c.user && c.user.login === myLogin);
      if (!interacted) {
        logger.info(
          `[${repo}#${pr.number}] Skipped: no interaction by ${myLogin}`
        );
        // Still track skipped PRs to avoid reprocessing them
        if (!processed[repo] || !Array.isArray(processed[repo]))
          processed[repo] = [];
        processed[repo].push({
          pr_number: pr.number,
          pr_title: pr.title,
          merged_at: pr.merged_at, // Save the merge date for skipped PRs too
          skipped: true,
          reason: `No interaction by ${myLogin}`,
        });
        continue;
      }
      logger.debug(`User ${myLogin} interacted with PR #${pr.number}`);
      // Fetch files
      logger.debug(`Fetching files for PR #${pr.number}`);
      const filesResp = await octokit.rest.pulls.listFiles({
        owner,
        repo: repoName,
        pull_number: pr.number,
        per_page: 100,
      });
      const filenames = filesResp.data.map((f) => f.filename).join("\n");

      // Extract component/domain information from file paths
      const filePathsArray = filesResp.data.map((f) => f.filename);
      const components = extractComponents(filePathsArray);
      logger.debug(
        { components },
        `Extracted components from PR #${pr.number}`
      );

      // Calculate PR duration (time between creation and merge)
      const prCreatedAt = new Date(pr.created_at);
      const prMergedAt = new Date(pr.merged_at);
      const prDurationDays = Math.round(
        (prMergedAt - prCreatedAt) / (1000 * 60 * 60 * 24)
      );
      logger.debug(`PR #${pr.number} was open for ${prDurationDays} days`);

      // Get PR size metrics
      const prAdditions = pr.additions || 0;
      const prDeletions = pr.deletions || 0;
      const prChangedFiles = pr.changed_files || filesResp.data.length;
      logger.debug(
        `PR #${pr.number} changed ${prChangedFiles} files with +${prAdditions}/-${prDeletions} lines`
      );
      logger.debug(`Found ${filesResp.data.length} changed files`);
      // Extract Jira ticket key from PR title or description
      let jiraInfo = "";
      let jiraKey = null;
      // Initialize Jira fields with defaults
      let status = "";
      let summary = "";
      let description = "";
      let issueType = "";
      let priority = "";

      const textToSearch = `${pr.title}\n${pr.body || ""}`;
      const matches = textToSearch.match(jiraKeyRegex);
      logger.debug({ matches }, "Searching for Jira ticket keys");
      if (jira && matches && matches.length > 0) {
        jiraKey = matches[0];
        logger.info(`Found Jira ticket ${jiraKey} for PR #${pr.number}`);
        try {
          logger.debug(`Fetching Jira issue ${jiraKey}`);
          const issue = await jira.findIssue(jiraKey);

          // Basic issue info
          status = issue.fields.status ? issue.fields.status.name : "";
          summary = issue.fields.summary || "";
          description = issue.fields.description || "";
          issueType = issue.fields.issuetype ? issue.fields.issuetype.name : "";
          priority = issue.fields.priority ? issue.fields.priority.name : "";

          // Assignee info
          const assignee = issue.fields.assignee
            ? `${issue.fields.assignee.displayName} (${issue.fields.assignee.emailAddress})`
            : "Unassigned";

          // All comments
          const commentsArr =
            (issue.fields.comment && issue.fields.comment.comments) || [];
          const comments = commentsArr
            .map(
              (c) =>
                `${c.author.displayName} (${new Date(
                  c.created
                ).toISOString()}): ${c.body}`
            )
            .join("\n\n");

          // Build comprehensive Jira info
          jiraInfo =
            `Key: ${jiraKey}
` +
            `Type: ${issueType}
` +
            `Priority: ${priority}
` +
            `Status: ${status}
` +
            `Summary: ${summary}
` +
            `Assignee: ${assignee}
` +
            `\n--- Description ---\n${description}\n` +
            `\n--- Comments (${commentsArr.length}) ---\n${comments}`;

          // For logging, just show a summary
          const logInfo = {
            jiraKey,
            summary,
            status,
            issueType,
            priority,
            commentCount: commentsArr.length,
          };
          logger.debug(
            { jiraKey, summary, status },
            "Jira issue details fetched"
          );
        } catch (e) {
          logger.warn(
            { jiraKey, error: e.message },
            "Failed to fetch Jira issue"
          );
          jiraInfo = `Key: ${jiraKey}\nError: ${e.message}`;
        }
      }
      // Call Claude to get best-matching criterion
      let evidence = [];
      try {
        logger.info(`Calling Claude to analyze PR #${pr.number}`);
        evidence = await callClaude({ 
          pr, 
          comments, 
          filenames, 
          criteria, 
          jiraInfo, 
          anthropicApiKey: config.anthropic_api_key, 
          userContext: config.user_context || 'I am a senior developer content in my job with a great manager that supports me.',
          components,
          claude_model: config.claude_model || 'claude-sonnet-4'
        });
        logger.debug({ evidence }, 'Claude analysis complete');
      } catch (e) {
        logger.error({ error: e.message }, 'Claude API call failed');
        evidence = []; // Initialize as empty array instead of object
      }
      // Save evidence per PR with enhanced information
      if (!processed[repo] || !Array.isArray(processed[repo]))
        processed[repo] = [];
      processed[repo].push({
        // Basic PR info
        pr_number: pr.number,
        pr_title: pr.title,
        pr_url: pr.html_url,
        merged_at: pr.merged_at,
        created_at: pr.created_at,

        // PR metrics
        duration_days: prDurationDays,
        additions: prAdditions,
        deletions: prDeletions,
        changed_files: prChangedFiles,

        // Component/domain analysis
        components: components,

        // Evidence and Jira data
        evidence,
        jira_key: jiraKey || "",
        jira_status: status || "",
        jira_type: issueType || "",
        jira_priority: priority || "",
      });
      const criteriaIds = Array.isArray(evidence)
        ? evidence.map((e) => e.criterion_id).join(", ")
        : "";
      logger.info(
        `[${repo}#${pr.number}] Processed: ${pr.title} | Criteria: ${
          criteriaIds || "None"
        }`
      );
      logger.debug(
        { pr: { number: pr.number, title: pr.title }, evidence },
        "PR processing complete"
      );
    }
  }
  if (!config.dry_run) {
    saveProcessedPRs(processed);
  } else {
    logger.info("DRY RUN: Results would be saved as follows:");
    logger.info({ processed }, "Processed PRs (dry run)");
  }
  logger.info("GitHub PR analysis complete");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
