import NextAuth from 'next-auth';
import { authConfig } from './config';

/**
 * NextAuth.js v5 exports
 *
 * Usage:
 * - Server Components: import { auth } from '@/lib/auth'
 * - API Routes: import { auth } from '@/lib/auth'
 * - Server Actions: import { auth } from '@/lib/auth'
 * - Sign in/out: import { signIn, signOut } from '@/lib/auth'
 * - API Route handlers: import { handlers } from '@/lib/auth'
 */
export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);
