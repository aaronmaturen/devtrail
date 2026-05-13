import { handlers } from '@/lib/auth';

/**
 * NextAuth.js API route handler
 *
 * Handles all authentication routes:
 * - GET /api/auth/signin - Sign in page
 * - POST /api/auth/signin/:provider - Initiate OAuth flow
 * - GET /api/auth/callback/:provider - OAuth callback
 * - GET /api/auth/signout - Sign out page
 * - POST /api/auth/signout - Sign out action
 * - GET /api/auth/session - Get session
 * - GET /api/auth/csrf - Get CSRF token
 * - GET /api/auth/providers - Get available providers
 */
export const { GET, POST } = handlers;
