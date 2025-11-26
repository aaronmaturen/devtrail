"use client";

import { useState, useEffect } from "react";
import {
  Container,
  Title,
  Text,
  Card,
  Button,
  Stack,
  Group,
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
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconBrandGithub,
  IconRefresh,
  IconCheck,
  IconX,
  IconClock,
  IconAlertCircle,
  IconPlayerPlay,
  IconPlayerStop,
  IconSettings,
  IconCalendar,
  IconTicket,
  IconCopy,
  IconRobot,
} from "@tabler/icons-react";
import Link from "next/link";

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  statusMessage: string | null;
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
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<string>("github");
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    hasGithubToken: false,
    hasAnthropicKey: false,
    hasJiraConfig: false,
    repositories: [],
    jiraProjects: [],
    jiraHost: "",
    jiraEmail: "",
    jiraApiToken: "",
    userContext: "",
  });
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [updateExisting, setUpdateExisting] = useState<boolean>(false);
  const [workerHealthy, setWorkerHealthy] = useState<boolean>(true);
  const [agentJobs, setAgentJobs] = useState<Job[]>([]);

  // Load saved config on mount
  useEffect(() => {
    loadSavedConfig();
    loadAgentJobs();
    findActiveRunningJob(); // Finds any running job and sets it as active
    checkWorkerHealth(); // One-time check to remind if worker isn't running
  }, []);

  // Poll active job for updates
  useEffect(() => {
    if (
      activeJob &&
      (activeJob.status === "PENDING" || activeJob.status === "RUNNING")
    ) {
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
      const response = await fetch("/api/config");
      if (response.ok) {
        const configs: Config[] = await response.json();

        const newConfig: SyncConfig = {
          hasGithubToken: false,
          hasAnthropicKey: false,
          hasJiraConfig: false,
          repositories: [],
          jiraProjects: [],
          jiraHost: "",
          jiraEmail: "",
          jiraApiToken: "",
          userContext: "",
        };

        configs.forEach((config) => {
          if (config.key === "github_token" && config.value) {
            newConfig.hasGithubToken = true;
          } else if (config.key === "selected_repos" && config.value) {
            newConfig.repositories = config.value;
          } else if (config.key === "anthropic_api_key" && config.value) {
            newConfig.hasAnthropicKey = true;
          } else if (config.key === "user_context" && config.value) {
            newConfig.userContext = config.value;
          } else if (config.key === "jira_host" && config.value) {
            newConfig.jiraHost = config.value;
            newConfig.hasJiraConfig = true;
          } else if (config.key === "jira_email" && config.value) {
            newConfig.jiraEmail = config.value;
          } else if (config.key === "jira_api_token" && config.value) {
            newConfig.jiraApiToken = config.value;
          } else if (config.key === "selected_projects" && config.value) {
            newConfig.jiraProjects = config.value;
          }
        });

        // Only mark Jira as configured if we have all required fields
        if (
          !newConfig.jiraHost ||
          !newConfig.jiraEmail ||
          !newConfig.jiraApiToken
        ) {
          newConfig.hasJiraConfig = false;
        }

        setSyncConfig(newConfig);
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setConfigLoading(false);
    }
  };

  const loadAgentJobs = async () => {
    try {
      const response = await fetch("/api/sync/agent?limit=10");
      if (response.ok) {
        const data = await response.json();
        setAgentJobs(data);
      }
    } catch (error) {
      console.error("Failed to load agent jobs:", error);
    }
  };

  // Find and set active running job
  const findActiveRunningJob = async () => {
    const response = await fetch("/api/sync/agent?limit=10");
    if (response.ok) {
      const jobs = await response.json();
      const runningJob = jobs.find(
        (job: Job) => job.status === "PENDING" || job.status === "RUNNING"
      );
      if (runningJob) {
        setActiveJob(runningJob);
      }
    }
  };

  const startAgentSync = async (agentType: "github" | "jira") => {
    setLoading(true);
    try {
      const response = await fetch("/api/sync/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          repositories:
            agentType === "github" ? syncConfig.repositories : undefined,
          projects: agentType === "jira" ? syncConfig.jiraProjects : undefined,
          dryRun,
          updateExisting,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        notifications.show({
          title: "Agent Sync Started",
          message: `AI-powered ${agentType} sync job has been created`,
          color: "violet",
          icon: <IconRobot size={16} />,
        });

        // Fetch the job status and set as active
        await fetchJobStatus(data.jobId);
        await loadAgentJobs();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to start agent sync");
      }
    } catch (error) {
      console.error("Failed to start agent sync:", error);
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to start agent sync",
        color: "red",
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const checkWorkerHealth = async () => {
    try {
      const response = await fetch("/api/worker/health");
      if (response.ok) {
        const data = await response.json();
        setWorkerHealthy(data.healthy);
      } else {
        setWorkerHealthy(false);
      }
    } catch (error) {
      console.error("Failed to check worker health:", error);
      setWorkerHealthy(false);
    }
  };

  const fetchJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/sync/status/${jobId}`);
      if (response.ok) {
        const job = await response.json();
        setActiveJob(job);

        // Show notification when job completes
        if (job.status === "COMPLETED" && activeJob?.status !== "COMPLETED") {
          notifications.show({
            title: "Sync completed",
            message: "GitHub sync has finished successfully",
            color: "green",
            icon: <IconCheck size={16} />,
          });
        } else if (job.status === "FAILED" && activeJob?.status !== "FAILED") {
          notifications.show({
            title: "Sync failed",
            message: job.error || "GitHub sync failed",
            color: "red",
            icon: <IconX size={16} />,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch job status:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <IconCheck size={16} />;
      case "FAILED":
      case "CANCELLED":
        return <IconX size={16} />;
      case "RUNNING":
        return <Loader size={16} />;
      case "PENDING":
        return <IconClock size={16} />;
      default:
        return <IconAlertCircle size={16} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "green";
      case "FAILED":
        return "red";
      case "CANCELLED":
        return "gray";
      case "RUNNING":
        return "blue";
      case "PENDING":
        return "yellow";
      default:
        return "gray";
    }
  };

  const copyLogsToClipboard = (job: Job) => {
    const logsText = job.logs
      .map(
        (log) =>
          `[${new Date(
            log.timestamp
          ).toLocaleTimeString()}] ${log.level.toUpperCase()}: ${log.message}`
      )
      .join("\n");

    navigator.clipboard
      .writeText(logsText)
      .then(() => {
        notifications.show({
          title: "Copied!",
          message: "Logs copied to clipboard",
          color: "green",
          icon: <IconCheck size={16} />,
        });
      })
      .catch(() => {
        notifications.show({
          title: "Failed",
          message: "Failed to copy logs",
          color: "red",
          icon: <IconX size={16} />,
        });
      });
  };

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/sync/status/${jobId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        notifications.show({
          title: "Job Cancelled",
          message: "The sync job has been cancelled",
          color: "orange",
          icon: <IconPlayerStop size={16} />,
        });
        // Refresh job list
        loadAgentJobs();
      } else {
        throw new Error("Failed to cancel job");
      }
    } catch (error) {
      notifications.show({
        title: "Error",
        message: "Failed to cancel the job",
        color: "red",
        icon: <IconX size={16} />,
      });
    }
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
            Sync your GitHub PRs and Jira issues, then analyze them for
            performance review evidence
          </Text>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          variant="light"
          onClick={() => {
            loadAgentJobs();
            findActiveRunningJob();
          }}
        >
          Refresh
        </Button>
      </Group>

      {/* Worker Health Warning - hide if there's an active running job */}
      {!workerHealthy &&
        !(
          activeJob &&
          (activeJob.status === "RUNNING" || activeJob.status === "PENDING")
        ) && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
            mb="lg"
          >
            <Text size="sm" fw={500} mb="xs">
              Background Worker Not Running
            </Text>
            <Text size="sm">
              Jobs will not be processed until the worker is started. Run in a
              separate terminal: <Code>npm run worker</Code>
            </Text>
          </Alert>
        )}

      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || "github")}
        mb="xl"
      >
        <Tabs.List>
          <Tabs.Tab value="github" leftSection={<IconBrandGithub size={16} />}>
            GitHub
          </Tabs.Tab>
          <Tabs.Tab value="jira" leftSection={<IconTicket size={16} />}>
            Jira
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="github" pt="md">
          <Grid gutter="md" align="stretch">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
                <Group justify="space-between" mb="md">
                  <Text fw={500} size="lg">
                    Start Sync
                  </Text>
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

                {!syncConfig.hasGithubToken ||
                syncConfig.repositories.length === 0 ? (
                  <Alert
                    icon={<IconAlertCircle size={16} />}
                    title="Configuration Required"
                    color="yellow"
                    variant="light"
                  >
                    <Text size="sm" mb="sm">
                      Please configure your GitHub credentials and select
                      repositories in Settings before starting a sync.
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
                      <Text size="sm" fw={500} mb="xs">
                        Current Configuration
                      </Text>
                      <List
                        spacing="xs"
                        size="sm"
                        icon={
                          <ThemeIcon color="green" size={20} radius="xl">
                            <IconCheck size={12} />
                          </ThemeIcon>
                        }
                      >
                        <List.Item>GitHub token configured</List.Item>
                        <List.Item>
                          {syncConfig.repositories.length} repositor
                          {syncConfig.repositories.length === 1
                            ? "y"
                            : "ies"}{" "}
                          selected
                        </List.Item>
                        {syncConfig.hasAnthropicKey && (
                          <List.Item>Anthropic AI enabled</List.Item>
                        )}
                      </List>
                      {syncConfig.repositories.length > 0 && (
                        <Text size="xs" c="dimmed" mt="xs">
                          Repositories: {syncConfig.repositories.join(", ")}
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
                      onChange={(event) =>
                        setDryRun(event.currentTarget.checked)
                      }
                    />

                    <Checkbox
                      label="Update Existing Records"
                      description="Re-fetch and update PRs that are already in the database"
                      checked={updateExisting}
                      onChange={(event) =>
                        setUpdateExisting(event.currentTarget.checked)
                      }
                    />

                    {dryRun && (
                      <Alert
                        icon={<IconAlertCircle size={16} />}
                        color="blue"
                        variant="light"
                      >
                        Dry run enabled - will process only 5 most recent PRs
                        per repository
                      </Alert>
                    )}

                    <Button
                      fullWidth
                      leftSection={<IconRobot size={16} />}
                      onClick={() => startAgentSync("github")}
                      loading={loading}
                      disabled={activeJob?.status === "RUNNING"}
                      color="violet"
                    >
                      Start Sync
                    </Button>
                  </Stack>
                )}
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                h="100%"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <Group
                  justify="space-between"
                  mb="md"
                  style={{ flexShrink: 0 }}
                >
                  <Group gap="xs">
                    <Text fw={500} size="lg">
                      Active Job
                    </Text>
                    {activeJob &&
                      (activeJob.status === "RUNNING" ||
                        activeJob.status === "PENDING") && (
                        <Tooltip label="Stop sync">
                          <ActionIcon
                            color="red"
                            variant="light"
                            size="sm"
                            onClick={() => cancelJob(activeJob.id)}
                          >
                            <IconPlayerStop size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                  </Group>
                  {activeJob ? (
                    <Badge
                      color={getStatusColor(activeJob.status)}
                      leftSection={getStatusIcon(activeJob.status)}
                    >
                      {activeJob.status}
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="light">
                      not running
                    </Badge>
                  )}
                </Group>

                {activeJob ? (
                  <Stack
                    gap="sm"
                    style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      <Text size="xs" c="dimmed">
                        Progress
                      </Text>
                      <Progress
                        value={activeJob.progress}
                        animated={activeJob.status === "RUNNING"}
                        color={
                          activeJob.status === "CANCELLED"
                            ? "red"
                            : activeJob.status === "FAILED"
                            ? "red"
                            : undefined
                        }
                        mt={4}
                      />
                      <Group justify="space-between" mt={4}>
                        <Text size="xs" c="dimmed">
                          {activeJob.progress}%
                        </Text>
                        {activeJob.statusMessage && (
                          <Text size="xs" c="blue" fw={500}>
                            {activeJob.statusMessage}
                          </Text>
                        )}
                      </Group>
                    </div>

                    <Divider style={{ flexShrink: 0 }} />

                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                        overflow: "hidden",
                      }}
                    >
                      <Group
                        justify="space-between"
                        mb="xs"
                        style={{ flexShrink: 0 }}
                      >
                        <Text size="xs" c="dimmed">
                          Logs
                        </Text>
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
                      <Paper
                        withBorder
                        p="xs"
                        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
                      >
                        <Code
                          block
                          style={{ fontSize: "0.75rem", maxHeight: "400px" }}
                        >
                          {activeJob.logs.map((log, idx) => (
                            <div key={idx}>
                              [{new Date(log.timestamp).toLocaleTimeString()}]{" "}
                              {log.level.toUpperCase()}: {log.message}
                            </div>
                          ))}
                        </Code>
                      </Paper>
                    </div>

                    {activeJob.error && (
                      <Alert
                        icon={<IconX size={16} />}
                        title="Error"
                        color="red"
                        style={{ flexShrink: 0 }}
                      >
                        {activeJob.error}
                      </Alert>
                    )}
                  </Stack>
                ) : (
                  <Stack
                    gap="md"
                    justify="center"
                    align="center"
                    style={{ flex: 1 }}
                  >
                    <IconPlayerPlay
                      size={48}
                      color="var(--mantine-color-gray-4)"
                    />
                    <Text c="dimmed" ta="center" size="sm">
                      No job is currently running
                    </Text>
                    <Text c="dimmed" ta="center" size="xs">
                      Start a sync to see progress and logs here
                    </Text>
                  </Stack>
                )}
              </Card>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="jira" pt="md">
          <Grid gutter="md" align="stretch">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
                <Group justify="space-between" mb="md">
                  <Text fw={500} size="lg">
                    Start Sync
                  </Text>
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

                {!syncConfig.hasJiraConfig ||
                syncConfig.jiraProjects.length === 0 ? (
                  <Alert
                    icon={<IconAlertCircle size={16} />}
                    title="Configuration Required"
                    color="yellow"
                    variant="light"
                  >
                    <Text size="sm" mb="sm">
                      Please configure your Jira credentials and select projects
                      in Settings before starting a sync.
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
                      <Text size="sm" fw={500} mb="xs">
                        Current Configuration
                      </Text>
                      <List
                        spacing="xs"
                        size="sm"
                        icon={
                          <ThemeIcon color="green" size={20} radius="xl">
                            <IconCheck size={12} />
                          </ThemeIcon>
                        }
                      >
                        <List.Item>Jira credentials configured</List.Item>
                        <List.Item>
                          {syncConfig.jiraProjects.length} project
                          {syncConfig.jiraProjects.length === 1 ? "" : "s"}{" "}
                          selected
                        </List.Item>
                        {syncConfig.hasAnthropicKey && (
                          <List.Item>Anthropic AI enabled</List.Item>
                        )}
                      </List>
                      {syncConfig.jiraProjects.length > 0 && (
                        <Text size="xs" c="dimmed" mt="xs">
                          Projects: {syncConfig.jiraProjects.join(", ")}
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
                      onChange={(event) =>
                        setDryRun(event.currentTarget.checked)
                      }
                    />

                    <Checkbox
                      label="Update Existing Records"
                      description="Re-fetch and update tickets that are already in the database"
                      checked={updateExisting}
                      onChange={(event) =>
                        setUpdateExisting(event.currentTarget.checked)
                      }
                    />

                    {dryRun && (
                      <Alert
                        icon={<IconAlertCircle size={16} />}
                        color="blue"
                        variant="light"
                      >
                        Dry run enabled - will process only 5 most recent issues
                        per project
                      </Alert>
                    )}

                    <Button
                      fullWidth
                      leftSection={<IconRobot size={16} />}
                      onClick={() => startAgentSync("jira")}
                      loading={loading}
                      disabled={activeJob?.status === "RUNNING"}
                      color="violet"
                    >
                      Start Sync
                    </Button>
                  </Stack>
                )}
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                h="100%"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <Group
                  justify="space-between"
                  mb="md"
                  style={{ flexShrink: 0 }}
                >
                  <Group gap="xs">
                    <Text fw={500} size="lg">
                      Active Job
                    </Text>
                    {activeJob &&
                      (activeJob.status === "RUNNING" ||
                        activeJob.status === "PENDING") && (
                        <Tooltip label="Stop sync">
                          <ActionIcon
                            color="red"
                            variant="light"
                            size="sm"
                            onClick={() => cancelJob(activeJob.id)}
                          >
                            <IconPlayerStop size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                  </Group>
                  {activeJob ? (
                    <Badge
                      color={getStatusColor(activeJob.status)}
                      leftSection={getStatusIcon(activeJob.status)}
                    >
                      {activeJob.status}
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="light">
                      not running
                    </Badge>
                  )}
                </Group>

                {activeJob ? (
                  <Stack
                    gap="sm"
                    style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      <Text size="xs" c="dimmed">
                        Progress
                      </Text>
                      <Progress
                        value={activeJob.progress}
                        animated={activeJob.status === "RUNNING"}
                        color={
                          activeJob.status === "CANCELLED"
                            ? "red"
                            : activeJob.status === "FAILED"
                            ? "red"
                            : undefined
                        }
                        mt={4}
                      />
                      <Group justify="space-between" mt={4}>
                        <Text size="xs" c="dimmed">
                          {activeJob.progress}%
                        </Text>
                        {activeJob.statusMessage && (
                          <Text size="xs" c="blue" fw={500}>
                            {activeJob.statusMessage}
                          </Text>
                        )}
                      </Group>
                    </div>

                    <Divider style={{ flexShrink: 0 }} />

                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                        overflow: "hidden",
                      }}
                    >
                      <Group
                        justify="space-between"
                        mb="xs"
                        style={{ flexShrink: 0 }}
                      >
                        <Text size="xs" c="dimmed">
                          Logs
                        </Text>
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
                      <Paper
                        withBorder
                        p="xs"
                        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
                      >
                        <Code
                          block
                          style={{ fontSize: "0.75rem", maxHeight: "400px" }}
                        >
                          {activeJob.logs.map((log, idx) => (
                            <div key={idx}>
                              [{new Date(log.timestamp).toLocaleTimeString()}]{" "}
                              {log.level.toUpperCase()}: {log.message}
                            </div>
                          ))}
                        </Code>
                      </Paper>
                    </div>

                    {activeJob.error && (
                      <Alert
                        icon={<IconX size={16} />}
                        title="Error"
                        color="red"
                        style={{ flexShrink: 0 }}
                      >
                        {activeJob.error}
                      </Alert>
                    )}
                  </Stack>
                ) : (
                  <Stack
                    gap="md"
                    justify="center"
                    align="center"
                    style={{ flex: 1 }}
                  >
                    <IconPlayerPlay
                      size={48}
                      color="var(--mantine-color-gray-4)"
                    />
                    <Text c="dimmed" ta="center" size="sm">
                      No job is currently running
                    </Text>
                    <Text c="dimmed" ta="center" size="xs">
                      Start a sync to see progress and logs here
                    </Text>
                  </Stack>
                )}
              </Card>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
