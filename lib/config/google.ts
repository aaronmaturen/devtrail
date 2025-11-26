import { getConfigValue, getConfigValueParsed } from './utils';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  defaultFolderId: string | null;
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Get Google OAuth Client ID from database
 * @returns Google OAuth Client ID
 * @throws Error if not configured
 */
export async function getGoogleClientId(): Promise<string> {
  const clientId = await getConfigValue('google_client_id');
  if (!clientId) {
    throw new Error('Google Client ID not configured. Set it in Settings.');
  }
  try {
    return JSON.parse(clientId);
  } catch {
    return clientId;
  }
}

/**
 * Get Google OAuth Client Secret from database
 * @returns Google OAuth Client Secret
 * @throws Error if not configured
 */
export async function getGoogleClientSecret(): Promise<string> {
  const clientSecret = await getConfigValue('google_client_secret');
  if (!clientSecret) {
    throw new Error('Google Client Secret not configured. Set it in Settings.');
  }
  try {
    return JSON.parse(clientSecret);
  } catch {
    return clientSecret;
  }
}

/**
 * Get Google OAuth Refresh Token from database
 * @returns Google OAuth Refresh Token
 * @throws Error if not configured
 */
export async function getGoogleRefreshToken(): Promise<string> {
  const refreshToken = await getConfigValue('google_refresh_token');
  if (!refreshToken) {
    throw new Error('Google Refresh Token not configured. Complete OAuth setup in Settings.');
  }
  try {
    return JSON.parse(refreshToken);
  } catch {
    return refreshToken;
  }
}

/**
 * Get default Google Drive folder ID for document storage
 * @returns Folder ID or null if not configured
 */
export async function getGoogleDefaultFolderId(): Promise<string | null> {
  const folderId = await getConfigValue('google_default_folder_id');
  if (!folderId) {
    return null;
  }
  try {
    return JSON.parse(folderId);
  } catch {
    return folderId;
  }
}

/**
 * Get Google OAuth credentials
 * @returns Object with clientId, clientSecret, and refreshToken
 * @throws Error if any credential is not configured
 */
export async function getGoogleCredentials(): Promise<GoogleCredentials> {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getGoogleClientId(),
    getGoogleClientSecret(),
    getGoogleRefreshToken(),
  ]);
  return { clientId, clientSecret, refreshToken };
}

/**
 * Get full Google configuration
 * @returns Object with all Google configuration values
 */
export async function getGoogleConfig(): Promise<GoogleConfig> {
  const [credentials, defaultFolderId] = await Promise.all([
    getGoogleCredentials(),
    getGoogleDefaultFolderId(),
  ]);
  return { ...credentials, defaultFolderId };
}

/**
 * Check if Google configuration is available
 * @returns True if all required Google credentials are configured
 */
export async function hasGoogleConfig(): Promise<boolean> {
  try {
    await getGoogleCredentials();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Google OAuth is partially configured (has client credentials but no refresh token)
 * This is useful for showing OAuth setup prompts
 * @returns Object indicating configuration state
 */
export async function getGoogleConfigState(): Promise<{
  hasClientCredentials: boolean;
  hasRefreshToken: boolean;
  isFullyConfigured: boolean;
}> {
  const clientId = await getConfigValue('google_client_id');
  const clientSecret = await getConfigValue('google_client_secret');
  const refreshToken = await getConfigValue('google_refresh_token');

  const hasClientCredentials = !!(clientId && clientSecret);
  const hasRefreshToken = !!refreshToken;

  return {
    hasClientCredentials,
    hasRefreshToken,
    isFullyConfigured: hasClientCredentials && hasRefreshToken,
  };
}
