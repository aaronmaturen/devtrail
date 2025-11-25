import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/evidence/repositories
 * Get list of unique repositories from evidence
 */
export async function GET() {
  try {
    const repositories = await prisma.evidenceEntry.findMany({
      where: {
        repository: {
          not: null,
        },
      },
      select: {
        repository: true,
      },
      distinct: ['repository'],
      orderBy: {
        repository: 'asc',
      },
    });

    const repoList = repositories
      .map(r => r.repository)
      .filter((r): r is string => r !== null);

    return NextResponse.json({ repositories: repoList });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
