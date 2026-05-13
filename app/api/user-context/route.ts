import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';

/**
 * GET /api/user-context
 * Get user/developer context from User model
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { developerContext: true },
    });

    return NextResponse.json({
      userContext: user?.developerContext || '',
      exists: !!user?.developerContext,
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
 * Save user/developer context to User model
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const { userContext } = await request.json();

    if (typeof userContext !== 'string') {
      return NextResponse.json(
        { error: 'User context must be a string' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { developerContext: userContext || null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving user context:', error);
    return NextResponse.json(
      { error: 'Failed to save user context' },
      { status: 500 }
    );
  }
}
