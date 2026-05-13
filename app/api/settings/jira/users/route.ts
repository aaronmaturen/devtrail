import { NextRequest, NextResponse } from 'next/server';
import { withAuth, isAuthError } from '@/lib/api/auth';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/settings/jira/users
 * Search for Jira users to help user link their account
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;

    // Get Jira config
    const [hostConfig, emailConfig, tokenConfig] = await Promise.all([
      prisma.config.findUnique({ where: { key: 'jira_host' } }),
      prisma.config.findUnique({ where: { key: 'jira_email' } }),
      prisma.config.findUnique({ where: { key: 'jira_api_token' } }),
    ]);

    if (!hostConfig?.value || !emailConfig?.value || !tokenConfig?.value) {
      return NextResponse.json({ error: 'Jira not configured' }, { status: 400 });
    }

    const host = JSON.parse(hostConfig.value);
    const email = JSON.parse(emailConfig.value);
    const token = JSON.parse(tokenConfig.value);

    // Search for users - this returns assignable users
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const response = await fetch(
      `https://${host}/rest/api/3/users/search?maxResults=100`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Jira API error:', error);
      return NextResponse.json({ error: 'Failed to fetch Jira users' }, { status: response.status });
    }

    const users = await response.json();

    // Format users
    const formattedUsers = users
      .filter((user: any) => user.accountType === 'atlassian') // Only real users, not apps
      .map((user: any) => ({
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
        avatarUrl: user.avatarUrls?.['48x48'],
        active: user.active,
      }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    console.error('Failed to fetch Jira users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Jira users', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
