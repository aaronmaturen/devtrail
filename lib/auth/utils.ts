import { auth } from './index';
import { prisma } from '@/lib/db/prisma';

/**
 * Auth result type for API routes
 */
export interface AuthUser {
  userId: string;
  email: string | null;
  githubUsername: string | null;
}

/**
 * Get the authenticated user from the session
 * Returns null if not authenticated
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  // Fetch additional user data
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      githubUsername: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    githubUsername: user.githubUsername,
  };
}

/**
 * Require authentication - throws if not authenticated
 * Use in Server Components and Server Actions
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user) {
    throw new Error('Authentication required');
  }

  return user;
}

/**
 * Get GitHub OAuth access token for a user
 * Used for GitHub API calls during sync operations
 */
export async function getUserGitHubToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'github',
    },
    select: {
      access_token: true,
    },
  });

  return account?.access_token ?? null;
}

/**
 * Get GitHub username for a user
 */
export async function getUserGitHubUsername(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });

  return user?.githubUsername ?? null;
}
