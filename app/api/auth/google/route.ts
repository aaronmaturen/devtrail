/**
 * API Route: Initiate Google OAuth Flow
 *
 * GET /api/auth/google
 *
 * Redirects the user to Google's OAuth consent screen.
 * Requires google_client_id and google_client_secret to be configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@googleapis/docs';
import { getConfigValue } from '@/lib/config/utils';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
];

export async function GET(request: NextRequest) {
  try {
    const clientId = await getConfigValue('google_client_id');
    const clientSecret = await getConfigValue('google_client_secret');

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Google OAuth client credentials not configured. Set them in Settings first.' },
        { status: 400 }
      );
    }

    // Parse JSON if stored that way
    const parsedClientId = clientId.startsWith('"') ? JSON.parse(clientId) : clientId;
    const parsedClientSecret = clientSecret.startsWith('"') ? JSON.parse(clientSecret) : clientSecret;

    // Get the host for redirect URI
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const oauth2Client = new auth.OAuth2(
      parsedClientId,
      parsedClientSecret,
      redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force consent to ensure we get a refresh token
      include_granted_scopes: true,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Google OAuth:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}
