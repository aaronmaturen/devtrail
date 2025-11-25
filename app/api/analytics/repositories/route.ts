import { NextResponse } from 'next/server';
import { getRepositories } from '@/lib/services/component-analytics';

/**
 * GET /api/analytics/repositories
 * Get list of available repositories with PR counts
 */
export async function GET() {
  try {
    const repositories = await getRepositories();

    return NextResponse.json({ repositories });
  } catch (error) {
    console.error('Error getting repositories:', error);
    return NextResponse.json(
      { error: 'Failed to get repositories' },
      { status: 500 }
    );
  }
}
