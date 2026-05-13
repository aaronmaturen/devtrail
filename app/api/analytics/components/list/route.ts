import { NextResponse } from 'next/server';
import { getComponentsList } from '@/lib/services/component-analytics';
import { withAuth, isAuthError } from '@/lib/api/auth';

/**
 * GET /api/analytics/components/list
 * Get list of all unique component names
 */
export async function GET() {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const components = await getComponentsList(userId);

    return NextResponse.json({ components });
  } catch (error) {
    console.error('Error getting components list:', error);
    return NextResponse.json(
      { error: 'Failed to get components list' },
      { status: 500 }
    );
  }
}
