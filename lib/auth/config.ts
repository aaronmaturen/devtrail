import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db/prisma';

/**
 * NextAuth.js v5 configuration for DevTrail
 *
 * Uses GitHub OAuth for authentication with the following scopes:
 * - read:user - Read user profile
 * - user:email - Read user email
 * - repo - Access to repositories (needed for GitHub sync)
 *
 * The OAuth access_token is stored in the Account table and used
 * for GitHub API calls during sync operations.
 */
export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request repo scope for GitHub sync functionality
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],

  callbacks: {
    /**
     * Add user ID to JWT token
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    /**
     * Populate session with user ID from JWT token
     */
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },

    /**
     * Allow sign in - GitHub info is stored via linkAccount event
     */
    signIn() {
      return true;
    },
  },

  events: {
    /**
     * On first login: update GitHub info and trigger initial sync
     */
    async linkAccount({ user, account, profile }) {
      if (account.provider === 'github' && profile && user.id) {
        const githubProfile = profile as { login?: string; id?: number };
        const userId = user.id;

        // Update user with GitHub info
        await prisma.user.update({
          where: { id: userId },
          data: {
            githubId: githubProfile.id?.toString(),
            githubUsername: githubProfile.login,
          },
        });

        // Calculate date range for initial sync (1 year)
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        // Create GitHub sync job for initial historical sync
        await prisma.job.create({
          data: {
            type: 'AGENT_GITHUB_SYNC',
            status: 'PENDING',
            userId,
            config: JSON.stringify({
              userId,
              agentType: 'github',
              startDate,
              endDate,
            }),
          },
        });

        // Create Jira sync job if Jira is configured
        const jiraConfig = await prisma.config.findUnique({
          where: { key: 'jira_host' },
        });
        if (jiraConfig?.value) {
          await prisma.job.create({
            data: {
              type: 'AGENT_JIRA_SYNC',
              status: 'PENDING',
              userId,
              config: JSON.stringify({
                userId,
                agentType: 'jira',
                startDate,
                endDate,
              }),
            },
          });
        }
      }
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  // Use JWT sessions - required for Edge Runtime (middleware) compatibility
  // Database sessions require Prisma which doesn't work in Edge Runtime
  session: {
    strategy: 'jwt',
  },

  // Enable debug logging in development
  debug: process.env.NODE_ENV === 'development',
};
