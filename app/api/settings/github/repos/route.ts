import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { getGitHubTokenForUser } from '@/lib/config/github';
import { withAuth, isAuthError } from '@/lib/api/auth';

export const runtime = 'nodejs';

/**
 * GET /api/settings/github/repos
 * Fetches available GitHub repositories using the user's OAuth token
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    // Get the user's GitHub OAuth token
    const token = await getGitHubTokenForUser(userId);

    // Create Octokit client
    const octokit = new Octokit({ auth: token });

    try {
      // Fetch user's repositories
      const { data: repos } = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
        affiliation: 'owner,collaborator,organization_member',
      });

      // Format the repositories
      const formattedRepos = repos.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner.login,
        description: repo.description,
        private: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        updatedAt: repo.updated_at,
        url: repo.html_url,
      }));

      return NextResponse.json({ repositories: formattedRepos });
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Failed to fetch repositories', details: error.message },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Failed to fetch GitHub repos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
