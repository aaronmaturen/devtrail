import { prisma } from '@/lib/db/prisma';
import { getConfigValue, getConfigValueParsed } from './utils';

export interface GitHubConfig {
  token: string;
  username: string | null;
  selectedRepos: string[];
}

/**
 * Get GitHub OAuth access token for a specific user
 * This is the primary method for multi-tenant GitHub access.
 *
 * @param userId - The user ID to get the token for
 * @returns GitHub OAuth access token from the user's Account record
 * @throws Error if token not found for user
 */
export async function getGitHubTokenForUser(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'github',
    },
    select: {
      access_token: true,
    },
  });

  if (account?.access_token) {
    return account.access_token;
  }

  throw new Error('GitHub not connected. Please sign in with GitHub to enable sync.');
}

/**
 * Get GitHub username for a specific user
 *
 * @param userId - The user ID to get the username for
 * @returns GitHub username from the user's profile
 */
export async function getGitHubUsernameForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });

  return user?.githubUsername ?? null;
}

/**
 * Check if a user has GitHub connected
 *
 * @param userId - The user ID to check
 * @returns True if the user has a GitHub account linked
 */
export async function hasGitHubConfigForUser(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'github',
    },
    select: { id: true },
  });

  return !!account;
}

/**
 * @deprecated Use getGitHubTokenForUser(userId) for multi-tenant access
 * Get GitHub personal access token from database or environment
 * This is kept for backwards compatibility during migration.
 * Priority: Database Config > Environment Variable
 * @returns GitHub personal access token
 * @throws Error if token not found
 */
export async function getGitHubToken(): Promise<string> {
  // Try database first (legacy PAT storage)
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
 * @deprecated Use getGitHubUsernameForUser(userId) for multi-tenant access
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
 * Note: In multi-tenant, this could be user-specific in the future
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
 * @deprecated Use getGitHubTokenForUser(userId) and getGitHubUsernameForUser(userId)
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
 * @deprecated Use hasGitHubConfigForUser(userId) for multi-tenant access
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
