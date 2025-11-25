#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const readline = require("readline");
const { Anthropic } = require("@anthropic-ai/sdk");
const clipboardy = require("clipboardy");

// Paths
const SLACK_EVIDENCE_PATH = path.join(__dirname, "..", "data", "slack-evidence.json");
const CRITERIA_PATH = path.join(__dirname, "..", "criteria.csv");
const REPORTS_DIR = path.join(__dirname, "..", "reports");

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

// Load config
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
    };
  }

  return criteria;
}

// Load existing Slack evidence
function loadSlackEvidence() {
  if (!fs.existsSync(SLACK_EVIDENCE_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(SLACK_EVIDENCE_PATH, "utf8"));
  } catch (error) {
    console.error(chalk.red(`Error loading Slack evidence: ${error.message}`));
    return [];
  }
}

// Save Slack evidence
function saveSlackEvidence(evidence) {
  try {
    fs.writeFileSync(SLACK_EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
    console.log(chalk.green(`Slack evidence saved to: ${SLACK_EVIDENCE_PATH}`));
  } catch (error) {
    console.error(chalk.red(`Error saving Slack evidence: ${error.message}`));
  }
}

// Ask a question and get user input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(chalk.bold(question) + " ", (answer) => {
      resolve(answer.trim());
    });
  });
}

// Ask for multiline input (for message text)
function askMultilineQuestion(question) {
  return new Promise((resolve) => {
    console.log(chalk.bold(question));
    console.log(chalk.dim("(Press Ctrl+D when finished, or type 'END' on a new line)"));
    
    let input = "";
    const stdin = process.stdin;
    
    stdin.setEncoding('utf8');
    stdin.on('readable', () => {
      let chunk;
      while ((chunk = stdin.read()) !== null) {
        input += chunk;
        
        // Check if user typed 'END' on a new line
        if (input.trim().endsWith('\nEND') || input.trim() === 'END') {
          input = input.replace(/\nEND$/, '').replace(/^END$/, '');
          stdin.pause();
          resolve(input.trim());
          return;
        }
      }
    });
    
    stdin.on('end', () => {
      resolve(input.trim());
    });
  });
}

// Analyze a screenshot of a Slack message using Claude's vision API
async function analyzeScreenshot(imagePath, config) {
  try {
    if (!config.anthropic_api_key) {
      console.log(chalk.yellow("No Anthropic API key found. Cannot analyze screenshot."));
      return null;
    }

    if (!fs.existsSync(imagePath)) {
      console.error(chalk.red(`Image file not found: ${imagePath}`));
      return null;
    }

    console.log(chalk.blue("Reading image file..."));
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Determine media type from file extension
    const ext = path.extname(imagePath).toLowerCase();
    const mediaTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const mediaType = mediaTypes[ext] || 'image/png';

    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

    // Load criteria for context
    const criteria = loadCriteria();
    const criteriaList = Object.values(criteria).map(c =>
      `${c.id}: ${c.area} > ${c.subarea} - ${c.description}`
    ).join("\n");

    const prompt = `You are analyzing a screenshot of a Slack message for a performance review evidence collection system.

Please analyze this Slack screenshot and extract the following information:

1. **Message Author**: The name/username of the person who sent the message
2. **Message Date/Time**: When the message was sent
3. **Channel/Thread**: The channel name or thread context
4. **Message Text**: The complete text content of the message(s) in the screenshot
5. **Reactions**: Any emoji reactions or responses visible
6. **Title**: A clear, concise title (2-8 words) that captures the main achievement or contribution shown
7. **Description**: A description (1-3 sentences) explaining the impact and context of what's shown
8. **Performance Criterion**: The most relevant performance criterion ID from the list below
9. **Slack Link Hint**: If you can see any part of a URL or workspace name, extract it

Available Performance Criteria:
${criteriaList}

Please respond in JSON format:
{
  "author": "Name of message author",
  "timestamp": "Date/time of message",
  "channel": "Channel or thread name",
  "message_text": "Complete message content",
  "reactions": "Description of reactions if any",
  "title": "Brief title of the achievement",
  "description": "Description explaining the impact and context",
  "criterion_id": "most_relevant_criterion_id",
  "confidence": 0.85,
  "slack_url_hint": "any URL fragments visible"
}

Focus on identifying concrete achievements, problem-solving, collaboration, kudos, or impact demonstrated in the message.`;

    console.log(chalk.blue("Analyzing screenshot with Claude Vision API..."));

    const modelToUse = config.claude_model || "claude-3-5-sonnet-20241022";
    console.log(chalk.dim(`Using model: ${modelToUse}`));

    const completion = await anthropic.messages.create({
      model: modelToUse,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: prompt
          }
        ],
      }],
    });

    const response = completion.content[0].text.trim();

    // Try to parse JSON response
    try {
      const analysis = JSON.parse(response);
      return analysis;
    } catch (parseError) {
      console.error(chalk.red("Failed to parse AI response as JSON"));
      console.log(chalk.dim("Response:", response.substring(0, 200)));
      return null;
    }

  } catch (error) {
    console.error(chalk.red(`Error analyzing screenshot: ${error.message}`));
    if (error.message.includes('model')) {
      console.error(chalk.yellow(`\nHint: Check that your claude_model in config.json is a valid model ID.`));
      console.error(chalk.yellow(`Valid models include: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022`));
    }
    return null;
  }
}

// Extract title, description, and criteria from message text using AI
async function analyzeMessageText(messageText, config) {
  try {
    if (!config.anthropic_api_key) {
      console.log(chalk.yellow("No Anthropic API key found. Manual input required."));
      return null;
    }

    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });
    
    // Load criteria for context
    const criteria = loadCriteria();
    const criteriaList = Object.values(criteria).map(c => 
      `${c.id}: ${c.area} > ${c.subarea} - ${c.description}`
    ).join("\n");

    const prompt = `You are analyzing a Slack message for a performance review evidence collection system. 

Please analyze the following Slack message and extract:
1. A clear, concise title (2-8 words) that captures the main achievement or contribution
2. A description (1-3 sentences) that explains the impact and context
3. The most relevant performance criterion ID from the list below

Available Performance Criteria:
${criteriaList}

Slack Message:
${messageText}

Please respond in JSON format:
{
  "title": "Brief title of the achievement",
  "description": "Description explaining the impact and context",
  "criterion_id": "most_relevant_criterion_id",
  "confidence": 0.85
}

Focus on identifying concrete achievements, problem-solving, collaboration, or impact demonstrated in the message.`;

    const completion = await anthropic.messages.create({
      model: config.claude_model || "claude-3-5-haiku-20241022",
      max_tokens: 1000,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });

    const response = completion.content[0].text.trim();
    
    // Try to parse JSON response
    try {
      const analysis = JSON.parse(response);
      return analysis;
    } catch (parseError) {
      console.error(chalk.red("Failed to parse AI response as JSON"));
      return null;
    }
    
  } catch (error) {
    console.error(chalk.red(`Error analyzing message: ${error.message}`));
    return null;
  }
}

// Generate timestamped filename for image
function generateImageFilename(title) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split(".")[0];
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  return `slack_${timestamp}_${safeTitle}.png`;
}

// Add new Slack evidence from screenshot
async function addSlackEvidenceFromScreenshot() {
  console.log(chalk.bold.blue("\n=== ADD SLACK EVIDENCE FROM SCREENSHOT ===\n"));
  console.log(chalk.dim("Tip: Take a screenshot of the Slack message and save it, then provide the path"));
  console.log(chalk.dim("Or on macOS: take screenshot (Cmd+Shift+4), then drag the file path here\n"));

  const config = loadConfig();
  const evidence = loadSlackEvidence();

  // Get screenshot path
  const screenshotPath = await askQuestion("Enter the path to the screenshot image (or drag & drop the file):");

  if (!screenshotPath.trim()) {
    console.log(chalk.yellow("No screenshot path provided. Exiting."));
    return;
  }

  // Clean up the path (remove quotes if dragged & dropped)
  const cleanPath = screenshotPath.trim().replace(/^["']|["']$/g, '');

  if (!fs.existsSync(cleanPath)) {
    console.log(chalk.red(`File not found: ${cleanPath}`));
    return;
  }

  // Analyze screenshot with AI
  const analysis = await analyzeScreenshot(cleanPath, config);

  if (!analysis) {
    console.log(chalk.red("Failed to analyze screenshot. Please try manual entry instead."));
    return;
  }

  // Display extracted information
  console.log(chalk.green("\n📸 Screenshot Analysis Results:\n"));
  console.log(chalk.white(`Author: ${analysis.author || 'Not found'}`));
  console.log(chalk.white(`Date/Time: ${analysis.timestamp || 'Not found'}`));
  console.log(chalk.white(`Channel: ${analysis.channel || 'Not found'}`));
  console.log(chalk.white(`Reactions: ${analysis.reactions || 'None'}`));
  console.log(chalk.white(`\nMessage Text:\n${analysis.message_text || 'Not found'}`));
  console.log(chalk.white(`\nTitle: ${analysis.title}`));
  console.log(chalk.white(`Description: ${analysis.description}`));
  console.log(chalk.white(`Criterion: ${analysis.criterion_id} (confidence: ${analysis.confidence})`));

  const proceed = await askQuestion("\nUse this analysis? (y/n/edit):");

  let title, description, criterionId, slackLink, messageText;

  if (proceed.toLowerCase() === 'n' || proceed.toLowerCase() === 'no') {
    console.log(chalk.yellow("Analysis rejected. Exiting."));
    return;
  } else if (proceed.toLowerCase() === 'edit' || proceed.toLowerCase() === 'e') {
    // Allow editing
    console.log(chalk.blue("\nEdit the extracted information:"));
    title = await askQuestion(`Title [${analysis.title}]:`) || analysis.title;
    description = await askQuestion(`Description [${analysis.description}]:`) || analysis.description;
    criterionId = await askQuestion(`Criterion ID [${analysis.criterion_id}]:`) || analysis.criterion_id;
    slackLink = await askQuestion(`Slack link [${analysis.slack_url_hint || ''}]:`) || analysis.slack_url_hint || '';
    messageText = analysis.message_text;
  } else {
    // Use as-is
    title = analysis.title;
    description = analysis.description;
    criterionId = analysis.criterion_id;
    slackLink = analysis.slack_url_hint || '';
    messageText = analysis.message_text;
  }

  // Copy screenshot to data directory with timestamped name
  const imageName = generateImageFilename(title);
  const destPath = path.join(DATA_DIR, imageName);

  try {
    fs.copyFileSync(cleanPath, destPath);
    console.log(chalk.green(`\nScreenshot saved as: ${imageName}`));
  } catch (error) {
    console.error(chalk.red(`Error copying screenshot: ${error.message}`));
    return;
  }

  // Create evidence entry
  const evidenceEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    title: title.trim(),
    description: description.trim(),
    slack_link: slackLink.trim(),
    message_text: messageText || '',
    criterion_id: criterionId.trim(),
    screenshot_path: destPath,
    confidence: analysis.confidence || 1.0,
    author: analysis.author || '',
    message_timestamp: analysis.timestamp || '',
    channel: analysis.channel || '',
    reactions: analysis.reactions || '',
    source: 'screenshot_analysis',
  };

  // Add to evidence array
  evidence.push(evidenceEntry);

  // Save updated evidence
  saveSlackEvidence(evidence);

  console.log(chalk.green("\n✅ Slack evidence added successfully from screenshot!"));
  console.log(chalk.white(`ID: ${evidenceEntry.id}`));
  console.log(chalk.white(`Title: ${evidenceEntry.title}`));
  console.log(chalk.white(`Criterion: ${evidenceEntry.criterion_id}`));
  console.log(chalk.white(`Screenshot: ${imageName}`));
}

// Add new Slack evidence
async function addSlackEvidence() {
  console.log(chalk.bold.blue("\n=== ADD SLACK EVIDENCE ===\n"));
  
  const config = loadConfig();
  const evidence = loadSlackEvidence();
  
  // Get Slack link
  const slackLink = await askQuestion("Enter the Slack message link:");
  
  if (!slackLink.trim()) {
    console.log(chalk.yellow("No link provided. Exiting."));
    return;
  }
  
  // Get message text
  console.log();
  const messageText = await askMultilineQuestion("Paste the Slack message text:");
  
  if (!messageText.trim()) {
    console.log(chalk.yellow("No message text provided. Exiting."));
    return;
  }
  
  console.log(chalk.blue("\nAnalyzing message with AI..."));
  
  // Analyze message text with AI
  const analysis = await analyzeMessageText(messageText, config);
  
  let title, description, criterionId;
  
  if (analysis) {
    console.log(chalk.green("\nAI Analysis Results:"));
    console.log(chalk.white(`Title: ${analysis.title}`));
    console.log(chalk.white(`Description: ${analysis.description}`));
    console.log(chalk.white(`Criterion: ${analysis.criterion_id} (confidence: ${analysis.confidence})`));
    
    const useAnalysis = await askQuestion("\nUse this analysis? (y/n):");
    
    if (useAnalysis.toLowerCase() === 'y' || useAnalysis.toLowerCase() === 'yes') {
      title = analysis.title;
      description = analysis.description;
      criterionId = analysis.criterion_id;
    } else {
      // Manual input
      title = await askQuestion("Enter a title for this evidence:");
      description = await askQuestion("Enter a description:");
      criterionId = await askQuestion("Enter the criterion ID:");
    }
  } else {
    // Manual input when AI is not available
    console.log(chalk.yellow("\nAI analysis not available. Please provide details manually:"));
    title = await askQuestion("Enter a title for this evidence:");
    description = await askQuestion("Enter a description:");
    criterionId = await askQuestion("Enter the criterion ID:");
  }
  
  // Get screenshot path (optional)
  const hasScreenshot = await askQuestion("Do you have a screenshot to attach? (y/n):");
  let screenshotPath = null;
  
  if (hasScreenshot.toLowerCase() === 'y' || hasScreenshot.toLowerCase() === 'yes') {
    screenshotPath = await askQuestion("Enter the path to the screenshot image:");
    
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      // Copy screenshot to data directory with timestamped name
      const imageName = generateImageFilename(title);
      const destPath = path.join(DATA_DIR, imageName);
      
      try {
        fs.copyFileSync(screenshotPath, destPath);
        screenshotPath = destPath;
        console.log(chalk.green(`Screenshot saved as: ${imageName}`));
      } catch (error) {
        console.error(chalk.red(`Error copying screenshot: ${error.message}`));
        screenshotPath = null;
      }
    } else {
      console.log(chalk.yellow("Screenshot file not found or path not provided."));
      screenshotPath = null;
    }
  }
  
  // Create evidence entry
  const evidenceEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    title: title.trim(),
    description: description.trim(),
    slack_link: slackLink.trim(),
    message_text: messageText.trim(),
    criterion_id: criterionId.trim(),
    screenshot_path: screenshotPath,
    confidence: analysis ? analysis.confidence : 1.0,
  };
  
  // Add to evidence array
  evidence.push(evidenceEntry);
  
  // Save updated evidence
  saveSlackEvidence(evidence);
  
  console.log(chalk.green("\nSlack evidence added successfully!"));
  console.log(chalk.white(`ID: ${evidenceEntry.id}`));
  console.log(chalk.white(`Title: ${evidenceEntry.title}`));
  console.log(chalk.white(`Criterion: ${evidenceEntry.criterion_id}`));
}

// List existing Slack evidence
function listSlackEvidence() {
  const evidence = loadSlackEvidence();
  
  if (evidence.length === 0) {
    console.log(chalk.yellow("No Slack evidence found."));
    return;
  }
  
  console.log(chalk.bold.blue("\n=== SLACK EVIDENCE ===\n"));
  
  evidence.forEach((item, index) => {
    console.log(chalk.white(`${index + 1}. ${item.title}`));
    console.log(chalk.dim(`   ID: ${item.id}`));
    console.log(chalk.dim(`   Date: ${new Date(item.timestamp).toLocaleDateString()}`));
    console.log(chalk.dim(`   Criterion: ${item.criterion_id}`));
    console.log(chalk.dim(`   Link: ${item.slack_link}`));
    if (item.screenshot_path) {
      console.log(chalk.dim(`   Screenshot: ${path.basename(item.screenshot_path)}`));
    }
    console.log();
  });
}

// Delete Slack evidence by ID
async function deleteSlackEvidence() {
  const evidence = loadSlackEvidence();
  
  if (evidence.length === 0) {
    console.log(chalk.yellow("No Slack evidence to delete."));
    return;
  }
  
  listSlackEvidence();
  
  const idToDelete = await askQuestion("Enter the ID of the evidence to delete:");
  
  const itemIndex = evidence.findIndex(item => item.id === idToDelete);
  
  if (itemIndex === -1) {
    console.log(chalk.red("Evidence not found."));
    return;
  }
  
  const item = evidence[itemIndex];
  
  // Delete screenshot file if it exists
  if (item.screenshot_path && fs.existsSync(item.screenshot_path)) {
    try {
      fs.unlinkSync(item.screenshot_path);
      console.log(chalk.green("Screenshot file deleted."));
    } catch (error) {
      console.error(chalk.red(`Error deleting screenshot: ${error.message}`));
    }
  }
  
  // Remove from array
  evidence.splice(itemIndex, 1);
  
  // Save updated evidence
  saveSlackEvidence(evidence);
  
  console.log(chalk.green(`Evidence "${item.title}" deleted successfully.`));
}

// Generate a report of Slack evidence
function generateSlackReport() {
  const evidence = loadSlackEvidence();
  
  if (evidence.length === 0) {
    console.log(chalk.yellow("No Slack evidence to report."));
    return;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split(".")[0];
  const reportPath = path.join(REPORTS_DIR, `slack_evidence_${timestamp}.md`);
  
  let report = "# Slack Evidence Report\n\n";
  report += `Generated: ${new Date().toLocaleString()}\n\n`;
  report += `Total Evidence Items: ${evidence.length}\n\n`;
  
  // Group by criterion
  const groupedByCriterion = {};
  evidence.forEach(item => {
    if (!groupedByCriterion[item.criterion_id]) {
      groupedByCriterion[item.criterion_id] = [];
    }
    groupedByCriterion[item.criterion_id].push(item);
  });
  
  // Load criteria for descriptions
  const criteria = loadCriteria();
  
  Object.keys(groupedByCriterion).sort().forEach(criterionId => {
    const criterion = criteria[criterionId];
    const items = groupedByCriterion[criterionId];
    
    report += `## ${criterionId}: ${criterion ? criterion.area + " > " + criterion.subarea : "Unknown Criterion"}\n\n`;
    
    if (criterion) {
      report += `**Description:** ${criterion.description}\n\n`;
    }
    
    items.forEach(item => {
      report += `### ${item.title}\n\n`;
      report += `**Date:** ${new Date(item.timestamp).toLocaleDateString()}\n\n`;
      report += `**Description:** ${item.description}\n\n`;
      report += `**Slack Link:** ${item.slack_link}\n\n`;
      
      if (item.screenshot_path) {
        report += `**Screenshot:** ${path.basename(item.screenshot_path)}\n\n`;
      }
      
      report += `**Message Text:**\n\n\`\`\`\n${item.message_text}\n\`\`\`\n\n`;
      report += `**Confidence:** ${item.confidence}\n\n`;
      report += "---\n\n";
    });
  });
  
  fs.writeFileSync(reportPath, report);
  console.log(chalk.green(`Slack evidence report saved to: ${reportPath}`));
}

// Main menu
async function showMenu() {
  console.log(chalk.bold.blue("\n=== SLACK EVIDENCE MANAGER ===\n"));
  console.log("1. 📸 Add evidence from screenshot (AI Vision)");
  console.log("2. ✍️  Add evidence manually (text entry)");
  console.log("3. 📋 List existing evidence");
  console.log("4. 🗑️  Delete evidence");
  console.log("5. 📄 Generate report");
  console.log("6. ❌ Exit");

  const choice = await askQuestion("\nSelect an option (1-6):");

  switch (choice) {
    case "1":
      await addSlackEvidenceFromScreenshot();
      break;
    case "2":
      await addSlackEvidence();
      break;
    case "3":
      listSlackEvidence();
      break;
    case "4":
      await deleteSlackEvidence();
      break;
    case "5":
      generateSlackReport();
      break;
    case "6":
      console.log(chalk.green("Goodbye!"));
      rl.close();
      return;
    default:
      console.log(chalk.red("Invalid option. Please try again."));
  }

  // Show menu again unless exiting
  if (choice !== "6") {
    await showMenu();
  }
}

// Main function
async function main() {
  try {
    await showMenu();
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    rl.close();
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(chalk.yellow("\n\nExiting..."));
  rl.close();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red(`Unhandled error: ${error.message}`));
    rl.close();
    process.exit(1);
  });
}

module.exports = {
  loadSlackEvidence,
  saveSlackEvidence,
  analyzeMessageText,
  analyzeScreenshot,
  addSlackEvidenceFromScreenshot,
  generateSlackReport,
};