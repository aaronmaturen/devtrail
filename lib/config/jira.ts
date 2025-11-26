import { getConfigValue, getConfigValueParsed } from './utils';

export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
  selectedProjects: string[];
}

export interface JiraCredentials {
  host: string;
  email: string;
  apiToken: string;
}

export async function getJiraHost(): Promise<string> {
  const host = await getConfigValue('jira_host');
  if (!host) {
    throw new Error('Jira host not configured. Set it in Settings.');
  }
  try {
    return JSON.parse(host);
  } catch {
    return host;
  }
}

export async function getJiraEmail(): Promise<string> {
  const email = await getConfigValue('jira_email');
  if (!email) {
    throw new Error('Jira email not configured. Set it in Settings.');
  }
  try {
    return JSON.parse(email);
  } catch {
    return email;
  }
}

export async function getJiraApiToken(): Promise<string> {
  const token = await getConfigValue('jira_api_token');
  if (!token) {
    throw new Error('Jira API token not configured. Set it in Settings.');
  }
  try {
    return JSON.parse(token);
  } catch {
    return token;
  }
}

export async function getJiraCredentials(): Promise<JiraCredentials> {
  const [host, email, apiToken] = await Promise.all([
    getJiraHost(),
    getJiraEmail(),
    getJiraApiToken(),
  ]);
  return { host, email, apiToken };
}

export async function getSelectedProjects(): Promise<string[]> {
  return getConfigValueParsed<string[]>('selected_projects', []);
}

export async function getJiraConfig(): Promise<JiraConfig> {
  const [credentials, selectedProjects] = await Promise.all([
    getJiraCredentials(),
    getSelectedProjects(),
  ]);
  return { ...credentials, selectedProjects };
}

export async function hasJiraConfig(): Promise<boolean> {
  try {
    await getJiraCredentials();
    return true;
  } catch {
    return false;
  }
}
