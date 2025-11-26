import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { IconSparkles } from '@tabler/icons-react';

type JobPollingOptions = {
  jobId: string | null;
  onComplete: () => void;
  onError?: (error: string) => void;
  pollInterval?: number; // milliseconds, default 1000
};

/**
 * Hook for polling AI analysis job status
 *
 * Usage:
 * ```tsx
 * const [jobId, setJobId] = useState<string | null>(null);
 *
 * useJobPolling({
 *   jobId,
 *   onComplete: () => {
 *     setJobId(null);
 *     setGenerating(null);
 *     fetchDocument();
 *   },
 *   onError: (error) => {
 *     setJobId(null);
 *     setGenerating(null);
 *   },
 * });
 * ```
 */
export function useJobPolling({
  jobId,
  onComplete,
  onError,
  pollInterval = 1000,
}: JobPollingOptions) {
  useEffect(() => {
    if (!jobId) return;

    let isCancelled = false;

    const pollJob = async () => {
      try {
        const res = await fetch(`/api/report-builder/jobs/${jobId}`);
        if (!res.ok) {
          throw new Error('Failed to fetch job status');
        }

        const job = await res.json();

        if (isCancelled) return;

        if (job.status === 'COMPLETED') {
          notifications.show({
            title: 'Success',
            message: 'Response generated',
            color: 'green',
            icon: <IconSparkles size={18} />,
          });
          onComplete();
        } else if (job.status === 'FAILED') {
          const errorMessage = job.error || 'Unknown error';
          notifications.show({
            title: 'Generation Failed',
            message: errorMessage,
            color: 'red',
          });
          if (onError) {
            onError(errorMessage);
          } else {
            onComplete(); // Still call onComplete to cleanup state
          }
        }
        // If PENDING or PROCESSING, continue polling
      } catch (error) {
        console.error('Job polling error:', error);
        if (!isCancelled) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to check job status';
          notifications.show({
            title: 'Error',
            message: errorMessage,
            color: 'red',
          });
          if (onError) {
            onError(errorMessage);
          } else {
            onComplete(); // Still call onComplete to cleanup state
          }
        }
      }
    };

    // Poll immediately, then at interval
    pollJob();
    const interval = setInterval(pollJob, pollInterval);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [jobId, onComplete, onError, pollInterval]);
}
