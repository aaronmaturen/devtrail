import Anthropic from '@anthropic-ai/sdk';
import { EvidenceEntry } from '@prisma/client';

export interface ComponentAnalysisConfig {
  startDate?: string;
  endDate?: string;
  repositories?: string[];
  anthropicApiKey: string;
  claudeModel?: string;
}

interface ComponentData {
  name: string;
  prCount: number;
  totalChanges: number;
  additions: number;
  deletions: number;
  repos: Set<string>;
  prNumbers: number[];
  prTitles: string[];
  firstContribution: Date;
  lastContribution: Date;
  avgDuration: number;
  totalDuration: number;
  role: 'Lead' | 'Significant Contributor' | 'Support' | 'Minor Contributor';
}

/**
 * Analyze contributions by component/domain
 * Group PRs by component
 * Identify leadership areas
 * Returns markdown report
 */
export async function generateComponentAnalysis(
  evidence: EvidenceEntry[],
  config: ComponentAnalysisConfig
): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const model = config.claudeModel || 'claude-3-5-haiku-20241022';

  let markdown = '# Component Analysis Report\n\n';
  markdown += `*Generated on ${timestamp}*\n\n`;

  // Filter to only PR evidence
  const prEvidence = evidence.filter(e => e.type === 'PR');

  if (prEvidence.length === 0) {
    markdown += 'No PR evidence found for component analysis.\n\n';
    return markdown;
  }

  // Extract components from PRs
  const componentMap = new Map<string, ComponentData>();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  prEvidence.forEach(pr => {
    // Skip PRs older than 12 months if we have date filtering
    if (pr.mergedAt && pr.mergedAt < oneYearAgo) {
      return;
    }

    // Parse components from the components field (stored as JSON)
    let components: Array<{ name: string; path?: string }> = [];
    if (pr.components) {
      try {
        components = JSON.parse(pr.components);
      } catch (error) {
        // If components is not valid JSON, skip this PR
        return;
      }
    }

    components.forEach(component => {
      const componentName = component.name;

      if (!componentMap.has(componentName)) {
        componentMap.set(componentName, {
          name: componentName,
          prCount: 0,
          totalChanges: 0,
          additions: 0,
          deletions: 0,
          repos: new Set(),
          prNumbers: [],
          prTitles: [],
          firstContribution: new Date(),
          lastContribution: new Date(0),
          avgDuration: 0,
          totalDuration: 0,
          role: 'Minor Contributor',
        });
      }

      const compData = componentMap.get(componentName)!;
      compData.prCount += 1;
      if (pr.repository) compData.repos.add(pr.repository);
      if (pr.prNumber) compData.prNumbers.push(pr.prNumber);
      compData.prTitles.push(pr.title);

      // Update changes
      if (pr.additions) compData.additions += pr.additions;
      if (pr.deletions) compData.deletions += pr.deletions;
      compData.totalChanges += (pr.additions || 0) + (pr.deletions || 0);

      // Update dates
      if (pr.mergedAt) {
        if (pr.mergedAt < compData.firstContribution) {
          compData.firstContribution = pr.mergedAt;
        }
        if (pr.mergedAt > compData.lastContribution) {
          compData.lastContribution = pr.mergedAt;
        }
      }

      // Calculate duration (could be enhanced with actual PR duration data)
      // For now, use time between first and last contribution
      const durationDays =
        (compData.lastContribution.getTime() - compData.firstContribution.getTime()) /
        (1000 * 60 * 60 * 24);
      compData.totalDuration = durationDays;
      compData.avgDuration = durationDays / compData.prCount;
    });
  });

  // Determine roles based on criteria
  componentMap.forEach(comp => {
    const durationDays =
      (comp.lastContribution.getTime() - comp.firstContribution.getTime()) /
      (1000 * 60 * 60 * 24);

    if (comp.prCount >= 5 && comp.totalChanges >= 1000 && durationDays >= 90) {
      comp.role = 'Lead';
    } else if (comp.prCount >= 3 && comp.totalChanges >= 500 && durationDays >= 30) {
      comp.role = 'Significant Contributor';
    } else if (comp.prCount >= 1 && comp.totalChanges >= 100) {
      comp.role = 'Support';
    } else {
      comp.role = 'Minor Contributor';
    }
  });

  // Count components by role
  const roleCounts = {
    Lead: 0,
    'Significant Contributor': 0,
    Support: 0,
    'Minor Contributor': 0,
  };

  componentMap.forEach(comp => {
    roleCounts[comp.role] += 1;
  });

  // Generate summary
  markdown += '## Summary\n\n';
  markdown += `Total components contributed to: ${componentMap.size}\n\n`;
  markdown += `- Lead role: ${roleCounts.Lead} components\n`;
  markdown += `- Significant contributor: ${roleCounts['Significant Contributor']} components\n`;
  markdown += `- Support role: ${roleCounts.Support} components\n`;
  markdown += `- Minor contributor: ${roleCounts['Minor Contributor']} components\n\n`;

  // Top components table
  markdown += '## Top Components\n\n';
  markdown += '| Component | Role | PRs | Changes | Avg Duration (days) | First Contribution | Last Contribution |\n';
  markdown += '|-----------|------|-----|---------|---------------------|-------------------|-------------------|\n';

  const sortedComponents = Array.from(componentMap.values())
    .sort((a, b) => b.totalChanges - a.totalChanges)
    .slice(0, 10);

  sortedComponents.forEach(comp => {
    const firstDate = comp.firstContribution.toISOString().split('T')[0];
    const lastDate = comp.lastContribution.toISOString().split('T')[0];
    markdown += `| ${comp.name} | ${comp.role} | ${comp.prCount} | ${comp.totalChanges.toLocaleString()} | ${comp.avgDuration.toFixed(1)} | ${firstDate} | ${lastDate} |\n`;
  });

  markdown += '\n';

  // Detailed analysis for significant components
  markdown += '## Detailed Component Analysis\n\n';

  const significantComponents = Array.from(componentMap.values())
    .filter(comp => comp.role === 'Lead' || comp.role === 'Significant Contributor')
    .sort((a, b) => b.totalChanges - a.totalChanges);

  for (const comp of significantComponents) {
    try {
      // Generate AI analysis
      const prompt = `You are analyzing a software engineer's contributions to a specific component or domain in a codebase.
Please provide a brief analysis (3-4 sentences) of their role and impact based on the following data:

Component name: ${comp.name}
Role: ${comp.role}
Number of PRs: ${comp.prCount}
Total code changes: ${comp.totalChanges.toLocaleString()} lines
Average PR duration: ${comp.avgDuration.toFixed(1)} days
Active period: ${comp.firstContribution.toISOString().split('T')[0]} to ${comp.lastContribution.toISOString().split('T')[0]}

Recent PR titles:
${comp.prTitles.slice(0, 5).map(title => `- ${title}`).join('\n')}

Focus on:
1. The engineer's level of ownership and expertise in this component
2. The nature of their contributions (features, bugs, maintenance)
3. The impact and significance of their work
4. Any patterns or trends in their contributions`;

      const completion = await anthropic.messages.create({
        model,
        max_tokens: 500,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });

      const analysis = completion.content[0].type === 'text' ? completion.content[0].text.trim() : '';

      markdown += `### ${comp.name} (${comp.role})\n\n`;
      markdown += `**Metrics:**\n`;
      markdown += `- PRs: ${comp.prCount}\n`;
      markdown += `- Total Changes: ${comp.totalChanges.toLocaleString()} lines\n`;
      markdown += `- Average PR Duration: ${comp.avgDuration.toFixed(1)} days\n`;
      markdown += `- Active Period: ${comp.firstContribution.toISOString().split('T')[0]} to ${comp.lastContribution.toISOString().split('T')[0]}\n\n`;
      markdown += `**Analysis:**\n${analysis}\n\n`;
      markdown += `**Recent PRs:**\n`;
      comp.prTitles.slice(0, 5).forEach((title, i) => {
        markdown += `- ${title} (#${comp.prNumbers[i]})\n`;
      });
      markdown += '\n---\n\n';
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      markdown += `### ${comp.name} (${comp.role})\n\n`;
      markdown += `**Metrics:**\n`;
      markdown += `- PRs: ${comp.prCount}\n`;
      markdown += `- Total Changes: ${comp.totalChanges.toLocaleString()} lines\n`;
      markdown += `- Average PR Duration: ${comp.avgDuration.toFixed(1)} days\n`;
      markdown += `- Active Period: ${comp.firstContribution.toISOString().split('T')[0]} to ${comp.lastContribution.toISOString().split('T')[0]}\n\n`;
      markdown += `**Error generating AI analysis:** ${errorMsg}\n\n`;
      markdown += `**Recent PRs:**\n`;
      comp.prTitles.slice(0, 5).forEach((title, i) => {
        markdown += `- ${title} (#${comp.prNumbers[i]})\n`;
      });
      markdown += '\n---\n\n';
    }
  }

  markdown += '\n# END OF REPORT\n';

  return markdown;
}
