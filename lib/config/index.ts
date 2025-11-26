/**
 * Configuration utilities for DevTrail
 *
 * This module provides centralized access to application configuration
 * stored in the database Config table.
 */

export { getConfigValue, getConfigValueParsed, setConfigValue, deleteConfigValue } from './utils';

// Anthropic/Claude configuration
export {
  getAnthropicApiKey,
  getAnthropicModelId,
  getAnthropicConfig,
  getConfiguredModelId,
} from './anthropic';

// GitHub configuration
export {
  getGitHubToken,
  getGitHubUsername,
  getGitHubRepositories,
  getSelectedRepos,
  getGitHubOrganization,
  getGitHubConfig,
  hasGitHubConfig,
  type GitHubConfig,
} from './github';

// Jira configuration
export {
  getJiraHost,
  getJiraEmail,
  getJiraApiToken,
  getJiraCredentials,
  getSelectedProjects,
  getJiraConfig,
  hasJiraConfig,
  type JiraConfig,
  type JiraCredentials,
} from './jira';

// User context configuration
export {
  getUserContext,
  getUserContextRaw,
  setUserContext,
  getCompanyFramework,
  setCompanyFramework,
  getAIContext,
  type UserContext
} from './user-context';

// Google configuration
export {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRefreshToken,
  getGoogleDefaultFolderId,
  getGoogleCredentials,
  getGoogleConfig,
  hasGoogleConfig,
  getGoogleConfigState,
  type GoogleConfig,
  type GoogleCredentials,
} from './google';
