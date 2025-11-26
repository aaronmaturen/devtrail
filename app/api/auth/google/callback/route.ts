/**
 * API Route: Google OAuth Callback
 *
 * GET /api/auth/google/callback
 *
 * Handles the OAuth callback from Google, exchanges the code for tokens,
 * and stores the refresh token in the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@googleapis/docs';
import { getConfigValue, setConfigValue } from '@/lib/config/utils';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Handle errors from Google
    if (error) {
      console.error('Google OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/settings?google_auth=error&message=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/settings?google_auth=error&message=No+authorization+code+received', request.url)
      );
    }

    // Get client credentials
    const clientId = await getConfigValue('google_client_id');
    const clientSecret = await getConfigValue('google_client_secret');

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/settings?google_auth=error&message=Client+credentials+not+configured', request.url)
      );
    }

    // Parse JSON if stored that way
    const parsedClientId = clientId.startsWith('"') ? JSON.parse(clientId) : clientId;
    const parsedClientSecret = clientSecret.startsWith('"') ? JSON.parse(clientSecret) : clientSecret;

    // Build redirect URI (must match what was used in the initial request)
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const oauth2Client = new auth.OAuth2(
      parsedClientId,
      parsedClientSecret,
      redirectUri
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error('No refresh token received from Google');
      return NextResponse.redirect(
        new URL('/settings?google_auth=error&message=No+refresh+token+received.+Try+revoking+app+access+at+myaccount.google.com/permissions+and+try+again.', request.url)
      );
    }

    // Store the refresh token in the database
    await setConfigValue(
      'google_refresh_token',
      tokens.refresh_token,
      true, // encrypted
      'Google OAuth Refresh Token'
    );

    console.log('Google OAuth refresh token stored successfully');

    return NextResponse.redirect(
      new URL('/settings?google_auth=success', request.url)
    );
  } catch (error) {
    console.error('Error handling Google OAuth callback:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/settings?google_auth=error&message=${encodeURIComponent(message)}`, request.url)
    );
  }
}
