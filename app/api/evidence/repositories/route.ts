import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/evidence/repositories
 * Get list of unique repositories from evidence
 */
export async function GET() {
  try {
    // Get unique repositories from GitHubPR table
    const githubPrs = await prisma.gitHubPR.findMany({
      select: {
        repo: true,
      },
      distinct: ['repo'],
      orderBy: {
        repo: 'asc',
      },
    });

    const repoList = githubPrs.map(r => r.repo);

    return NextResponse.json({ repositories: repoList });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
