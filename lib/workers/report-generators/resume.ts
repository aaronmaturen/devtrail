import Anthropic from '@anthropic-ai/sdk';
import { EvidenceEntry } from '@prisma/client';

export interface ResumeConfig {
  anthropicApiKey?: string;
  claudeModel?: string;
  theme?: 'vscode' | 'github' | 'linkedin' | 'plain';
}

interface ProjectStats {
  totalPRs: number;
  technologies: Set<string>;
  components: Map<string, number>;
  reviewsGiven: number;
  largeChanges: number;
  architecturalChanges: number;
  mentorshipInstances: number;
}

/**
 * Extract technologies mentioned in PR
 */
function extractTechnologies(pr: EvidenceEntry, technologies: Set<string>): void {
  const techKeywords = [
    'react', 'angular', 'vue', 'javascript', 'typescript', 'node', 'express',
    'graphql', 'rest', 'api', 'aws', 'azure', 'gcp', 'docker', 'kubernetes',
    'ci/cd', 'jenkins', 'github actions', 'terraform', 'microservices', 'serverless',
    'python', 'java', 'go', 'rust', 'ruby', 'php', 'c#', 'swift', 'kotlin',
    'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'kafka', 'rabbitmq'
  ];

  const content = `${pr.title} ${pr.description || ''} ${pr.content || ''}`.toLowerCase();

  techKeywords.forEach(tech => {
    if (content.includes(tech)) {
      technologies.add(tech);
    }
  });
}

/**
 * Determine if PR represents an architectural change
 */
function isArchitecturalChange(pr: EvidenceEntry): boolean {
  const architecturalKeywords = [
    'architecture', 'refactor', 'redesign', 'restructure', 'framework',
    'infrastructure', 'platform', 'migration', 'modernize', 'pattern',
    'scalability', 'performance', 'optimization', 'system design'
  ];

  const content = `${pr.title} ${pr.description || ''} ${pr.content || ''}`.toLowerCase();

  return architecturalKeywords.some(keyword => content.includes(keyword));
}

/**
 * Determine if PR represents a mentorship instance
 */
function isMentorshipInstance(pr: EvidenceEntry): boolean {
  const mentorshipKeywords = [
    'suggest', 'recommend', 'consider', 'learn', 'improve', 'better practice',
    'best practice', 'pattern', 'approach', 'alternative', 'guidance',
    'mentor', 'teach', 'explain', 'help', 'guide'
  ];

  const content = `${pr.title} ${pr.description || ''} ${pr.content || ''}`.toLowerCase();

  return mentorshipKeywords.some(keyword => content.includes(keyword));
}

/**
 * Track contributions to different components
 */
function trackComponentContributions(pr: EvidenceEntry, components: Map<string, number>): void {
  if (!pr.components) return;

  try {
    const componentList = JSON.parse(pr.components);
    componentList.forEach((comp: any) => {
      const componentName = comp.name;
      components.set(componentName, (components.get(componentName) || 0) + 1);
    });
  } catch (error) {
    // Skip invalid component data
  }
}

/**
 * Analyze PR data to extract project statistics
 */
function analyzeProjectData(prData: EvidenceEntry[]): ProjectStats {
  const stats: ProjectStats = {
    totalPRs: prData.length,
    technologies: new Set(),
    components: new Map(),
    reviewsGiven: 0,
    largeChanges: 0,
    architecturalChanges: 0,
    mentorshipInstances: 0
  };

  prData.forEach(pr => {
    // Extract technologies
    extractTechnologies(pr, stats.technologies);

    // Identify large changes (PRs with significant additions/deletions)
    if ((pr.additions || 0) + (pr.deletions || 0) > 500) {
      stats.largeChanges++;
    }

    // Identify architectural changes
    if (isArchitecturalChange(pr)) {
      stats.architecturalChanges++;
    }

    // Identify mentorship instances
    if (isMentorshipInstance(pr)) {
      stats.mentorshipInstances++;
    }

    // Track component contributions
    trackComponentContributions(pr, stats.components);
  });

  return stats;
}

/**
 * Generate architectural and staff engineering focused resume statements
 */
function generateArchitecturalStatements(stats: ProjectStats): string[] {
  const statements: string[] = [];

  // Statement about architectural leadership
  if (stats.architecturalChanges > 0) {
    statements.push(
      `Led ${stats.architecturalChanges} major architectural initiatives, including system redesigns, framework migrations, and infrastructure modernizations that improved scalability and maintainability.`
    );
  }

  // Statement about technical leadership across components
  const topComponents = Array.from(stats.components.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  if (topComponents.length > 0) {
    statements.push(
      `Demonstrated technical leadership across multiple system components including ${topComponents.join(', ')}, driving consistency in implementation patterns and ensuring architectural integrity.`
    );
  }

  // Statement about mentorship and code quality
  if (stats.mentorshipInstances > 0) {
    statements.push(
      `Elevated team capabilities through technical mentorship in ${stats.mentorshipInstances} documented instances, focusing on architectural patterns, code quality, and engineering best practices.`
    );
  }

  // Statement about technology expertise
  if (stats.technologies.size > 0) {
    const techList = Array.from(stats.technologies).slice(0, 5).join(', ');
    statements.push(
      `Established expertise in ${techList}, implementing robust architectural solutions that balanced innovation with maintainability and performance.`
    );
  }

  // Statement about large contributions
  if (stats.largeChanges > 0) {
    statements.push(
      `Delivered ${stats.largeChanges} high-impact contributions with extensive code changes, demonstrating capability to handle complex technical challenges and large-scale system modifications.`
    );
  }

  // Limit to 5 most impressive statements
  return statements.slice(0, 5);
}

/**
 * Generate sample architectural and staff engineering focused resume statements
 */
function generateSampleStatements(): string[] {
  return [
    'Led the architectural transformation of a legacy monolithic application into a modern microservices architecture, resulting in 40% improved system performance and 60% faster deployment cycles.',
    'Established and enforced architectural standards across 5 development teams, implementing design reviews and technical planning processes that reduced critical production issues by 35%.',
    'Designed and implemented a comprehensive CI/CD pipeline with automated testing, reducing deployment time from days to minutes while ensuring 99.9% uptime for critical services.',
    'Mentored 12 senior and mid-level engineers through architectural decision-making processes, elevating team capabilities in distributed systems design and scalable architecture patterns.',
    'Pioneered the adoption of event-driven architecture and domain-driven design principles, enabling the business to scale to handle 10x transaction volume without proportional infrastructure cost increases.'
  ];
}

/**
 * Apply theme formatting to resume content
 */
function applyTheme(content: string, theme: string): string {
  switch (theme) {
    case 'vscode':
      return `\`\`\`markdown\n${content}\n\`\`\``;
    case 'github':
      // GitHub-flavored markdown with badges and emojis
      return content
        .replace(/# Resume Statements/g, '# 📄 Resume Statements')
        .replace(/## Architectural and Staff Engineering Highlights/g, '## 🏗️ Architectural and Staff Engineering Highlights');
    case 'linkedin':
      // LinkedIn-optimized format
      return content
        .replace(/- /g, '• ')
        .replace(/## /g, '\n### ');
    case 'plain':
    default:
      return content;
  }
}

/**
 * Generate resume statements based on evidence
 * Analyzes PRs to create architectural and staff engineering focused resume content
 */
export async function generateResume(
  evidence: EvidenceEntry[],
  config: ResumeConfig
): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const theme = config.theme || 'plain';

  let markdown = '# Resume Statements\n\n';
  markdown += `*Generated on ${timestamp}*\n\n`;

  // Filter to only PR evidence
  const prEvidence = evidence.filter(e => e.type === 'PR');

  let statements: string[];

  if (prEvidence.length === 0) {
    markdown += '*Note: No PR evidence found. Generated sample statements.*\n\n';
    statements = generateSampleStatements();
  } else {
    // Analyze PR data
    const stats = analyzeProjectData(prEvidence);

    // Generate statements based on actual data
    statements = generateArchitecturalStatements(stats);

    // If we have API key and minimal statements, enhance with AI
    if (config.anthropicApiKey && statements.length < 3) {
      try {
        const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
        const model = config.claudeModel || 'claude-3-5-haiku-20241022';

        // Prepare context for AI
        const prSummary = prEvidence.slice(0, 20).map(pr => ({
          title: pr.title,
          repository: pr.repository,
          additions: pr.additions,
          deletions: pr.deletions,
          mergedAt: pr.mergedAt
        }));

        const prompt = `You are helping a software engineer generate resume statements based on their recent work.

Based on these recent PRs and the statistics below, generate 3-5 compelling resume statements that highlight architectural and staff engineering contributions:

Statistics:
- Total PRs: ${stats.totalPRs}
- Architectural changes: ${stats.architecturalChanges}
- Large changes (>500 lines): ${stats.largeChanges}
- Mentorship instances: ${stats.mentorshipInstances}
- Technologies: ${Array.from(stats.technologies).join(', ')}
- Top components: ${Array.from(stats.components.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name} (${count} PRs)`).join(', ')}

Recent PR titles:
${prSummary.map(pr => `- ${pr.title}`).join('\n')}

Generate 3-5 resume statements that:
1. Focus on architectural and staff engineering impact
2. Include specific numbers and metrics where possible
3. Highlight technical leadership and mentorship
4. Emphasize scalability, performance, and system design
5. Are written in past tense for accomplishments
6. Are suitable for a senior/staff engineer resume

Return only the statements, one per line, without numbering or bullet points.`;

        const completion = await anthropic.messages.create({
          model,
          max_tokens: 1000,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        });

        const aiStatements = completion.content[0].type === 'text'
          ? completion.content[0].text.trim().split('\n').filter(s => s.trim())
          : [];

        if (aiStatements.length > 0) {
          statements = aiStatements;
        }
      } catch (error) {
        // If AI enhancement fails, continue with generated statements
        console.error('AI enhancement failed:', error);
      }
    }

    // Fall back to sample statements if we couldn't generate enough
    if (statements.length === 0) {
      statements = generateSampleStatements();
    }
  }

  // Generate report content
  markdown += '## Architectural and Staff Engineering Highlights\n\n';

  statements.forEach(statement => {
    markdown += `- ${statement}\n`;
  });

  markdown += '\n## How to Use These Statements\n\n';
  markdown += 'These statements are designed to highlight your architectural and staff engineering contributions. ';
  markdown += 'They can be used in your resume, LinkedIn profile, or during performance reviews. ';
  markdown += 'Consider customizing them further with specific project names or technologies as appropriate.\n';

  // Add statistics section if we have PR data
  if (prEvidence.length > 0) {
    const stats = analyzeProjectData(prEvidence);
    markdown += '\n## Evidence Statistics\n\n';
    markdown += `- Total PRs analyzed: ${stats.totalPRs}\n`;
    markdown += `- Architectural changes: ${stats.architecturalChanges}\n`;
    markdown += `- Large contributions (>500 lines): ${stats.largeChanges}\n`;
    markdown += `- Mentorship instances: ${stats.mentorshipInstances}\n`;
    markdown += `- Technologies used: ${stats.technologies.size}\n`;
    markdown += `- Components contributed to: ${stats.components.size}\n`;
  }

  markdown += '\n# END OF REPORT\n';

  // Apply theme formatting
  return applyTheme(markdown, theme);
}
