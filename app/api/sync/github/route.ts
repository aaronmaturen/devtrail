import { NextRequest, NextResponse } from 'next/server';

/**
 * @deprecated Traditional GitHub sync is deprecated.
 * Use POST /api/sync/agent with agentType: 'github' instead.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Traditional GitHub sync is deprecated. Use /api/sync/agent with agentType: "github" instead.',
      migration: 'POST /api/sync/agent { agentType: "github", startDate?, endDate?, dryRun?, updateExisting? }',
    },
    { status: 410 } // 410 Gone
  );
}

/**
 * @deprecated Traditional GitHub sync jobs list is deprecated.
 * Use GET /api/sync/agent?agentType=github instead.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Traditional GitHub sync jobs endpoint is deprecated. Use /api/sync/agent?agentType=github instead.',
    },
    { status: 410 }
  );
}
