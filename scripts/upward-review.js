#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const readline = require("readline");
const { Anthropic } = require("@anthropic-ai/sdk");

// Paths
const REPORTS_DIR = path.join(__dirname, "..", "reports");
const PRESENCE_WAY_PATH = path.join(__dirname, "..", "presence_way.md");

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

// Ask a question and get user input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Generate response for upward review questions
async function generateQuestionResponse(
  questionType,
  config
) {
  try {
    if (!config.anthropic_api_key) {
      return "AI response unavailable (missing API key)";
    }

    const userContext =
      config.user_context ||
      "I am a senior developer content in my job with a great manager that supports me.";
    const anthropic = new Anthropic({ apiKey: config.anthropic_api_key });

    let questionPrompt = "";

    if (questionType === "continue") {
      questionPrompt = `What is one thing your manager does that you hope they continue to do?`;
    } else if (questionType === "growth") {
      questionPrompt = `What is an area of growth that would improve your manager as an impactful leader?`;
    }

    const prompt = `You are helping a software engineer prepare responses for an upward review of their manager at Presence Learning. Based on the information provided, draft a response to the following question:

${questionPrompt}

CONTEXT ABOUT THE ENGINEER:
${userContext}${
      config.presenceWayContent
        ? `\n\nPRESENCE WAY FRAMEWORK:\n${config.presenceWayContent}`
        : ""
    }

When drafting the response, align it with the Presence Way framework and values when applicable.

UPWARD REVIEW INSTRUCTIONS:
• Write 2-4 complete sentences total
• Be specific and provide concrete examples when possible
• Be constructive, especially for growth areas
• Focus on behaviors and actions, not personality
• Be professional and respectful
• Write in a way that would be helpful for the manager's development

Please write a response that follows these instructions and sounds natural and authentic. The response should be in first person as if the engineer is writing it themselves.`;

    const completion = await anthropic.messages.create({
      model: config.claude_model,
      max_tokens: 1000,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    console.error(chalk.red(`Error generating response: ${error.message}`));
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

    let questionPrompt = "";
    if (questionType === "continue") {
      questionPrompt = `What is one thing your manager does that you hope they continue to do?`;
    } else if (questionType === "growth") {
      questionPrompt = `What is an area of growth that would improve your manager as an impactful leader?`;
    }

    const prompt = `You previously helped draft a response to the following upward review question:

${questionPrompt}

Your original response was:
"""
${originalResponse}
"""

The user has provided this feedback on your response:
"""
${feedback}
"""

Please revise the response based on this feedback. Keep the response concise (2-4 sentences) and make it sound natural and authentic in first person.`;

    const completion = await anthropic.messages.create({
      model: config.claude_model,
      max_tokens: 1000,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    return completion.content[0].text.trim();
  } catch (error) {
    console.error(chalk.red(`Error refining response: ${error.message}`));
    return `Error refining AI response: ${error.message}`;
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

// Main function
async function main() {
  try {
    console.log(chalk.blue.bold("Upward Review Response Generator"));
    console.log(chalk.blue("This tool will help you generate responses for your manager's upward review."));
    
    const config = loadConfig();
    
    // Generate responses for both questions
    console.log(chalk.green.bold("\nQuestion 1: What is one thing your manager does that you hope they continue to do?"));
    let continueResponse = await generateQuestionResponse("continue", config);
    console.log(chalk.cyan("\nGenerated response:"));
    console.log(continueResponse);
    
    // Allow user to refine the response
    let refine = await askQuestion(chalk.yellow("\nWould you like to refine this response? (y/n): "));
    while (refine.toLowerCase() === 'y') {
      const feedback = await askQuestion(chalk.yellow("Please provide feedback on how to improve the response: "));
      continueResponse = await refineResponse("continue", continueResponse, feedback, config);
      console.log(chalk.cyan("\nRevised response:"));
      console.log(continueResponse);
      refine = await askQuestion(chalk.yellow("\nWould you like to refine this response further? (y/n): "));
    }
    
    console.log(chalk.green.bold("\nQuestion 2: What is an area of growth that would improve your manager as an impactful leader?"));
    let growthResponse = await generateQuestionResponse("growth", config);
    console.log(chalk.cyan("\nGenerated response:"));
    console.log(growthResponse);
    
    // Allow user to refine the response
    refine = await askQuestion(chalk.yellow("\nWould you like to refine this response? (y/n): "));
    while (refine.toLowerCase() === 'y') {
      const feedback = await askQuestion(chalk.yellow("Please provide feedback on how to improve the response: "));
      growthResponse = await refineResponse("growth", growthResponse, feedback, config);
      console.log(chalk.cyan("\nRevised response:"));
      console.log(growthResponse);
      refine = await askQuestion(chalk.yellow("\nWould you like to refine this response further? (y/n): "));
    }
    
    // Save responses to a file
    const outputFilename = getTimestampedFilename("upward_review");
    const content = `# Upward Review Responses
Generated on: ${new Date().toLocaleString()}

## What is one thing your manager does that you hope they continue to do?

${continueResponse}

## What is an area of growth that would improve your manager as an impactful leader?

${growthResponse}
`;
    
    fs.writeFileSync(outputFilename, content);
    console.log(chalk.green(`\nResponses saved to ${outputFilename}`));
    
    rl.close();
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    rl.close();
    process.exit(1);
  }
}

// Run the main function
main();
