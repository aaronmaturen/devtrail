import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';
import { Octokit } from '@octokit/rest';

/**
 * GET /api/user/settings
 * Get current user's settings, auto-populating GitHub username if missing
 */
export async function GET() {
  const authResult = await withAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      developerContext: true,
      githubUsername: true,
      githubId: true,
      jiraAccountId: true,
      email: true,
      name: true,
      accounts: {
        where: { provider: 'github' },
        select: { access_token: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let githubUsername = user.githubUsername;

  // If no GitHub username but we have an OAuth token, fetch it from GitHub API
  if (!githubUsername && user.accounts.length > 0 && user.accounts[0].access_token) {
    try {
      console.log('[user/settings] Fetching GitHub username from OAuth token for user:', userId);
      const octokit = new Octokit({ auth: user.accounts[0].access_token });
      const { data } = await octokit.users.getAuthenticated();
      githubUsername = data.login;
      console.log('[user/settings] Got GitHub username:', githubUsername);

      // Save it to the user record for future use
      await prisma.user.update({
        where: { id: userId },
        data: {
          githubUsername: data.login,
          githubId: data.id.toString(),
        },
      });
      console.log('[user/settings] Saved GitHub username to database');
    } catch (error: any) {
      console.error('[user/settings] Failed to fetch GitHub username:', error?.message || error);
      if (error?.response?.status === 401) {
        console.error('[user/settings] OAuth token may be expired or revoked');
      }
    }
  } else if (!githubUsername) {
    console.log('[user/settings] No GitHub username and no token available. userId:', userId, 'accounts:', user.accounts.length);
  }

  // Jira user lookup - either fetch linked user's info or search for a match
  let jiraMatch = null;
  let jiraDisplayName = null;

  try {
    const [hostConfig, emailConfig, tokenConfig] = await Promise.all([
      prisma.config.findUnique({ where: { key: 'jira_host' } }),
      prisma.config.findUnique({ where: { key: 'jira_email' } }),
      prisma.config.findUnique({ where: { key: 'jira_api_token' } }),
    ]);

    if (hostConfig?.value && emailConfig?.value && tokenConfig?.value) {
      const host = JSON.parse(hostConfig.value);
      const jiraEmail = JSON.parse(emailConfig.value);
      const token = JSON.parse(tokenConfig.value);
      const auth = Buffer.from(`${jiraEmail}:${token}`).toString('base64');

      if (user.jiraAccountId) {
        // Fetch the linked user's display name
        const response = await fetch(
          `https://${host}/rest/api/3/user?accountId=${encodeURIComponent(user.jiraAccountId)}`,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Accept': 'application/json',
            },
          }
        );
        if (response.ok) {
          const jiraUser = await response.json();
          jiraDisplayName = jiraUser.displayName;
        }
      } else if (user.name || user.email) {
        // Search for a matching user
        console.log('[user/settings] Searching Jira for matching user:', user.name || user.email);
        const searchQuery = user.name || user.email || '';
        const response = await fetch(
          `https://${host}/rest/api/3/user/search?query=${encodeURIComponent(searchQuery)}&maxResults=5`,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Accept': 'application/json',
            },
          }
        );

        if (response.ok) {
          const users = await response.json();
          console.log('[user/settings] Jira search returned', users.length, 'users');
          const emailMatch = users.find((u: any) =>
            u.emailAddress?.toLowerCase() === user.email?.toLowerCase()
          );
          const nameMatch = users.find((u: any) =>
            u.displayName?.toLowerCase() === user.name?.toLowerCase()
          );

          if (emailMatch || nameMatch) {
            const match = emailMatch || nameMatch;
            jiraMatch = {
              accountId: match.accountId,
              displayName: match.displayName,
              emailAddress: match.emailAddress,
            };
            console.log('[user/settings] Found Jira match:', jiraMatch.displayName);
          }
        }
      }
    }
  } catch (error) {
    console.error('[user/settings] Failed to fetch Jira user info:', error);
  }

  return NextResponse.json({
    developerContext: user.developerContext || '',
    githubUsername: githubUsername || '',
    jiraAccountId: user.jiraAccountId || '',
    jiraDisplayName, // Display name of linked Jira account
    email: user.email || '',
    name: user.name || '',
    jiraMatch, // Suggested Jira account (when not linked)
  });
}

/**
 * PUT /api/user/settings
 * Update current user's settings
 */
export async function PUT(request: NextRequest) {
  const authResult = await withAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await request.json();
  const { developerContext, jiraAccountId } = body;

  const updateData: Record<string, string | null> = {};

  if (developerContext !== undefined) {
    updateData.developerContext = developerContext || null;
  }

  if (jiraAccountId !== undefined) {
    updateData.jiraAccountId = jiraAccountId || null;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      developerContext: true,
      jiraAccountId: true,
    },
  });

  return NextResponse.json({
    developerContext: user.developerContext || '',
    jiraAccountId: user.jiraAccountId || '',
  });
}
