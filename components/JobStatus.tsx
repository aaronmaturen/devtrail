'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Badge,
  Group,
  Text,
  Progress,
  Divider,
  Paper,
  Code,
  Alert,
  Stack,
  Loader,
} from '@mantine/core';
import {
  IconCheck,
  IconX,
  IconClock,
  IconAlertCircle,
} from '@tabler/icons-react';

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  result: any;
  error: string | null;
  config: any;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobStatusProps {
  jobId: string;
  onComplete?: () => void;
  onError?: () => void;
  pollInterval?: number; // milliseconds, default 2000
}

export function JobStatus({
  jobId,
  onComplete,
  onError,
  pollInterval = 2000,
}: JobStatusProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobStatus();
  }, [jobId]);

  useEffect(() => {
    if (job && (job.status === 'PENDING' || job.status === 'RUNNING')) {
      const interval = setInterval(() => {
        fetchJobStatus();
      }, pollInterval);

      return () => clearInterval(interval);
    } else if (job) {
      // Job is complete or failed
      if (job.status === 'COMPLETED' && onComplete) {
        onComplete();
      } else if (job.status === 'FAILED' && onError) {
        onError();
      }
    }
  }, [job?.status, jobId]);

  const fetchJobStatus = async () => {
    try {
      const response = await fetch(`/api/sync/status/${jobId}`);
      if (response.ok) {
        const data = await response.json();
        setJob(data);
      } else {
        console.error('Failed to fetch job status');
      }
    } catch (error) {
      console.error('Failed to fetch job status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <IconCheck size={16} />;
      case 'FAILED':
      case 'CANCELLED':
        return <IconX size={16} />;
      case 'RUNNING':
        return <Loader size={16} />;
      case 'PENDING':
        return <IconClock size={16} />;
      default:
        return <IconAlertCircle size={16} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'green';
      case 'FAILED':
        return 'red';
      case 'CANCELLED':
        return 'gray';
      case 'RUNNING':
        return 'blue';
      case 'PENDING':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  if (loading || !job) {
    return (
      <Card withBorder padding="lg" radius="md">
        <Group justify="center">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading job status...</Text>
        </Group>
      </Card>
    );
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between" mb="md">
        <Text fw={500} size="lg">Job Status</Text>
        <Badge
          color={getStatusColor(job.status)}
          leftSection={getStatusIcon(job.status)}
        >
          {job.status}
        </Badge>
      </Group>

      <Stack gap="sm">
        <div>
          <Text size="xs" c="dimmed">Progress</Text>
          <Progress
            value={job.progress}
            animated={job.status === 'RUNNING'}
            mt={4}
            color={getStatusColor(job.status)}
          />
          <Text size="xs" c="dimmed" mt={4}>{job.progress}%</Text>
        </div>

        <Divider />

        <div>
          <Text size="xs" c="dimmed" mb="xs">Logs</Text>
          <Paper withBorder p="xs" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <Code block style={{ fontSize: '0.75rem' }}>
              {job.logs.map((log, idx) => (
                <div key={idx}>
                  [{new Date(log.timestamp).toLocaleTimeString()}] {log.level.toUpperCase()}: {log.message}
                </div>
              ))}
            </Code>
          </Paper>
        </div>

        {job.error && (
          <Alert icon={<IconX size={16} />} title="Error" color="red">
            {job.error}
          </Alert>
        )}

        {job.status === 'COMPLETED' && job.result && (
          <Alert icon={<IconCheck size={16} />} title="Success" color="green">
            Job completed successfully
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
