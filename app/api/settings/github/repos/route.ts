import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { getGitHubToken } from '@/lib/ai/config';

export const runtime = 'nodejs';

/**
 * GET /api/settings/github/repos
 * Fetches available GitHub repositories using the stored token
 */
export async function GET(request: NextRequest) {
  try {
    // Get the GitHub token from centralized config
    let token: string;
    try {
      token = await getGitHubToken();
    } catch (error) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 400 }
      );
    }

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
        { error: 'Invalid GitHub token', details: error.message },
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
