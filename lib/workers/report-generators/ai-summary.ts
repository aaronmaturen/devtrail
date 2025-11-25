import Anthropic from '@anthropic-ai/sdk';
import { EvidenceEntry, Criterion } from '@prisma/client';

export interface AISummaryConfig {
  startDate?: string;
  endDate?: string;
  repositories?: string[];
  criteriaIds?: number[];
  anthropicApiKey: string;
  claudeModel?: string;
}

interface GroupedEvidence {
  criterion: Criterion;
  evidence: Array<{
    entry: EvidenceEntry;
    confidence: number;
    explanation?: string;
  }>;
  count: number;
  avgConfidence: number;
}

/**
 * Use Claude AI to generate concise performance summary
 * Analyzes evidence against criteria
 * Returns 2-3 paragraph summary per criterion
 */
export async function generateAISummary(
  evidence: Array<EvidenceEntry & {
    criteria: Array<{
      criterionId: number;
      confidence: number;
      explanation?: string;
      criterion: Criterion;
    }>;
  }>,
  config: AISummaryConfig
): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const model = config.claudeModel || 'claude-3-5-sonnet-20241022';

  let markdown = '# ANNUAL REVIEW AI SUMMARY REPORT\n\n';
  markdown += `*Generated on ${timestamp}*\n\n`;

  // Group evidence by criterion
  const criteriaMap = new Map<number, GroupedEvidence>();

  evidence.forEach(entry => {
    entry.criteria.forEach(ec => {
      const criterionId = ec.criterionId;

      if (!criteriaMap.has(criterionId)) {
        criteriaMap.set(criterionId, {
          criterion: ec.criterion,
          evidence: [],
          count: 0,
          avgConfidence: 0,
        });
      }

      const criterion = criteriaMap.get(criterionId)!;
      criterion.evidence.push({
        entry,
        confidence: ec.confidence,
        explanation: ec.explanation,
      });
      criterion.count += 1;
    });
  });

  // Calculate averages
  criteriaMap.forEach(grouped => {
    if (grouped.count > 0) {
      const totalConfidence = grouped.evidence.reduce((sum, e) => sum + e.confidence, 0);
      grouped.avgConfidence = Math.round(totalConfidence / grouped.count);
    }
  });

  // Sort criteria by ID
  const sortedCriteria = Array.from(criteriaMap.values()).sort(
    (a, b) => a.criterion.id - b.criterion.id
  );

  // Generate AI summary for each criterion
  for (const grouped of sortedCriteria) {
    const criterion = grouped.criterion;

    markdown += `## ${criterion.id}: [${criterion.areaOfConcentration} > ${criterion.subarea}]\n\n`;
    markdown += `${criterion.description}\n\n`;

    if (grouped.count === 0) {
      markdown += '**No evidence found for this criterion.**\n\n';
      markdown += '---\n\n';
      continue;
    }

    try {
      // Build evidence text for Claude
      const evidenceText = grouped.evidence
        .map((item, i) => {
          const entry = item.entry;
          let text = `${i + 1}. `;

          if (entry.type === 'PR') {
            text += `[PR] ${entry.repository}#${entry.prNumber}: ${entry.title}\n`;
            text += `   Merged: ${entry.mergedAt?.toISOString().split('T')[0] || 'Unknown'}\n`;
          } else if (entry.type === 'SLACK') {
            text += `[SLACK] ${entry.title}\n`;
            text += `   Date: ${entry.timestamp.toISOString().split('T')[0]}\n`;
          } else {
            text += `[${entry.type}] ${entry.title}\n`;
            text += `   Date: ${entry.timestamp.toISOString().split('T')[0]}\n`;
          }

          if (item.explanation) {
            text += `   Evidence: ${item.explanation}\n`;
          }

          text += `   Confidence: ${item.confidence}%\n`;

          return text;
        })
        .join('\n');

      const prompt = `You are analyzing a software engineer's performance evidence for a specific review criterion.

Criterion: ${criterion.description}
Area: ${criterion.areaOfConcentration} > ${criterion.subarea}

Evidence (${grouped.count} items, avg confidence: ${grouped.avgConfidence}%):
${evidenceText}

Please provide a concise 2-3 paragraph summary that:
1. Highlights the key accomplishments and patterns demonstrated in the evidence
2. Evaluates how well the evidence demonstrates mastery of this criterion
3. Provides specific examples from the evidence to support your assessment
4. Notes any areas for improvement or growth opportunities

Keep your response focused and professional, suitable for inclusion in a performance review.`;

      const completion = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = completion.content[0].type === 'text' ? completion.content[0].text.trim() : '';

      markdown += `**Summary (${grouped.count} evidence items, avg confidence: ${grouped.avgConfidence}%):**\n\n`;
      markdown += `${summary}\n\n`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      markdown += `**Error generating summary:** ${errorMsg}\n\n`;
    }

    markdown += '---\n\n';
  }

  markdown += '\n# END OF REPORT\n';

  return markdown;
}
