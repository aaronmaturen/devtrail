# DevTrail Workers System

This directory contains the background worker system for processing asynchronous jobs in DevTrail.

## Architecture Overview

The worker system follows a job queue pattern with the following components:

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   API Endpoint  │──────>│   Job Queue      │──────>│  Job Processor  │
│  (create job)   │       │   (Database)     │       │  (worker logic) │
└─────────────────┘       └──────────────────┘       └─────────────────┘
                                                              │
                                                              v
                                                      ┌───────────────┐
                                                      │ Job Handlers  │
                                                      │ - GitHub Sync │
                                                      │ - Reports     │
                                                      │ - AI Analysis │
                                                      └───────────────┘
```

## Components

### 1. Job Queue (Database)

Jobs are stored in the `Job` table with the following states:
- `PENDING`: Job created and waiting to be processed
- `RUNNING`: Job is currently being processed
- `COMPLETED`: Job finished successfully
- `FAILED`: Job encountered an error
- `CANCELLED`: Job was manually cancelled

### 2. Job Processor (`lib/workers/job-processor.ts`)

The central orchestrator that:
- Fetches pending jobs from the database
- Routes jobs to appropriate handlers based on type
- Manages job status transitions
- Handles errors and logging
- Provides utility functions for job management

Key functions:
```typescript
processPendingJobs(): Process all pending jobs
processJobById(jobId): Process a specific job
cancelJob(jobId): Cancel a job
getJobStatus(jobId): Get job details
cleanupOldJobs(days): Remove old completed jobs
```

### 3. Job Handlers

#### GitHub Sync Worker (`lib/workers/github-sync.ts`)

Processes `GITHUB_SYNC` jobs to fetch PRs from GitHub and analyze them with Claude AI.

**Job Configuration:**
```json
{
  "repositories": ["owner/repo1", "owner/repo2"],
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2025-01-01T00:00:00.000Z",
  "githubToken": "ghp_...",
  "anthropicApiKey": "sk-ant-...",
  "userContext": "I am a senior developer...",
  "dryRun": false
}
```

**Processing Steps:**
1. Authenticate with GitHub using provided token
2. For each repository:
   - Fetch merged PRs within date range
   - Filter to PRs where user was author or commenter
   - Check for duplicate evidence entries
3. For each PR:
   - Fetch comments and file changes
   - Extract component information from file paths
   - Calculate PR metrics (duration, additions, deletions)
   - Analyze with Claude AI to match against criteria
   - Store evidence in database
   - Link matched criteria via `EvidenceCriterion` table
4. Update progress incrementally (0-100%)
5. Log all activities to job record

**Component Extraction:**

The worker analyzes file paths to identify architectural components:
- Frontend patterns: `src/components`, `app/pages`, `src/features`
- Backend patterns: `controllers`, `routes`, `models`, `services`
- Weighted by depth and frequency for accurate categorization

**Claude AI Analysis:**

Uses the exact prompt from the original `scripts/sync.js`:
- Analyzes PR title, description, comments, and file changes
- Matches against PR-detectable criteria from database
- Returns confidence scores (0-100) for each match
- Stores detailed evidence explanations

**Rate Limiting:**
- 100ms delay between PR processing
- Respects GitHub API rate limits
- Handles Anthropic API rate limits gracefully

### 4. API Endpoint (`app/api/workers/process-jobs/route.ts`)

**Endpoints:**

```bash
# Process all pending jobs
GET /api/workers/process-jobs
POST /api/workers/process-jobs

# Process specific job
GET /api/workers/process-jobs?jobId=<id>
POST /api/workers/process-jobs { "jobId": "<id>" }
```

**Response:**
```json
{
  "success": true,
  "message": "Processed 3 jobs successfully, 0 failed",
  "processed": 3,
  "failed": 0,
  "jobs": [
    {
      "id": "clx...",
      "type": "GITHUB_SYNC",
      "status": "COMPLETED"
    }
  ]
}
```

## Usage

### 1. Create a Job

```typescript
// Via API endpoint
const response = await fetch('/api/sync/github', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    repositories: ['owner/repo'],
    githubToken: 'ghp_...',
    anthropicApiKey: 'sk-ant-...',
    userContext: 'I am a senior developer...',
    dryRun: false
  })
});

const { jobId } = await response.json();
```

### 2. Process Jobs

**Manual Processing:**
```bash
curl http://localhost:3000/api/workers/process-jobs
```

**Cron Job (Vercel):**
```json
{
  "crons": [
    {
      "path": "/api/workers/process-jobs",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**External Cron (GitHub Actions, etc.):**
```yaml
- name: Process DevTrail Jobs
  run: |
    curl -X POST https://your-app.vercel.app/api/workers/process-jobs
```

### 3. Monitor Job Status

```typescript
// Get job status via API
const status = await fetch(`/api/sync/status/${jobId}`);
const job = await status.json();

console.log(job.status);   // PENDING, RUNNING, COMPLETED, FAILED
console.log(job.progress);  // 0-100
console.log(job.logs);      // Array of log entries
console.log(job.result);    // Job result data
```

### 4. Real-time Progress

The job stores progress and logs incrementally:

```typescript
{
  "id": "clx...",
  "status": "RUNNING",
  "progress": 45,
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "level": "info",
      "message": "Processing repository owner/repo"
    },
    {
      "timestamp": "2024-01-15T10:30:05.000Z",
      "level": "info",
      "message": "Found 25 merged PRs in owner/repo"
    },
    {
      "timestamp": "2024-01-15T10:30:10.000Z",
      "level": "info",
      "message": "Analyzing PR #123 with Claude AI"
    }
  ],
  "config": {
    "_progress": {
      "currentRepo": "owner/repo",
      "currentPR": 123,
      "totalPRs": 25,
      "processedPRs": 12
    }
  }
}
```

## Database Schema

### Job Table
```prisma
model Job {
  id          String    @id @default(cuid())
  type        String    // GITHUB_SYNC, REPORT_GENERATION, etc.
  status      String    // PENDING, RUNNING, COMPLETED, FAILED
  progress    Int       @default(0) // 0-100
  logs        String    @default("[]") // JSON array
  result      String?   // JSON result data
  error       String?   // Error message if failed
  config      String?   // JSON config

  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### Evidence Tables
```prisma
model EvidenceEntry {
  id           String   @id @default(cuid())
  type         String   // PR, SLACK, MANUAL
  title        String
  description  String?
  content      String   // JSON

  // PR-specific
  prNumber     Int?
  prUrl        String?
  repository   String?
  mergedAt     DateTime?
  additions    Int?
  deletions    Int?
  changedFiles Int?
  components   String?  // JSON array

  criteria     EvidenceCriterion[]
}

model EvidenceCriterion {
  evidenceId   String
  criterionId  Int
  confidence   Float    // 0.0-1.0
  explanation  String?

  evidence     EvidenceEntry @relation(...)
  criterion    Criterion     @relation(...)

  @@id([evidenceId, criterionId])
}
```

## Error Handling

The worker system includes comprehensive error handling:

1. **Job-level errors**: Caught and stored in `job.error` field
2. **PR-level errors**: Logged but don't fail the entire job
3. **Rate limiting**: Automatic delays and retry logic
4. **Validation**: Config validation before processing starts
5. **Logging**: All activities logged to job record for debugging

## Extending the System

### Adding a New Job Type

1. Create a new worker file in `lib/workers/`:

```typescript
// lib/workers/my-new-worker.ts
export async function processMyNewJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  const config = JSON.parse(job.config || '{}');

  // Mark as running
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date() }
  });

  try {
    // Your processing logic here

    // Mark as completed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        result: JSON.stringify({ /* result data */ })
      }
    });
  } catch (error) {
    // Mark as failed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error.message
      }
    });
    throw error;
  }
}
```

2. Add the handler to `job-processor.ts`:

```typescript
case 'MY_NEW_JOB_TYPE':
  await processMyNewJob(job.id);
  break;
```

3. Create an API endpoint to trigger the job:

```typescript
// app/api/my-new-job/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();

  const job = await prisma.job.create({
    data: {
      type: 'MY_NEW_JOB_TYPE',
      status: 'PENDING',
      config: JSON.stringify(body)
    }
  });

  return NextResponse.json({ jobId: job.id });
}
```

## Performance Considerations

- **Sequential Processing**: Jobs are processed one at a time to avoid overwhelming the system
- **Rate Limiting**: Built-in delays for API calls
- **Pagination**: GitHub API results are paginated (100 per page)
- **Memory Management**: Large results stored in database, not in memory
- **Duplicate Detection**: Checks for existing evidence before creating new entries

## Security

- **Token Storage**: API keys stored in job config (consider encryption for production)
- **Job Isolation**: Each job runs independently
- **Error Messages**: Sensitive data sanitized in error messages
- **Access Control**: Add authentication middleware to API endpoints in production

## Monitoring

Monitor your workers using:

1. **Job Dashboard**: Build a UI to display job status, logs, and progress
2. **Database Queries**: Query job table for statistics
3. **Logging**: All activities logged with timestamps
4. **Alerts**: Set up notifications for failed jobs

## Future Enhancements

Potential improvements for the worker system:

1. **Parallel Processing**: Process multiple jobs concurrently
2. **Priority Queue**: High-priority jobs processed first
3. **Retry Logic**: Automatic retry for failed jobs
4. **Job Scheduling**: Schedule jobs for future execution
5. **Webhook Support**: Trigger jobs via webhooks
6. **Progress Streaming**: WebSocket support for real-time updates
7. **Job Dependencies**: Chain jobs together
8. **Resource Limits**: CPU/memory limits per job
9. **Job Timeouts**: Automatic cancellation after timeout
10. **Dead Letter Queue**: Special handling for permanently failed jobs
