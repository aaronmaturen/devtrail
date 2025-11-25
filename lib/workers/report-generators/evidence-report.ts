import { EvidenceEntry, Criterion } from '@prisma/client';

export interface EvidenceReportConfig {
  startDate?: string;
  endDate?: string;
  repositories?: string[];
  criteriaIds?: number[];
}

interface EvidenceCriterionWithDetails extends Criterion {
  evidence: Array<{
    entry: EvidenceEntry;
    confidence: number;
    explanation?: string;
  }>;
  totalConfidence: number;
  count: number;
  prCount: number;
  slackCount: number;
  avgConfidence: number;
}

/**
 * Generate detailed evidence report from PRs and other evidence
 * Groups evidence by criteria, shows PR titles, descriptions, and links
 * Returns markdown formatted report
 */
export async function generateEvidenceReport(
  evidence: Array<EvidenceEntry & {
    criteria: Array<{
      criterionId: number;
      confidence: number;
      explanation?: string;
      criterion: Criterion;
    }>;
  }>,
  config: EvidenceReportConfig
): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];

  // Build markdown report
  let markdown = '# ANNUAL REVIEW EVIDENCE REPORT\n\n';
  markdown += `*Generated on ${timestamp}*\n\n`;

  if (config.startDate || config.endDate) {
    markdown += '## Date Range\n\n';
    if (config.startDate) markdown += `- Start Date: ${config.startDate}\n`;
    if (config.endDate) markdown += `- End Date: ${config.endDate}\n`;
    markdown += '\n';
  }

  if (config.repositories && config.repositories.length > 0) {
    markdown += '## Repositories\n\n';
    config.repositories.forEach(repo => {
      markdown += `- ${repo}\n`;
    });
    markdown += '\n';
  }

  // Group evidence by criterion
  const criteriaMap = new Map<number, EvidenceCriterionWithDetails>();

  evidence.forEach(entry => {
    entry.criteria.forEach(ec => {
      const criterionId = ec.criterionId;

      if (!criteriaMap.has(criterionId)) {
        criteriaMap.set(criterionId, {
          ...ec.criterion,
          evidence: [],
          totalConfidence: 0,
          count: 0,
          prCount: 0,
          slackCount: 0,
          avgConfidence: 0,
        });
      }

      const criterion = criteriaMap.get(criterionId)!;
      criterion.evidence.push({
        entry,
        confidence: ec.confidence,
        explanation: ec.explanation,
      });
      criterion.totalConfidence += ec.confidence;
      criterion.count += 1;

      if (entry.type === 'PR') {
        criterion.prCount += 1;
      } else if (entry.type === 'SLACK') {
        criterion.slackCount += 1;
      }
    });
  });

  // Calculate averages
  criteriaMap.forEach(criterion => {
    if (criterion.count > 0) {
      criterion.avgConfidence = Math.round(criterion.totalConfidence / criterion.count);
    }
  });

  // Sort criteria by ID
  const sortedCriteria = Array.from(criteriaMap.values()).sort((a, b) => a.id - b.id);

  // Generate SUMMARY section
  markdown += '## SUMMARY\n\n';

  sortedCriteria.forEach(criterion => {
    if (criterion.count > 0) {
      const evidenceTypes = [];
      if (criterion.prCount > 0) evidenceTypes.push(`${criterion.prCount} PRs`);
      if (criterion.slackCount > 0) evidenceTypes.push(`${criterion.slackCount} Slack`);
      const evidenceTypeText = evidenceTypes.length > 0 ? evidenceTypes.join(', ') : 'No evidence';

      markdown += `### ${criterion.id}: [${criterion.areaOfConcentration} > ${criterion.subarea}] (${evidenceTypeText}, Avg Confidence: ${criterion.avgConfidence}%)\n\n`;
      markdown += `${criterion.description}\n\n`;
    } else if (!criterion.prDetectable) {
      markdown += `### ${criterion.id}: [${criterion.areaOfConcentration} > ${criterion.subarea}] (Not Detectable from PR Data)\n\n`;
      markdown += `${criterion.description}\n\n`;
      markdown += `*Note: This criterion typically requires direct observation or feedback and cannot be automatically detected from PR or ticket data.*\n\n`;
    } else {
      markdown += `### ${criterion.id}: [${criterion.areaOfConcentration} > ${criterion.subarea}] (No Evidence - Potential Area for Improvement)\n\n`;
      markdown += `${criterion.description}\n\n`;
      markdown += `*This may be an area to focus on for professional development.*\n\n`;
    }
    markdown += '---\n\n';
  });

  // Generate DETAILED EVIDENCE section
  markdown += '## DETAILED EVIDENCE\n\n';

  sortedCriteria.forEach(criterion => {
    markdown += `### CRITERION ${criterion.id}: [${criterion.areaOfConcentration} > ${criterion.subarea}]\n\n`;
    markdown += `${criterion.description}\n\n`;
    markdown += '---\n\n';

    if (criterion.count > 0) {
      // Sort evidence by confidence
      const sortedEvidence = criterion.evidence.sort((a, b) => b.confidence - a.confidence);

      sortedEvidence.forEach((item, i) => {
        const entry = item.entry;

        if (entry.type === 'SLACK') {
          markdown += `#### ${i + 1}. [SLACK] ${entry.title} (Confidence: ${item.confidence}%)\n\n`;
          if (entry.description) {
            markdown += `${entry.description}\n\n`;
          }
          if (entry.slackLink) {
            markdown += `**Slack Link:** ${entry.slackLink}\n\n`;
          }
          if (item.explanation) {
            markdown += `**Evidence:**\n${item.explanation}\n\n`;
          }
        } else if (entry.type === 'PR') {
          markdown += `#### ${i + 1}. ${entry.repository}#${entry.prNumber}: ${entry.title} (Confidence: ${item.confidence}%)\n\n`;
          if (entry.prUrl) {
            markdown += `**PR Link:** ${entry.prUrl}\n\n`;
          }
          if (item.explanation) {
            markdown += `${item.explanation}\n\n`;
          }
          if (entry.description) {
            markdown += `**Description:**\n${entry.description}\n\n`;
          }
        } else {
          markdown += `#### ${i + 1}. [${entry.type}] ${entry.title} (Confidence: ${item.confidence}%)\n\n`;
          if (entry.description) {
            markdown += `${entry.description}\n\n`;
          }
          if (item.explanation) {
            markdown += `**Evidence:**\n${item.explanation}\n\n`;
          }
        }

        markdown += '---\n\n';
      });
    } else {
      markdown += '**No evidence found for this criterion.**\n\n';
    }
  });

  markdown += '\n# END OF REPORT\n';

  return markdown;
}
