import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { triggerJobProcessing } from '@/lib/workers/process-helper';

/**
 * POST /api/analytics/monthly-insights/regenerate-all
 * Regenerates insights for all specified months
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { months } = body;

    if (!months || !Array.isArray(months) || months.length === 0) {
      return NextResponse.json(
        { error: 'months array is required' },
        { status: 400 }
      );
    }

    // Create jobs for each month
    const jobIds: string[] = [];

    for (const month of months) {
      // Validate month format (YYYY-MM)
      if (!/^\d{4}-\d{2}$/.test(month)) {
        continue; // Skip invalid months
      }

      // Delete existing insight for this month (force regeneration)
      await prisma.monthlyInsight.deleteMany({
        where: { month },
      });

      // Create the job
      const job = await prisma.job.create({
        data: {
          type: 'MONTHLY_INSIGHT_GENERATION',
          status: 'PENDING',
          config: JSON.stringify({ month, force: true }),
        },
      });

      jobIds.push(job.id);

      // Trigger immediate processing in development
      await triggerJobProcessing(job.id, 'MONTHLY_INSIGHT_GENERATION');
    }

    return NextResponse.json({
      message: `Started regeneration for ${jobIds.length} months`,
      jobIds,
      months: months.filter((m: string) => /^\d{4}-\d{2}$/.test(m)),
    });
  } catch (error) {
    console.error('Error starting bulk regeneration:', error);
    return NextResponse.json(
      { error: 'Failed to start bulk regeneration' },
      { status: 500 }
    );
  }
}
