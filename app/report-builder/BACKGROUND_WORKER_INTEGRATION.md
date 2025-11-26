# Background Worker Integration Guide

This guide explains how to integrate the AI Analysis Background Worker system into the report-builder editor page.

## Overview

The background worker system allows AI content generation to happen asynchronously, preventing timeout issues and providing a better user experience for long-running AI operations.

## Architecture

```
User clicks "Generate"
  → POST /api/report-builder/jobs (creates job, returns jobId)
  → processJob() runs in background
  → Frontend polls GET /api/report-builder/jobs/{jobId}
  → When status === 'COMPLETED', update UI
```

## Integration Steps

### Step 1: Add State

Add the job ID state to track the active background job:

```tsx
// In app/report-builder/[id]/page.tsx

const [generating, setGenerating] = useState<string | null>(null);
const [activeJobId, setActiveJobId] = useState<string | null>(null); // ADD THIS
```

### Step 2: Import the Polling Hook

```tsx
import { useJobPolling } from '../hooks/useJobPolling';
```

### Step 3: Use the Polling Hook

Add the hook after your state declarations:

```tsx
// Poll for job completion
useJobPolling({
  jobId: activeJobId,
  onComplete: () => {
    setActiveJobId(null);
    setGenerating(null);
    fetchDocument();
  },
  onError: () => {
    setActiveJobId(null);
    setGenerating(null);
  },
});
```

### Step 4: Update handleGenerateResponse

Replace the current synchronous generation with the job-based approach:

```tsx
const handleGenerateResponse = async (blockId: string) => {
  setGenerating(blockId);
  try {
    // Create a background job instead of synchronous generation
    const response = await fetch(`/api/report-builder/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId,
        documentId,
        type: 'GENERATE',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start generation');
    }

    const { jobId } = await response.json();
    setActiveJobId(jobId); // Start polling

    notifications.show({
      title: 'Generating',
      message: 'AI is working on your response...',
      color: 'blue',
      icon: <IconSparkles size={18} />,
      autoClose: 3000,
    });

  } catch (error) {
    console.error('Failed to generate:', error);
    notifications.show({
      title: 'Error',
      message: error instanceof Error ? error.message : 'Failed to start generation',
      color: 'red',
    });
    setGenerating(null);
  }
  // Note: Don't set setGenerating(null) here - it's done in the polling hook
};
```

### Step 5: Update UI Indicators

The UI should show loading state while `generating` is set:

```tsx
<ActionIcon
  variant="light"
  color="green"
  loading={generating === block.id}  // This shows spinner while job runs
  onClick={() => handleGenerateResponse(block.id)}
  disabled={!block.prompt}
>
  <IconSparkles size={16} />
</ActionIcon>
```

## Database Migration

After modifying the Prisma schema, run:

```bash
npx prisma db push
```

This will create the `analysis_jobs` table.

## API Endpoints

### Create Job
```
POST /api/report-builder/jobs
Body: { blockId, documentId, type: 'GENERATE' | 'REFINE' | 'ANALYZE', prompt? }
Response: { jobId, status: 'PENDING' }
```

### Check Job Status
```
GET /api/report-builder/jobs/{jobId}
Response: {
  id, type, status, result, error,
  createdAt, completedAt, blockId, documentId
}
```

### List Jobs
```
GET /api/report-builder/jobs?documentId={id}&status={status}&limit=50
Response: { jobs: [...] }
```

### Cancel Job (Optional)
```
DELETE /api/report-builder/jobs/{jobId}
Response: { success: true, message: 'Job cancelled' }
```

## Job Types

- **GENERATE**: Create new AI content for a block from its prompt
- **REFINE**: Refine existing content based on feedback
- **ANALYZE**: Analyze evidence or content without updating a block

## Background Processing

The `processJob()` function in `processor.ts`:

1. Updates job status to 'PROCESSING'
2. Fetches context (evidence, goals, reviews) based on document config
3. Calls Claude API with appropriate prompts
4. Updates the block content
5. Creates a revision record
6. Marks job as 'COMPLETED' with result

## Error Handling

Jobs can fail at any stage:
- Missing API key → status: 'FAILED', error: 'No Anthropic API key configured'
- Claude API error → status: 'FAILED', error: (API error message)
- Block not found → status: 'FAILED', error: 'Block not found'

The polling hook automatically shows error notifications and calls `onError()`.

## Production Considerations

This is a simplified in-process background job system. For production at scale, consider:

- **BullMQ + Redis**: Proper job queue with retry logic and persistence
- **Vercel Background Functions**: Serverless background jobs (if on Vercel)
- **AWS SQS + Lambda**: Message queue with worker functions
- **Job persistence**: Currently jobs are in SQLite; consider dedicated job storage
- **Timeouts**: Add maximum job runtime and cleanup for stuck jobs
- **Rate limiting**: Prevent too many concurrent AI jobs

## Testing

1. Create a new report document
2. Add a PROMPT_RESPONSE block with a prompt
3. Click "Generate"
4. Watch the loading spinner
5. After ~2-5 seconds, content should appear
6. Check Network tab to see job creation and polling

## Troubleshooting

**Job stays in PENDING forever**
- Check console logs for `processJob()` errors
- Verify Anthropic API key in Config table
- Check database for job status

**Polling stops early**
- Verify polling interval (default 1000ms)
- Check network tab for 404/500 errors
- Look for console errors in polling hook

**Block doesn't update after completion**
- Verify `fetchDocument()` is called in `onComplete`
- Check job result in database
- Look for errors in `processGenerateJob()`

## Next Steps

After integration:
1. Test with various prompts
2. Add job cancellation UI if needed
3. Show job progress/status in UI
4. Add job history view
5. Implement REFINE and ANALYZE job types in chat drawer
