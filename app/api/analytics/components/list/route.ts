import { NextResponse } from 'next/server';
import { getComponentsList } from '@/lib/services/component-analytics';

/**
 * GET /api/analytics/components/list
 * Get list of all unique component names
 */
export async function GET() {
  try {
    const components = await getComponentsList();

    return NextResponse.json({ components });
  } catch (error) {
    console.error('Error getting components list:', error);
    return NextResponse.json(
      { error: 'Failed to get components list' },
      { status: 500 }
    );
  }
}
