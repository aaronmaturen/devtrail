'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Badge,
  Grid,
  Paper,
  Table,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconRefresh,
  IconTrash,
  IconClock,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconSettings,
} from '@tabler/icons-react';

interface JobStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export default function AdminPanel() {
  const [stats, setStats] = useState<JobStats>({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadStats();
    loadRecentJobs();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/jobs/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load job stats:', error);
    }
  };

  const loadRecentJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/jobs?limit=10');
      if (response.ok) {
        const data = await response.json();
        setRecentJobs(data);
      }
    } catch (error) {
      console.error('Failed to load recent jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    await Promise.all([loadStats(), loadRecentJobs()]);
    notifications.show({
      title: 'Refreshed',
      message: 'Job data has been refreshed',
      color: 'blue',
      icon: <IconRefresh size={16} />,
    });
  };

  const clearFailedJobs = async () => {
    setClearing(true);
    try {
      const response = await fetch('/api/jobs/clear-failed', {
        method: 'POST',
      });
      if (response.ok) {
        const result = await response.json();
        notifications.show({
          title: 'Cleared Unsuccessful Jobs',
          message: `Deleted ${result.deleted} failed/cancelled jobs`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        await refreshData();
      } else {
        throw new Error('Failed to clear jobs');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to clear jobs',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setClearing(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/sync/status/${jobId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        notifications.show({
          title: 'Job Deleted',
          message: 'Job has been deleted',
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        await refreshData();
      } else {
        throw new Error('Failed to delete job');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete job',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <IconCheck size={14} />;
      case 'FAILED':
      case 'CANCELLED':
        return <IconX size={14} />;
      case 'RUNNING':
        return <Loader size={14} />;
      case 'PENDING':
        return <IconClock size={14} />;
      default:
        return <IconAlertCircle size={14} />;
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

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>
            <IconSettings size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Admin Panel
          </Title>
          <Text size="sm" c="dimmed">
            Manage and monitor background jobs
          </Text>
        </div>
        <Group>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={refreshData}
            size="sm"
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <Stack gap="md">
        {/* Job Statistics */}
        <div>
          <Text fw={500} mb="xs">
            Job Statistics
          </Text>
          <Grid gutter="xs">
            <Grid.Col span={4}>
              <Paper withBorder p="xs" style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700}>
                  {stats.total}
                </Text>
                <Text size="xs" c="dimmed">
                  Total Jobs
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={4}>
              <Paper withBorder p="xs" style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} c="yellow">
                  {stats.pending}
                </Text>
                <Text size="xs" c="dimmed">
                  Pending
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={4}>
              <Paper withBorder p="xs" style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} c="blue">
                  {stats.running}
                </Text>
                <Text size="xs" c="dimmed">
                  Running
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={4}>
              <Paper withBorder p="xs" style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} c="green">
                  {stats.completed}
                </Text>
                <Text size="xs" c="dimmed">
                  Completed
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={4}>
              <Paper withBorder p="xs" style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} c="red">
                  {stats.failed}
                </Text>
                <Text size="xs" c="dimmed">
                  Failed
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={4}>
              <Paper withBorder p="xs" style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} c="gray">
                  {stats.cancelled}
                </Text>
                <Text size="xs" c="dimmed">
                  Cancelled
                </Text>
              </Paper>
            </Grid.Col>
          </Grid>
        </div>

        {/* Actions */}
        <div>
          <Text fw={500} mb="xs">
            Actions
          </Text>
          <Button
            leftSection={<IconTrash size={16} />}
            color="red"
            variant="light"
            onClick={clearFailedJobs}
            loading={clearing}
            disabled={stats.failed === 0 && stats.cancelled === 0}
          >
            Clear Unsuccessful Jobs ({stats.failed + stats.cancelled})
          </Button>
        </div>

        {/* Recent Jobs */}
        <div>
          <Text fw={500} mb="xs">
            Recent Jobs
          </Text>
          {loading ? (
            <Group justify="center" p="xl">
              <Loader size="md" />
            </Group>
          ) : recentJobs.length === 0 ? (
            <Alert icon={<IconAlertCircle size={16} />} color="gray">
              No jobs found
            </Alert>
          ) : (
            <Paper withBorder>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Progress</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recentJobs.map((job) => (
                    <Table.Tr key={job.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {job.type.replace('_', ' ')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          color={getStatusColor(job.status)}
                          leftSection={getStatusIcon(job.status)}
                        >
                          {job.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{job.progress}%</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {new Date(job.createdAt).toLocaleString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Delete job">
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() => deleteJob(job.id)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </div>
      </Stack>
    </Card>
  );
}
