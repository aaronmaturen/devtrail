import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { withAuth, isAuthError } from '@/lib/api/auth';
import { z } from 'zod';

const setManagerSchema = z.object({
  managerId: z.string().nullable(),
});

/**
 * GET /api/user/manager
 * Get current user's manager and direct reports
 */
export async function GET() {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        reports: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      manager: user.manager,
      reports: user.reports,
    });
  } catch (error) {
    console.error('Error fetching manager info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch manager info' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/manager
 * Set current user's manager
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await withAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    const body = await request.json();
    const { managerId } = setManagerSchema.parse(body);

    // Validate manager exists if provided
    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager) {
        return NextResponse.json(
          { error: 'Manager not found' },
          { status: 404 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { managerId },
      include: {
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json({
      manager: user.manager,
      message: managerId ? 'Manager set successfully' : 'Manager removed',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error setting manager:', error);
    return NextResponse.json(
      { error: 'Failed to set manager' },
      { status: 500 }
    );
  }
}
