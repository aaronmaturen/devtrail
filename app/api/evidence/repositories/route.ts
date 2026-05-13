import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';

/**
 * GET /api/evidence/repositories
 * Get list of unique repositories from evidence
 */
export async function GET() {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    // Get unique repositories from evidence with GitHub PRs
    const evidenceWithPrs = await prisma.evidence.findMany({
      where: {
        userId,
        githubPrId: { not: null },
      },
      select: {
        githubPr: {
          select: { repo: true },
        },
      },
      distinct: ['githubPrId'],
    });

    // Extract unique repos
    const repoSet = new Set<string>();
    evidenceWithPrs.forEach((e) => {
      if (e.githubPr?.repo) {
        repoSet.add(e.githubPr.repo);
      }
    });

    const githubPrs = Array.from(repoSet).sort().map(repo => ({ repo }));

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
