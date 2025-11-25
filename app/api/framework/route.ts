import { NextRequest, NextResponse } from 'next/server';
import { getCompanyFramework, saveCompanyFramework } from '@/lib/services/review-context';

/**
 * GET /api/framework
 * Get company framework document
 */
export async function GET(request: NextRequest) {
  try {
    const framework = await getCompanyFramework();

    return NextResponse.json({
      framework: framework || '',
      exists: framework !== null,
    });
  } catch (error) {
    console.error('Error fetching framework:', error);
    return NextResponse.json(
      { error: 'Failed to fetch framework' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/framework
 * Save company framework document
 */
export async function POST(request: NextRequest) {
  try {
    const { framework } = await request.json();

    if (typeof framework !== 'string') {
      return NextResponse.json(
        { error: 'Framework must be a string' },
        { status: 400 }
      );
    }

    await saveCompanyFramework(framework);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving framework:', error);
    return NextResponse.json(
      { error: 'Failed to save framework' },
      { status: 500 }
    );
  }
}
