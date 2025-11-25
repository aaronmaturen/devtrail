import Anthropic from '@anthropic-ai/sdk';
import { EvidenceEntry } from '@prisma/client';

export interface CapitalizationConfig {
  anthropicApiKey: string;
  claudeModel?: string;
  userContext?: string;
}

interface MonthlyPRGroup {
  month: string;
  monthName: string;
  prs: EvidenceEntry[];
}

/**
 * Generate software capitalization report
 * Analyzes PRs from last 3 months
 * Groups by month and identifies capitalizable features
 * Returns markdown report with hour estimates
 */
export async function generateCapitalizationReport(
  evidence: EvidenceEntry[],
  config: CapitalizationConfig
): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const model = config.claudeModel || 'claude-3-5-sonnet-20241022';

  let markdown = '# SOFTWARE CAPITALIZATION REPORT\n\n';
  markdown += `## Last 3 Months (${timestamp})\n\n`;

  // Filter to only PR evidence from last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const recentPRs = evidence.filter(e => {
    if (e.type !== 'PR') return false;
    if (!e.mergedAt) return false;
    return e.mergedAt >= threeMonthsAgo;
  });

  if (recentPRs.length === 0) {
    markdown += 'No PRs found from the last 3 months.\n\n';
    return markdown;
  }

  // Group PRs by month based on merge date
  const monthlyGroups: MonthlyPRGroup[] = [];
  const monthMap = new Map<string, EvidenceEntry[]>();

  recentPRs.forEach(pr => {
    if (!pr.mergedAt) return;

    const monthKey = `${pr.mergedAt.getFullYear()}-${String(pr.mergedAt.getMonth() + 1).padStart(2, '0')}`;

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, []);
    }
    monthMap.get(monthKey)!.push(pr);
  });

  // Sort months in reverse chronological order and format
  Array.from(monthMap.keys())
    .sort()
    .reverse()
    .forEach(monthKey => {
      const [year, monthNum] = monthKey.split('-');
      const monthName = new Date(parseInt(year), parseInt(monthNum) - 1, 1).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      });

      monthlyGroups.push({
        month: monthKey,
        monthName,
        prs: monthMap.get(monthKey)!,
      });
    });

  // Process each month
  for (const group of monthlyGroups) {
    markdown += `\n## ${group.monthName}\n\n`;
    markdown += '| Feature | Description | Hours | PR References |\n';
    markdown += '|---------|-------------|-------|---------------|\n';

    if (group.prs.length === 0) {
      markdown += '| No capitalizable features found | - | - | - |\n\n';
      continue;
    }

    try {
      // Build PR data for Claude
      const prText = group.prs
        .map(pr => {
          let text = `PR: ${pr.repository}#${pr.prNumber} - ${pr.title}\n`;
          text += `Merged: ${pr.mergedAt?.toISOString().split('T')[0]}\n`;

          if (pr.description) {
            const desc = pr.description.substring(0, 200);
            text += `Description: ${desc}${pr.description.length > 200 ? '...' : ''}\n`;
          }

          // Parse content for additional context if available
          try {
            const content = JSON.parse(pr.content);
            if (content.jira_key) {
              text += `Jira: ${content.jira_key}`;
              if (content.jira_title) {
                text += ` - ${content.jira_title}`;
              }
              text += '\n';
            }
          } catch (error) {
            // Content is not JSON, skip
          }

          return text;
        })
        .join('\n');

      const userContext =
        config.userContext ||
        'I am a senior developer content in my job with a great manager that supports me.';

      const prompt = `You are an expert at identifying capitalizable features from software engineering work. The developer has the following context:

${userContext}

Review the following GitHub pull requests from ${group.monthName} and identify which ones represent capitalizable work:

${prText}

For each PR that represents capitalizable work (new features or significant enhancements), provide:
1. A descriptive feature name (what was built)
2. A very brief description (less than 10 words)
3. An estimated number of hours spent (rounded to nearest 5)
4. The PR reference(s)

Group related PRs that are part of the same feature together.

Format your response as a table with these columns:
Feature | Description | Hours | PR References

Only include PRs that represent capitalizable work. If a PR is for bug fixes, maintenance, or other non-capitalizable work, exclude it.`;

      const completion = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = completion.content[0].type === 'text' ? completion.content[0].text.trim() : '';

      // Extract table content (skip any explanatory text)
      let tableContent = responseText;
      if (responseText.includes('|')) {
        const tableLines = responseText.split('\n').filter(line => line.includes('|'));
        // Skip the header row and separator row if present
        const dataRows = tableLines.filter(
          line => !line.match(/^\s*\|[\s-]*\|[\s-]*\|[\s-]*\|[\s-]*\|\s*$/)
        );
        tableContent = dataRows.join('\n');
      }

      markdown += tableContent + '\n\n';
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      markdown += `| Error processing ${group.monthName} | ${errorMsg} | - | - |\n\n`;
    }
  }

  markdown += '\n## Notes\n\n';
  markdown += '- Hours are estimates rounded to the nearest 5\n';
  markdown += '- Only includes work from the last 3 calendar months\n';
  markdown += '- Only capitalizable work (new features, enhancements) is included\n';
  markdown += '- Bug fixes, maintenance, and minor tweaks are excluded\n';

  markdown += '\n# END OF REPORT\n';

  return markdown;
}
