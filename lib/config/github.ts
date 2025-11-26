import { getConfigValue, getConfigValueParsed } from './utils';

export interface GitHubConfig {
  token: string;
  username: string | null;
  selectedRepos: string[];
}

/**
 * Get GitHub personal access token from database or environment
 * Priority: Database Config > Environment Variable
 * @returns GitHub personal access token
 * @throws Error if token not found
 */
export async function getGitHubToken(): Promise<string> {
  // Try database first
  const dbToken = await getConfigValue('github_token');
  if (dbToken) {
    try {
      return JSON.parse(dbToken);
    } catch {
      return dbToken;
    }
  }

  // Fallback to environment variable
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return envToken;
  }

  throw new Error('GitHub token not configured. Set it in Settings or GITHUB_TOKEN environment variable.');
}

/**
 * Get GitHub username from database or environment
 * @returns GitHub username or null if not configured
 */
export async function getGitHubUsername(): Promise<string | null> {
  const username = await getConfigValue('github_username');
  if (username) {
    try {
      return JSON.parse(username);
    } catch {
      return username;
    }
  }

  return process.env.GITHUB_USERNAME || null;
}

/**
 * Get list of selected GitHub repositories to track
 * @returns Array of repository names in "owner/repo" format
 */
export async function getSelectedRepos(): Promise<string[]> {
  return getConfigValueParsed<string[]>('selected_repos', []);
}

/**
 * @deprecated Use getSelectedRepos() instead
 * Get list of GitHub repositories to track
 * @returns Array of repository names in "owner/repo" format
 */
export async function getGitHubRepositories(): Promise<string[]> {
  return getSelectedRepos();
}

/**
 * Get GitHub organization name
 * @returns Organization name or null if not configured
 */
export async function getGitHubOrganization(): Promise<string | null> {
  const org = await getConfigValue('github_organization');
  if (org) {
    try {
      return JSON.parse(org);
    } catch {
      return org;
    }
  }

  return process.env.GITHUB_ORGANIZATION || null;
}

/**
 * Get full GitHub configuration
 * @returns Object with all GitHub configuration values
 */
export async function getGitHubConfig(): Promise<GitHubConfig> {
  const [token, username, selectedRepos] = await Promise.all([
    getGitHubToken(),
    getGitHubUsername(),
    getSelectedRepos(),
  ]);

  return { token, username, selectedRepos };
}

/**
 * Check if GitHub configuration is available
 * @returns True if GitHub token is configured
 */
export async function hasGitHubConfig(): Promise<boolean> {
  try {
    await getGitHubToken();
    return true;
  } catch {
    return false;
  }
}
