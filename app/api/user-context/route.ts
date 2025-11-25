import { NextRequest, NextResponse } from 'next/server';
import { getUserContext, saveUserContext } from '@/lib/services/review-context';

/**
 * GET /api/user-context
 * Get user/developer context
 */
export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserContext();

    return NextResponse.json({
      userContext: userContext || '',
      exists: userContext !== null,
    });
  } catch (error) {
    console.error('Error fetching user context:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user context' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user-context
 * Save user/developer context
 */
export async function POST(request: NextRequest) {
  try {
    const { userContext } = await request.json();

    if (typeof userContext !== 'string') {
      return NextResponse.json(
        { error: 'User context must be a string' },
        { status: 400 }
      );
    }

    await saveUserContext(userContext);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving user context:', error);
    return NextResponse.json(
      { error: 'Failed to save user context' },
      { status: 500 }
    );
  }
}
