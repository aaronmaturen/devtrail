#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Path to lattice directory
const LATTICE_DIR = path.join(__dirname, '..', 'lattice');

/**
 * Find and load all review files from the lattice directory
 * @returns {Object} Object containing employee and manager reviews
 */
function loadReviewFiles() {
  const reviews = {
    employee: [],
    manager: []
  };
  
  try {
    // Get all directories in the lattice folder
    const dirs = fs.readdirSync(LATTICE_DIR)
      .filter(dir => dir !== 'example' && fs.statSync(path.join(LATTICE_DIR, dir)).isDirectory())
      .sort(); // Sort chronologically
    
    // Process each directory
    dirs.forEach(dir => {
      const dirPath = path.join(LATTICE_DIR, dir);
      const files = fs.readdirSync(dirPath);
      
      // Calculate a weight based on recency (more recent = higher weight)
      // Format can be YYYY or YYYY-mid
      const yearMatch = dir.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;
      const isMidYear = dir.includes('-mid');
      const weight = year * 10 + (isMidYear ? 5 : 0); // Mid-year reviews are between annual reviews
      
      // Find employee review files
      const employeeFiles = files.filter(f => f.includes('employee') && f.endsWith('.md'));
      employeeFiles.forEach(file => {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        reviews.employee.push({
          dir,
          file,
          content,
          weight
        });
      });
      
      // Find manager review files
      const managerFiles = files.filter(f => f.includes('manager') && f.endsWith('.md'));
      managerFiles.forEach(file => {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        reviews.manager.push({
          dir,
          file,
          content,
          weight
        });
      });
    });
    
    // Sort all files by weight (descending)
    reviews.employee.sort((a, b) => b.weight - a.weight);
    reviews.manager.sort((a, b) => b.weight - a.weight);
    
    console.log(chalk.blue(`Found ${reviews.employee.length} employee reviews and ${reviews.manager.length} manager reviews`));
    return reviews;
  } catch (error) {
    console.error(chalk.red(`Error loading review files: ${error.message}`));
    return reviews;
  }
}

/**
 * Analyze review content for evidence of criteria
 * @param {Object} reviews Object containing employee and manager reviews
 * @param {Object} criteria Object containing criteria
 * @returns {Object} Object containing evidence for each criterion
 */
function analyzeReviewContent(reviews, criteria) {
  const criteriaEvidence = {};
  
  // Initialize criteria evidence
  Object.values(criteria).forEach(criterion => {
    criteriaEvidence[criterion.id] = {
      id: criterion.id,
      area: criterion.area,
      subarea: criterion.subarea,
      description: criterion.description,
      reviewEvidence: [],
      confidence: 0,
      count: 0
    };
  });
  
  // Process employee reviews
  reviews.employee.forEach(review => {
    console.log(chalk.blue(`Analyzing employee review from ${review.dir}`));
    
    // For each criterion, look for relevant content in the review
    Object.values(criteria).forEach(criterion => {
      // Create search terms from criterion description
      const searchTerms = criterion.description.toLowerCase()
        .replace(/[.,;:?!()[\]{}'"]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 4) // Only use significant words
        .slice(0, 5); // Take top 5 significant words
      
      // Look for matches in the review content
      const content = review.content.toLowerCase();
      const matchCount = searchTerms.filter(term => content.includes(term)).length;
      const matchRatio = matchCount / searchTerms.length;
      
      // If we have a significant match, extract the relevant paragraph
      if (matchRatio >= 0.4) { // At least 40% of search terms found
        // Find the paragraph with the most matches
        const paragraphs = review.content.split('\n\n');
        let bestParagraph = '';
        let bestMatchCount = 0;
        
        paragraphs.forEach(paragraph => {
          const paraLower = paragraph.toLowerCase();
          const paraMatchCount = searchTerms.filter(term => paraLower.includes(term)).length;
          
          if (paraMatchCount > bestMatchCount) {
            bestMatchCount = paraMatchCount;
            bestParagraph = paragraph;
          }
        });
        
        if (bestParagraph) {
          // Calculate confidence based on match ratio and review weight
          const confidence = Math.round(matchRatio * 100 * (review.weight / 20));
          
          criteriaEvidence[criterion.id].reviewEvidence.push({
            source: `Employee Review (${review.dir})`,
            evidence: bestParagraph,
            confidence
          });
          
          criteriaEvidence[criterion.id].confidence += confidence;
          criteriaEvidence[criterion.id].count += 1;
        }
      }
    });
  });
  
  // Process manager reviews
  reviews.manager.forEach(review => {
    console.log(chalk.blue(`Analyzing manager review from ${review.dir}`));
    
    // For each criterion, look for relevant content in the review
    Object.values(criteria).forEach(criterion => {
      // Create search terms from criterion description
      const searchTerms = criterion.description.toLowerCase()
        .replace(/[.,;:?!()[\]{}'"]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 4) // Only use significant words
        .slice(0, 5); // Take top 5 significant words
      
      // Look for matches in the review content
      const content = review.content.toLowerCase();
      const matchCount = searchTerms.filter(term => content.includes(term)).length;
      const matchRatio = matchCount / searchTerms.length;
      
      // If we have a significant match, extract the relevant paragraph
      if (matchRatio >= 0.4) { // At least 40% of search terms found
        // Find the paragraph with the most matches
        const paragraphs = review.content.split('\n\n');
        let bestParagraph = '';
        let bestMatchCount = 0;
        
        paragraphs.forEach(paragraph => {
          const paraLower = paragraph.toLowerCase();
          const paraMatchCount = searchTerms.filter(term => paraLower.includes(term)).length;
          
          if (paraMatchCount > bestMatchCount) {
            bestMatchCount = paraMatchCount;
            bestParagraph = paragraph;
          }
        });
        
        if (bestParagraph) {
          // Calculate confidence based on match ratio and review weight
          // Manager reviews get a higher weight
          const confidence = Math.round(matchRatio * 100 * (review.weight / 20) * 1.2);
          
          criteriaEvidence[criterion.id].reviewEvidence.push({
            source: `Manager Review (${review.dir})`,
            evidence: bestParagraph,
            confidence
          });
          
          criteriaEvidence[criterion.id].confidence += confidence;
          criteriaEvidence[criterion.id].count += 1;
        }
      }
    });
  });
  
  return criteriaEvidence;
}

module.exports = {
  loadReviewFiles,
  analyzeReviewContent
};
