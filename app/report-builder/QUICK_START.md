# Background Worker Quick Start

## 1. Database Setup

```bash
npx prisma db push
```

## 2. Using the Job API

### Create a generation job

```typescript
const response = await fetch('/api/report-builder/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    blockId: 'abc123',
    documentId: 'doc456',
    type: 'GENERATE', // or 'REFINE' or 'ANALYZE'
  }),
});

const { jobId } = await response.json();
```

### Check job status

```typescript
const response = await fetch(`/api/report-builder/jobs/${jobId}`);
const job = await response.json();

console.log(job.status); // PENDING, PROCESSING, COMPLETED, FAILED
console.log(job.result); // { content, tokensUsed, ... } when COMPLETED
console.log(job.error);  // error message when FAILED
```

## 3. Using the Hook (Recommended)

```typescript
import { useJobPolling } from '../hooks/useJobPolling';

function YourComponent() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Automatically polls and shows notifications
  useJobPolling({
    jobId,
    onComplete: () => {
      setJobId(null);
      setLoading(false);
      refreshData(); // Your refresh function
    },
  });

  const handleGenerate = async () => {
    setLoading(true);
    const res = await fetch('/api/report-builder/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId, documentId, type: 'GENERATE' }),
    });
    const { jobId } = await res.json();
    setJobId(jobId); // Start polling
  };

  return (
    <Button onClick={handleGenerate} loading={loading}>
      Generate
    </Button>
  );
}
```

## 4. Job Types

- **GENERATE**: New content from prompt → updates block
- **REFINE**: Improve existing content → updates block
- **ANALYZE**: Analyze evidence → returns insights (no block update)

## 5. Context Configuration

Set `document.contextConfig` to control what evidence is used:

```json
{
  "evidenceDateRange": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "evidenceTypes": ["PR_AUTHORED", "PR_REVIEWED"],
  "maxEvidence": 50,
  "includeGoals": true,
  "includeReviews": true
}
```

## 6. Monitoring Jobs

```bash
# List recent jobs
curl http://localhost:3000/api/report-builder/jobs?limit=10

# Check specific job
curl http://localhost:3000/api/report-builder/jobs/{jobId}

# Cancel a job
curl -X DELETE http://localhost:3000/api/report-builder/jobs/{jobId}
```

## 7. Error Handling

Jobs fail gracefully and set `status: 'FAILED'` with an error message:

- Missing API key
- Invalid block/document ID
- Claude API errors
- Timeout issues

The polling hook automatically shows error notifications.

## That's it!

For detailed integration instructions, see `BACKGROUND_WORKER_INTEGRATION.md`.
