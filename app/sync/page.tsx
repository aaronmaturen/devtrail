'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Button,
  Stack,
  Group,
  Timeline,
  Code,
  Badge,
  Progress,
  Loader,
  Grid,
  Paper,
  Divider,
  Alert,
  List,
  ThemeIcon,
  Tabs,
  Checkbox,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconBrandGithub,
  IconRefresh,
  IconCheck,
  IconX,
  IconClock,
  IconAlertCircle,
  IconPlayerPlay,
  IconSettings,
  IconCalendar,
  IconTicket,
  IconCopy,
} from '@tabler/icons-react';
import Link from 'next/link';
import AdminPanel from '@/components/AdminPanel';

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

interface Config {
  key: string;
  value: any;
  encrypted: boolean;
  description?: string;
}

interface SyncConfig {
  hasGithubToken: boolean;
  hasAnthropicKey: boolean;
  hasJiraConfig: boolean;
  repositories: string[];
  jiraProjects: string[];
  jiraHost: string;
  jiraEmail: string;
  jiraApiToken: string;
  userContext: string;
}

export default function SyncPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jiraJobs, setJiraJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<string>('github');
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    hasGithubToken: false,
    hasAnthropicKey: false,
    hasJiraConfig: false,
    repositories: [],
    jiraProjects: [],
    jiraHost: '',
    jiraEmail: '',
    jiraApiToken: '',
    userContext: '',
  });
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [workerHealthy, setWorkerHealthy] = useState<boolean>(true);

  // Load saved config on mount
  useEffect(() => {
    loadSavedConfig();
    loadRecentJobs();
    loadRecentJiraJobs();
    checkWorkerHealth(); // One-time check to remind if worker isn't running
  }, []);

  // Poll active job for updates
  useEffect(() => {
    if (activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'RUNNING')) {
      const interval = setInterval(() => {
        fetchJobStatus(activeJob.id);
      }, 2000); // Poll every 2 seconds

      setPollingInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [activeJob?.id, activeJob?.status]);

  const loadSavedConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const configs: Config[] = await response.json();

        const newConfig: SyncConfig = {
          hasGithubToken: false,
          hasAnthropicKey: false,
          hasJiraConfig: false,
          repositories: [],
          jiraProjects: [],
          jiraHost: '',
          jiraEmail: '',
          jiraApiToken: '',
          userContext: '',
        };

        configs.forEach((config) => {
          if (config.key === 'github_token' && config.value) {
            newConfig.hasGithubToken = true;
          } else if (config.key === 'selected_repos' && config.value) {
            newConfig.repositories = config.value;
          } else if (config.key === 'anthropic_api_key' && config.value) {
            newConfig.hasAnthropicKey = true;
          } else if (config.key === 'user_context' && config.value) {
            newConfig.userContext = config.value;
          } else if (config.key === 'jira_host' && config.value) {
            newConfig.jiraHost = config.value;
            newConfig.hasJiraConfig = true;
          } else if (config.key === 'jira_email' && config.value) {
            newConfig.jiraEmail = config.value;
          } else if (config.key === 'jira_api_token' && config.value) {
            newConfig.jiraApiToken = config.value;
          } else if (config.key === 'selected_projects' && config.value) {
            newConfig.jiraProjects = config.value;
          }
        });

        // Only mark Jira as configured if we have all required fields
        if (!newConfig.jiraHost || !newConfig.jiraEmail || !newConfig.jiraApiToken) {
          newConfig.hasJiraConfig = false;
        }

        setSyncConfig(newConfig);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  const loadRecentJobs = async () => {
    try {
      const response = await fetch('/api/sync/github?limit=10');
      if (response.ok) {
        const data = await response.json();
        setJobs(data);

        // Set active job to most recent if it's running
        const runningJob = data.find(
          (job: Job) => job.status === 'PENDING' || job.status === 'RUNNING'
        );
        if (runningJob && activeTab === 'github') {
          setActiveJob(runningJob);
        }
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const loadRecentJiraJobs = async () => {
    try {
      const response = await fetch('/api/sync/jira?limit=10');
      if (response.ok) {
        const data = await response.json();
        setJiraJobs(data);

        // Set active job to most recent if it's running
        const runningJob = data.find(
          (job: Job) => job.status === 'PENDING' || job.status === 'RUNNING'
        );
        if (runningJob && activeTab === 'jira') {
          setActiveJob(runningJob);
        }
      }
    } catch (error) {
      console.error('Failed to load Jira jobs:', error);
    }
  };

  const checkWorkerHealth = async () => {
    try {
      const response = await fetch('/api/worker/health');
      if (response.ok) {
        const data = await response.json();
        setWorkerHealthy(data.healthy);
      } else {
        setWorkerHealthy(false);
      }
    } catch (error) {
      console.error('Failed to check worker health:', error);
      setWorkerHealthy(false);
    }
  };

  const fetchJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/sync/status/${jobId}`);
      if (response.ok) {
        const job = await response.json();
        setActiveJob(job);

        // Update job in the jobs list
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? job : j))
        );

        // Show notification when job completes
        if (job.status === 'COMPLETED' && activeJob?.status !== 'COMPLETED') {
          notifications.show({
            title: 'Sync completed',
            message: 'GitHub sync has finished successfully',
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        } else if (job.status === 'FAILED' && activeJob?.status !== 'FAILED') {
          notifications.show({
            title: 'Sync failed',
            message: job.error || 'GitHub sync failed',
            color: 'red',
            icon: <IconX size={16} />,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch job status:', error);
    }
  };

  const startSync = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          dryRun,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        notifications.show({
          title: 'Sync started',
          message: 'GitHub sync job has been created',
          color: 'blue',
          icon: <IconPlayerPlay size={16} />,
        });

        // Fetch the job status and set as active
        await fetchJobStatus(data.jobId);
        await loadRecentJobs();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start sync');
      }
    } catch (error) {
      console.error('Failed to start sync:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to start sync',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const startJiraSync = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sync/jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          dryRun,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        notifications.show({
          title: 'Sync started',
          message: 'Jira sync job has been created',
          color: 'blue',
          icon: <IconPlayerPlay size={16} />,
        });

        // Fetch the job status and set as active
        await fetchJobStatus(data.jobId);
        await loadRecentJiraJobs();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start Jira sync');
      }
    } catch (error) {
      console.error('Failed to start Jira sync:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to start Jira sync',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmStartSync = () => {
    modals.openConfirmModal({
      title: 'Start GitHub Sync',
      children: (
        <Text size="sm">
          This will fetch and analyze PRs from {syncConfig.repositories.length} repositor
          {syncConfig.repositories.length === 1 ? 'y' : 'ies'}.
          {dryRun ? ' (Dry run mode - limited to 5 PRs per repo)' : ''}
        </Text>
      ),
      labels: { confirm: 'Start Sync', cancel: 'Cancel' },
      confirmProps: { color: 'blue' },
      onConfirm: startSync,
    });
  };

  const confirmStartJiraSync = () => {
    modals.openConfirmModal({
      title: 'Start Jira Sync',
      children: (
        <Text size="sm">
          This will fetch and analyze issues from {syncConfig.jiraProjects.length} project
          {syncConfig.jiraProjects.length === 1 ? '' : 's'}.
          {dryRun ? ' (Dry run mode - limited to 5 issues per project)' : ''}
        </Text>
      ),
      labels: { confirm: 'Start Sync', cancel: 'Cancel' },
      confirmProps: { color: 'blue' },
      onConfirm: startJiraSync,
    });
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

  const copyLogsToClipboard = (job: Job) => {
    const logsText = job.logs
      .map((log) => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.level.toUpperCase()}: ${log.message}`)
      .join('\n');

    navigator.clipboard.writeText(logsText).then(() => {
      notifications.show({
        title: 'Copied!',
        message: 'Logs copied to clipboard',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    }).catch(() => {
      notifications.show({
        title: 'Failed',
        message: 'Failed to copy logs',
        color: 'red',
        icon: <IconX size={16} />,
      });
    });
  };

  if (configLoading) {
    return (
      <Container size="xl" py="xl">
        <Group justify="center" mt="xl">
          <Loader size="lg" />
          <Text>Loading configuration...</Text>
        </Group>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Sync Evidence</Title>
          <Text c="dimmed" mt="sm">
            Sync your GitHub PRs and Jira issues, then analyze them for performance review evidence
          </Text>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          variant="light"
          onClick={() => {
            loadRecentJobs();
            loadRecentJiraJobs();
          }}
        >
          Refresh
        </Button>
      </Group>

      {/* Worker Health Warning */}
      {!workerHealthy && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" mb="lg">
          <Text size="sm" fw={500} mb="xs">
            Background Worker Not Running
          </Text>
          <Text size="sm">
            Jobs will not be processed until the worker is started. Run in a separate terminal: <Code>npm run worker</Code>
          </Text>
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'github')} mb="xl">
        <Tabs.List>
          <Tabs.Tab value="github" leftSection={<IconBrandGithub size={16} />}>
            GitHub
          </Tabs.Tab>
          <Tabs.Tab value="jira" leftSection={<IconTicket size={16} />}>
            Jira
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="github" pt="md">

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500} size="lg">Start Sync</Text>
              <Button
                component={Link}
                href="/settings"
                leftSection={<IconSettings size={16} />}
                variant="light"
                size="xs"
              >
                Configure
              </Button>
            </Group>

            {!syncConfig.hasGithubToken || syncConfig.repositories.length === 0 ? (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Configuration Required"
                color="yellow"
                variant="light"
              >
                <Text size="sm" mb="sm">
                  Please configure your GitHub credentials and select repositories in Settings before starting a sync.
                </Text>
                <Button
                  component={Link}
                  href="/settings"
                  leftSection={<IconSettings size={16} />}
                  size="sm"
                  variant="light"
                >
                  Go to Settings
                </Button>
              </Alert>
            ) : (
              <Stack gap="md">
                <div>
                  <Text size="sm" fw={500} mb="xs">Current Configuration</Text>
                  <List
                    spacing="xs"
                    size="sm"
                    icon={
                      <ThemeIcon color="green" size={20} radius="xl">
                        <IconCheck size={12} />
                      </ThemeIcon>
                    }
                  >
                    <List.Item>
                      GitHub token configured
                    </List.Item>
                    <List.Item>
                      {syncConfig.repositories.length} repositor{syncConfig.repositories.length === 1 ? 'y' : 'ies'} selected
                    </List.Item>
                    {syncConfig.hasAnthropicKey && (
                      <List.Item>
                        Anthropic AI enabled
                      </List.Item>
                    )}
                  </List>
                  {syncConfig.repositories.length > 0 && (
                    <Text size="xs" c="dimmed" mt="xs">
                      Repositories: {syncConfig.repositories.join(', ')}
                    </Text>
                  )}
                </div>

                <Divider />

                <Group grow>
                  <DatePickerInput
                    label="Start Date"
                    placeholder="Pick start date"
                    description="Optional - defaults to 1 year ago"
                    clearable
                    value={startDate}
                    onChange={setStartDate}
                    leftSection={<IconCalendar size={16} />}
                  />

                  <DatePickerInput
                    label="End Date"
                    placeholder="Pick end date"
                    description="Optional - defaults to today"
                    clearable
                    value={endDate}
                    onChange={setEndDate}
                    leftSection={<IconCalendar size={16} />}
                  />
                </Group>

                <Checkbox
                  label="Dry Run Mode (limit to 5 PRs per repository)"
                  description="Enable to test sync without processing all PRs"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.currentTarget.checked)}
                />

                {dryRun && (
                  <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="blue"
                    variant="light"
                  >
                    Dry run enabled - will process only 5 most recent PRs per repository
                  </Alert>
                )}

                <Button
                  fullWidth
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={confirmStartSync}
                  loading={loading}
                  disabled={activeJob?.status === 'RUNNING'}
                >
                  Start Sync
                </Button>
              </Stack>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          {activeJob && (
            <Card shadow="sm" padding="lg" radius="md" withBorder mb="md">
              <Group justify="space-between" mb="md">
                <Text fw={500} size="lg">Active Job</Text>
                <Badge
                  color={getStatusColor(activeJob.status)}
                  leftSection={getStatusIcon(activeJob.status)}
                >
                  {activeJob.status}
                </Badge>
              </Group>

              <Stack gap="sm">
                <div>
                  <Text size="xs" c="dimmed">Progress</Text>
                  <Progress value={activeJob.progress} animated={activeJob.status === 'RUNNING'} mt={4} />
                  <Text size="xs" c="dimmed" mt={4}>{activeJob.progress}%</Text>
                </div>

                <Divider />

                <div>
                  <Group justify="space-between" mb="xs">
                    <Text size="xs" c="dimmed">Logs</Text>
                    <Tooltip label="Copy logs to clipboard">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => copyLogsToClipboard(activeJob)}
                      >
                        <IconCopy size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                  <Paper withBorder p="xs" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <Code block style={{ fontSize: '0.75rem' }}>
                      {activeJob.logs.map((log, idx) => (
                        <div key={idx}>
                          [{new Date(log.timestamp).toLocaleTimeString()}] {log.level.toUpperCase()}: {log.message}
                        </div>
                      ))}
                    </Code>
                  </Paper>
                </div>

                {activeJob.error && (
                  <Alert icon={<IconX size={16} />} title="Error" color="red">
                    {activeJob.error}
                  </Alert>
                )}
              </Stack>
            </Card>
          )}

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text fw={500} size="lg" mb="md">Sync History</Text>

            {jobs.length === 0 ? (
              <Text c="dimmed" size="sm">No sync jobs found</Text>
            ) : (
              <Timeline active={-1} bulletSize={24} lineWidth={2}>
                {jobs.map((job) => (
                  <Timeline.Item
                    key={job.id}
                    bullet={getStatusIcon(job.status)}
                    title={
                      <Group justify="space-between">
                        <Text size="sm" fw={500}>
                          {job.type.replace('_', ' ')}
                        </Text>
                        <Badge size="sm" color={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                      </Group>
                    }
                  >
                    <Text size="xs" c="dimmed">
                      {new Date(job.createdAt).toLocaleString()}
                    </Text>
                    {job.config?.repositories && (
                      <Text size="xs" mt={4}>
                        Repos: {job.config.repositories.join(', ')}
                      </Text>
                    )}
                    {job.result && (
                      <Text size="xs" c="green" mt={4}>
                        Processed {job.result.totalPRs || 0} PRs
                      </Text>
                    )}
                    <Button
                      size="xs"
                      variant="subtle"
                      mt="xs"
                      onClick={() => setActiveJob(job)}
                    >
                      View Details
                    </Button>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Card>
        </Grid.Col>
      </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="jira" pt="md">
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500} size="lg">Start Sync</Text>
              <Button
                component={Link}
                href="/settings"
                leftSection={<IconSettings size={16} />}
                variant="light"
                size="xs"
              >
                Configure
              </Button>
            </Group>

            {!syncConfig.hasJiraConfig || syncConfig.jiraProjects.length === 0 ? (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Configuration Required"
                color="yellow"
                variant="light"
              >
                <Text size="sm" mb="sm">
                  Please configure your Jira credentials and select projects in Settings before starting a sync.
                </Text>
                <Button
                  component={Link}
                  href="/settings"
                  leftSection={<IconSettings size={16} />}
                  size="sm"
                  variant="light"
                >
                  Go to Settings
                </Button>
              </Alert>
            ) : (
              <Stack gap="md">
                <div>
                  <Text size="sm" fw={500} mb="xs">Current Configuration</Text>
                  <List
                    spacing="xs"
                    size="sm"
                    icon={
                      <ThemeIcon color="green" size={20} radius="xl">
                        <IconCheck size={12} />
                      </ThemeIcon>
                    }
                  >
                    <List.Item>
                      Jira credentials configured
                    </List.Item>
                    <List.Item>
                      {syncConfig.jiraProjects.length} project{syncConfig.jiraProjects.length === 1 ? '' : 's'} selected
                    </List.Item>
                    {syncConfig.hasAnthropicKey && (
                      <List.Item>
                        Anthropic AI enabled
                      </List.Item>
                    )}
                  </List>
                  {syncConfig.jiraProjects.length > 0 && (
                    <Text size="xs" c="dimmed" mt="xs">
                      Projects: {syncConfig.jiraProjects.join(', ')}
                    </Text>
                  )}
                </div>

                <Divider />

                <Group grow>
                  <DatePickerInput
                    label="Start Date"
                    placeholder="Pick start date"
                    description="Optional - defaults to 1 year ago"
                    clearable
                    value={startDate}
                    onChange={setStartDate}
                    leftSection={<IconCalendar size={16} />}
                  />

                  <DatePickerInput
                    label="End Date"
                    placeholder="Pick end date"
                    description="Optional - defaults to today"
                    clearable
                    value={endDate}
                    onChange={setEndDate}
                    leftSection={<IconCalendar size={16} />}
                  />
                </Group>

                <Checkbox
                  label="Dry Run Mode (limit to 5 issues per project)"
                  description="Enable to test sync without processing all issues"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.currentTarget.checked)}
                />

                {dryRun && (
                  <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="blue"
                    variant="light"
                  >
                    Dry run enabled - will process only 5 most recent issues per project
                  </Alert>
                )}

                <Button
                  fullWidth
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={confirmStartJiraSync}
                  loading={loading}
                  disabled={activeJob?.status === 'RUNNING'}
                >
                  Start Sync
                </Button>
              </Stack>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          {activeJob && (
            <Card shadow="sm" padding="lg" radius="md" withBorder mb="md">
              <Group justify="space-between" mb="md">
                <Text fw={500} size="lg">Active Job</Text>
                <Badge
                  color={getStatusColor(activeJob.status)}
                  leftSection={getStatusIcon(activeJob.status)}
                >
                  {activeJob.status}
                </Badge>
              </Group>

              <Stack gap="sm">
                <div>
                  <Text size="xs" c="dimmed">Progress</Text>
                  <Progress value={activeJob.progress} animated={activeJob.status === 'RUNNING'} mt={4} />
                  <Text size="xs" c="dimmed" mt={4}>{activeJob.progress}%</Text>
                </div>

                <Divider />

                <div>
                  <Group justify="space-between" mb="xs">
                    <Text size="xs" c="dimmed">Logs</Text>
                    <Tooltip label="Copy logs to clipboard">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => copyLogsToClipboard(activeJob)}
                      >
                        <IconCopy size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                  <Paper withBorder p="xs" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <Code block style={{ fontSize: '0.75rem' }}>
                      {activeJob.logs.map((log, idx) => (
                        <div key={idx}>
                          [{new Date(log.timestamp).toLocaleTimeString()}] {log.level.toUpperCase()}: {log.message}
                        </div>
                      ))}
                    </Code>
                  </Paper>
                </div>

                {activeJob.error && (
                  <Alert icon={<IconX size={16} />} title="Error" color="red">
                    {activeJob.error}
                  </Alert>
                )}
              </Stack>
            </Card>
          )}

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text fw={500} size="lg" mb="md">Sync History</Text>

            {jiraJobs.length === 0 ? (
              <Text c="dimmed" size="sm">No sync jobs found</Text>
            ) : (
              <Timeline active={-1} bulletSize={24} lineWidth={2}>
                {jiraJobs.map((job) => (
                  <Timeline.Item
                    key={job.id}
                    bullet={getStatusIcon(job.status)}
                    title={
                      <Group justify="space-between">
                        <Text size="sm" fw={500}>
                          {job.type.replace('_', ' ')}
                        </Text>
                        <Badge size="sm" color={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                      </Group>
                    }
                  >
                    <Text size="xs" c="dimmed">
                      {new Date(job.createdAt).toLocaleString()}
                    </Text>
                    {job.config?.projects && (
                      <Text size="xs" mt={4}>
                        Projects: {job.config.projects.join(', ')}
                      </Text>
                    )}
                    {job.result && (
                      <Text size="xs" c="green" mt={4}>
                        Processed {job.result.totalProcessed || 0} issues
                      </Text>
                    )}
                    <Button
                      size="xs"
                      variant="subtle"
                      mt="xs"
                      onClick={() => setActiveJob(job)}
                    >
                      View Details
                    </Button>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Card>
        </Grid.Col>
      </Grid>
        </Tabs.Panel>
      </Tabs>

      {/* Admin Panel */}
      <div style={{ marginTop: '2rem' }}>
        <AdminPanel />
      </div>
    </Container>
  );
}
