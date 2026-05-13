import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Authentication result for API routes
 */
export interface AuthResult {
  userId: string;
}

/**
 * Type guard to check if result is an error response
 */
export function isAuthError(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Require authentication for API routes
 *
 * Returns either the authenticated user's ID or a 401 response.
 *
 * Usage:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const authResult = await withAuth();
 *   if (isAuthError(authResult)) return authResult;
 *   const { userId } = authResult;
 *
 *   // Use userId in queries
 *   const data = await prisma.evidence.findMany({
 *     where: { userId }
 *   });
 * }
 * ```
 */
export async function withAuth(): Promise<AuthResult | NextResponse> {
  // Check if auth is disabled (feature flag for rollback)
  if (process.env.AUTH_ENABLED === 'false') {
    // Return a placeholder user ID for development/rollback
    // This should only be used when explicitly disabling auth
    return { userId: 'system' };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  return { userId: session.user.id };
}

/**
 * Get user ID from session without returning an error response
 * Useful when auth is optional
 */
export async function getUserId(): Promise<string | null> {
  // Check if auth is disabled
  if (process.env.AUTH_ENABLED === 'false') {
    return 'system';
  }

  const session = await auth();
  return session?.user?.id ?? null;
}
