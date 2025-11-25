import fs from 'fs';
import path from 'path';

export interface DevTrailConfig {
  github_token: string;
  anthropic_api_key: string;
  jira_host?: string;
  jira_email?: string;
  jira_api_token?: string;
  jira_project_keys?: string[];
  repos: string[];
  user_context?: string;
  dry_run?: boolean;
  max_prs?: number;
}

/**
 * Load config from parent directory's config.json
 * This allows us to reuse the existing configuration during migration
 */
export function loadParentConfig(): DevTrailConfig | null {
  const parentConfigPath = path.join(__dirname, '../../../..', 'config.json');

  if (fs.existsSync(parentConfigPath)) {
    try {
      const configData = fs.readFileSync(parentConfigPath, 'utf8');
      return JSON.parse(configData) as DevTrailConfig;
    } catch (error) {
      console.error('Error loading parent config:', error);
      return null;
    }
  }

  return null;
}

/**
 * Calculate recency weight for review documents
 * More recent reviews get higher weights
 */
export function calculateReviewWeight(year: string): number {
  const currentYear = new Date().getFullYear();
  const isMidYear = year.includes('-mid');
  const reviewYear = parseInt(year.split('-')[0]);

  // Calculate years ago
  const yearsAgo = currentYear - reviewYear;

  // Base weight: more recent = higher weight
  // Current year = 100, previous year = 80, etc.
  let weight = Math.max(100 - (yearsAgo * 20), 20);

  // Mid-year reviews get slightly lower weight than end-of-year
  if (isMidYear) {
    weight -= 5;
  }

  return weight;
}
