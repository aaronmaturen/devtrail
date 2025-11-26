# AI Analysis Worker

The AI Analysis worker analyzes evidence items using Claude AI to extract impact, match performance criteria, and generate compelling summaries.

## Overview

The `AI_ANALYSIS` job type processes evidence records (from GitHub PRs, Jira tickets, Slack messages, or manual entries) to:

1. **Extract Key Impact** - Identify and articulate the specific achievement or contribution
2. **Match Performance Criteria** - Find the best matching criterion from your criteria.csv
3. **Generate Summary** - Create a concise, compelling 2-3 sentence summary
4. **Store Results** - Update the evidence record with AI analysis and criterion mapping

## Job Configuration

### Analyze a Single Evidence Item

```typescript
const job = await prisma.job.create({
  data: {
    type: 'AI_ANALYSIS',
    status: 'PENDING',
    config: JSON.stringify({
      evidenceId: 'clx123abc',
      forceReanalysis: false, // Optional: set to true to reanalyze
    }),
  },
});
```

### Analyze Multiple Evidence Items

```typescript
const job = await prisma.job.create({
  data: {
    type: 'AI_ANALYSIS',
    status: 'PENDING',
    config: JSON.stringify({
      evidenceIds: ['clx123abc', 'clx456def', 'clx789ghi'],
      forceReanalysis: false,
    }),
  },
});
```

## Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `evidenceId` | string | No* | Single evidence ID to analyze |
| `evidenceIds` | string[] | No* | Array of evidence IDs to analyze |
| `forceReanalysis` | boolean | No | If true, reanalyze even if already analyzed (default: false) |

\* Either `evidenceId` or `evidenceIds` is required

## Job Result

The job returns a result with the following structure:

```typescript
{
  totalItems: number,
  successCount: number,
  failedCount: number,
  results: Array<{
    evidenceId: string,
    success: boolean,
    analysis?: {
      impact: string,
      criterion: string,
      criterionId?: number,
      summary: string,
      confidence: number
    },
    error?: string
  }>
}
```

## What Gets Updated

For each successfully analyzed evidence item:

1. **EvidenceCriterion record created** - Maps the evidence to the best matching performance criterion with a confidence score
2. **Evidence summary updated** - If the AI-generated summary is better (longer) than the existing one

## Example Usage from API

```typescript
// In an API route
import { prisma } from '@/lib/db/prisma';

export async function POST(request: Request) {
  const { evidenceIds } = await request.json();

  // Create the job
  const job = await prisma.job.create({
    data: {
      type: 'AI_ANALYSIS',
      status: 'PENDING',
      config: JSON.stringify({
        evidenceIds,
        forceReanalysis: false,
      }),
    },
  });

  // Jobs are processed by the background worker
  return Response.json({ jobId: job.id });
}
```

## Processing Flow

1. **Job Created** - Job is created with status PENDING
2. **Job Picked Up** - Background worker picks up the job via `processPendingJobs()`
3. **Job Processing** - Worker calls `processAIAnalysisJob(jobId)`
   - Validates configuration
   - Fetches evidence items with all relations (PR, Jira, Slack, etc.)
   - Loads all performance criteria from database
   - For each evidence item:
     - Checks if already analyzed (skips if already analyzed and not forcing)
     - Builds context prompt with evidence details and criteria list
     - Calls Claude API to analyze
     - Parses JSON response
     - Updates evidence record with criterion mapping
     - Updates summary if improved
4. **Job Completed** - Job status set to COMPLETED with detailed results

## AI Analysis Prompt

The worker constructs a prompt that includes:

- **Evidence Context**: Details from the source (PR, Jira, Slack, manual)
- **Current Summary**: Existing evidence summary
- **Performance Criteria**: Complete list of available criteria with IDs
- **Instructions**: Specific guidance to extract impact, match criterion, and create summary

The AI responds with JSON containing:
- `impact`: Specific impact statement
- `criterionId`: ID of best matching criterion (or null)
- `criterion`: Explanation of the match
- `summary`: 2-3 sentence compelling summary
- `confidence`: Confidence score (0-100)

## Error Handling

- If evidence not found, individual item fails (doesn't abort entire job)
- If API key not configured, entire job fails with clear error
- If AI response can't be parsed, individual item fails with parse error
- All errors are logged and included in job result

## Progress Tracking

The job updates its progress and logs:
- 0%: Job started
- 10%: AI client initialized
- 15%: Criteria loaded
- 15-85%: Processing evidence items (proportional to count)
- 100%: Analysis complete

## Database Schema

### Job Table
```sql
type: 'AI_ANALYSIS'
status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
config: JSON string with evidenceId(s) and options
result: JSON string with analysis results
```

### Evidence Table
```sql
-- Evidence record gets updated with better summary if available
summary: string (updated if AI provides better summary)
```

### EvidenceCriterion Table (Junction)
```sql
-- New record created for criterion match
evidenceId: string (foreign key to Evidence)
criterionId: number (foreign key to Criterion)
confidence: number (0-100)
explanation: string (the impact statement)
```

## Performance Considerations

- **Batch Processing**: Use `evidenceIds` array to analyze multiple items in one job
- **Deduplication**: Worker skips already-analyzed evidence by default (unless `forceReanalysis: true`)
- **Rate Limiting**: Each evidence item makes one Claude API call (consider API rate limits)
- **Model Selection**: Uses configured model from database (defaults to claude-sonnet-4-5-20250929)

## Example: Analyze All Unanalyzed Evidence

```typescript
// Find evidence without criteria matches
const unanalyzedEvidence = await prisma.evidence.findMany({
  where: {
    criteria: {
      none: {}, // No criteria mappings
    },
  },
  select: {
    id: true,
  },
});

// Create analysis job
const job = await prisma.job.create({
  data: {
    type: 'AI_ANALYSIS',
    status: 'PENDING',
    config: JSON.stringify({
      evidenceIds: unanalyzedEvidence.map((e) => e.id),
      forceReanalysis: false,
    }),
  },
});

console.log(`Created analysis job for ${unanalyzedEvidence.length} evidence items`);
```

## Related Workers

- **REVIEW_ANALYSIS**: Analyzes performance review documents (different from evidence analysis)
- **AGENT_GITHUB_SYNC**: Syncs GitHub PRs and creates evidence records
- **AGENT_JIRA_SYNC**: Syncs Jira tickets and creates evidence records

## Testing

To test the AI analysis worker:

```bash
# 1. Ensure you have evidence in the database
npm run sync

# 2. Create a test job via Prisma Studio or API
# 3. Run the job processor
node -e "
  const { processPendingJobs } = require('./lib/workers/job-processor.ts');
  processPendingJobs().then(console.log).catch(console.error);
"
```
