/**
 * Extraction Tools
 *
 * Tools for extracting structured data from text:
 * - extractJiraKey: Extract Jira ticket key from text
 * - extractLinks: Extract Figma, Confluence, and other links
 * - extractComponents: Extract code components from file paths
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool: Extract Jira Key
 * Extract Jira ticket key from text (title, body, branch name)
 */
export const extractJiraKeyTool = tool({
  description:
    'Extract Jira ticket key(s) from text. Looks for patterns like PRO-1234, PLAT-567, etc.',
  inputSchema: z.object({
    text: z.string().describe('Text to extract Jira key from'),
    returnAll: z
      .boolean()
      .default(false)
      .describe('Return all found keys instead of just the first'),
  }),
  execute: async ({ text, returnAll }) => {
    // Match Jira-style keys: PROJECT-NUMBER
    const pattern = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
    const matches = text.match(pattern) || [];

    // Remove duplicates
    const uniqueKeys = [...new Set(matches)];

    if (uniqueKeys.length === 0) {
      return {
        success: true,
        found: false,
        key: null,
        keys: [],
      };
    }

    return {
      success: true,
      found: true,
      key: uniqueKeys[0], // Primary key (first found)
      keys: returnAll ? uniqueKeys : [uniqueKeys[0]],
    };
  },
});

/**
 * Tool: Extract Links
 * Extract Figma, Confluence, and other notable links from text
 */
export const extractLinksTool = tool({
  description:
    'Extract notable links from text including Figma designs, Confluence docs, Google docs, and other URLs.',
  inputSchema: z.object({
    text: z.string().describe('Text to extract links from'),
  }),
  execute: async ({ text }) => {
    // URL pattern
    const urlPattern = /https?:\/\/[^\s<>\[\]"'`)]+/gi;
    const allUrls = text.match(urlPattern) || [];

    // Categorize links
    const figma: string[] = [];
    const confluence: string[] = [];
    const google: string[] = [];
    const github: string[] = [];
    const slack: string[] = [];
    const other: string[] = [];

    for (const url of allUrls) {
      const cleanUrl = url.replace(/[.,;:!?)]+$/, ''); // Remove trailing punctuation

      if (cleanUrl.includes('figma.com')) {
        figma.push(cleanUrl);
      } else if (
        cleanUrl.includes('atlassian.net/wiki') ||
        cleanUrl.includes('confluence')
      ) {
        confluence.push(cleanUrl);
      } else if (
        cleanUrl.includes('docs.google.com') ||
        cleanUrl.includes('drive.google.com') ||
        cleanUrl.includes('sheets.google.com')
      ) {
        google.push(cleanUrl);
      } else if (cleanUrl.includes('github.com')) {
        github.push(cleanUrl);
      } else if (cleanUrl.includes('slack.com')) {
        slack.push(cleanUrl);
      } else {
        other.push(cleanUrl);
      }
    }

    // Remove duplicates
    const dedupe = (arr: string[]) => [...new Set(arr)];

    return {
      success: true,
      totalLinks: allUrls.length,
      links: {
        figma: dedupe(figma),
        confluence: dedupe(confluence),
        google: dedupe(google),
        github: dedupe(github),
        slack: dedupe(slack),
        other: dedupe(other),
      },
      hasDesignLinks: figma.length > 0,
      hasDocLinks: confluence.length > 0 || google.length > 0,
    };
  },
});

/**
 * Tool: Extract Components
 * Extract code components/domains from file paths
 */
export const extractComponentsTool = tool({
  description:
    'Extract code components and domains from a list of file paths. Identifies which parts of the codebase were touched.',
  inputSchema: z.object({
    files: z.array(z.string()).describe('Array of file paths'),
    maxDepth: z
      .number()
      .default(4)
      .describe('Maximum directory depth to consider'),
  }),
  execute: async ({ files, maxDepth }) => {
    // Count occurrences of each directory path
    const componentCounts: Record<string, number> = {};
    const fileExtensions: Record<string, number> = {};

    for (const file of files) {
      // Extract extension
      const extMatch = file.match(/\.([^.]+)$/);
      if (extMatch) {
        const ext = extMatch[1];
        fileExtensions[ext] = (fileExtensions[ext] || 0) + 1;
      }

      // Split into parts and count each directory level
      const parts = file.split('/').filter(Boolean);

      for (let depth = 1; depth <= Math.min(parts.length - 1, maxDepth); depth++) {
        const component = parts.slice(0, depth).join('/');
        componentCounts[component] = (componentCounts[component] || 0) + 1;
      }
    }

    // Convert to sorted array
    const components = Object.entries(componentCounts)
      .map(([name, count]) => ({
        name,
        count,
        depth: name.split('/').length,
      }))
      .sort((a, b) => {
        // Sort by depth first, then by count
        if (a.depth !== b.depth) return a.depth - b.depth;
        return b.count - a.count;
      });

    // Get top-level components (depth 1-2 with highest counts)
    const topComponents = components
      .filter((c) => c.depth >= 1 && c.depth <= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get leaf components (deepest level with significant file counts)
    const leafComponents = components
      .filter((c) => c.depth >= 3 && c.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Determine primary domain
    const domains: string[] = [];
    for (const comp of topComponents) {
      const name = comp.name.toLowerCase();
      if (
        name.includes('test') ||
        name.includes('spec') ||
        name.includes('__tests__')
      ) {
        domains.push('testing');
      } else if (name.includes('doc') || name.includes('readme')) {
        domains.push('documentation');
      } else if (
        name.includes('api') ||
        name.includes('service') ||
        name.includes('backend')
      ) {
        domains.push('backend');
      } else if (
        name.includes('component') ||
        name.includes('ui') ||
        name.includes('frontend') ||
        name.includes('app')
      ) {
        domains.push('frontend');
      } else if (
        name.includes('config') ||
        name.includes('script') ||
        name.includes('tool')
      ) {
        domains.push('infrastructure');
      }
    }

    return {
      success: true,
      totalFiles: files.length,
      components,
      topComponents,
      leafComponents,
      fileExtensions,
      primaryDomains: [...new Set(domains)],
    };
  },
});

/**
 * Tool: Parse PR Title
 * Extract structured information from PR title
 */
export const parsePRTitleTool = tool({
  description:
    'Parse a PR title to extract ticket references, conventional commit type, and description.',
  inputSchema: z.object({
    title: z.string().describe('PR title to parse'),
  }),
  execute: async ({ title }) => {
    // Extract Jira key
    const jiraMatch = title.match(/\[?([A-Z][A-Z0-9]+-\d+)\]?:?\s*/);
    const jiraKey = jiraMatch ? jiraMatch[1] : null;

    // Remove Jira key prefix
    let cleanTitle = title.replace(/^\[?[A-Z][A-Z0-9]+-\d+\]?:?\s*/i, '').trim();

    // Check for conventional commit prefix
    const conventionalMatch = cleanTitle.match(
      /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+?\))?:\s*/i
    );

    let commitType: string | null = null;
    let scope: string | null = null;

    if (conventionalMatch) {
      commitType = conventionalMatch[1].toLowerCase();
      scope = conventionalMatch[2]?.replace(/[()]/g, '') || null;
      cleanTitle = cleanTitle.replace(conventionalMatch[0], '').trim();
    }

    // Infer type from keywords if not conventional
    if (!commitType) {
      const lowerTitle = cleanTitle.toLowerCase();
      if (lowerTitle.includes('fix') || lowerTitle.includes('bug')) {
        commitType = 'fix';
      } else if (
        lowerTitle.includes('refactor') ||
        lowerTitle.includes('clean')
      ) {
        commitType = 'refactor';
      } else if (lowerTitle.includes('test')) {
        commitType = 'test';
      } else if (lowerTitle.includes('doc')) {
        commitType = 'docs';
      } else if (
        lowerTitle.includes('add') ||
        lowerTitle.includes('create') ||
        lowerTitle.includes('implement')
      ) {
        commitType = 'feat';
      } else if (
        lowerTitle.includes('update') ||
        lowerTitle.includes('upgrade') ||
        lowerTitle.includes('bump')
      ) {
        commitType = 'chore';
      }
    }

    return {
      success: true,
      original: title,
      parsed: {
        jiraKey,
        commitType,
        scope,
        description: cleanTitle,
      },
    };
  },
});

export const extractionTools = {
  extractJiraKey: extractJiraKeyTool,
  extractLinks: extractLinksTool,
  extractComponents: extractComponentsTool,
  parsePRTitle: parsePRTitleTool,
};
