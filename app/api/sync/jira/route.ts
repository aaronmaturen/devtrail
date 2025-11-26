import { NextRequest, NextResponse } from 'next/server';

/**
 * @deprecated Traditional Jira sync is deprecated.
 * Use POST /api/sync/agent with agentType: 'jira' instead.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Traditional Jira sync is deprecated. Use /api/sync/agent with agentType: "jira" instead.',
      migration: 'POST /api/sync/agent { agentType: "jira", startDate?, endDate?, dryRun?, updateExisting? }',
    },
    { status: 410 } // 410 Gone
  );
}

/**
 * @deprecated Traditional Jira sync jobs list is deprecated.
 * Use GET /api/sync/agent?agentType=jira instead.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    {
      error: 'Traditional Jira sync jobs endpoint is deprecated. Use /api/sync/agent?agentType=jira instead.',
    },
    { status: 410 }
  );
}
