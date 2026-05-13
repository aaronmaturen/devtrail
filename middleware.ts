import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * Middleware to protect routes and redirect unauthenticated users
 *
 * Public routes (no auth required):
 * - /auth/* - Authentication pages
 * - /api/auth/* - NextAuth API routes
 * - /_next/* - Next.js internals
 * - /favicon.ico, /logo.svg - Static assets
 *
 * All other routes require authentication
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow auth-related routes without checking session
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.svg'
  ) {
    return NextResponse.next();
  }

  // Check if auth is enabled (feature flag for rollback)
  if (process.env.AUTH_ENABLED === 'false') {
    return NextResponse.next();
  }

  // req.auth is the session - available because we're using auth() as middleware
  if (!req.auth?.user) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Redirect authenticated users from home to dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Match all routes except static files
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/cron).*)',
  ],
};
