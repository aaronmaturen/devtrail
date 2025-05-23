#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

// Paths to clean
const DATA_DIR = path.join(__dirname, "..", "data");
const REPORTS_DIR = path.join(__dirname, "..", "reports");

// Function to delete directory contents
function cleanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(chalk.yellow(`Directory does not exist: ${dirPath}`));
    return;
  }

  const files = fs.readdirSync(dirPath);
  
  if (files.length === 0) {
    console.log(chalk.yellow(`Directory already empty: ${dirPath}`));
    return;
  }

  let deletedCount = 0;
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    
    // Skip .gitkeep files
    if (file === '.gitkeep') {
      continue;
    }
    
    try {
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // Recursively delete subdirectory contents
        cleanDirectory(filePath);
        
        // Remove the directory itself
        fs.rmdirSync(filePath);
      } else {
        // Delete file
        fs.unlinkSync(filePath);
      }
      
      deletedCount++;
    } catch (err) {
      console.error(chalk.red(`Error deleting ${filePath}: ${err.message}`));
    }
  }
  
  console.log(chalk.green(`Cleaned ${deletedCount} items from ${dirPath}`));
}

// Main function
function main() {
  console.log(chalk.blue("Starting cleanup..."));
  
  // Clean data directory
  console.log(chalk.blue("\nCleaning data directory:"));
  cleanDirectory(DATA_DIR);
  
  // Clean reports directory
  console.log(chalk.blue("\nCleaning reports directory:"));
  cleanDirectory(REPORTS_DIR);
  
  console.log(chalk.green("\nCleanup complete!"));
}

// Run the script
main();
