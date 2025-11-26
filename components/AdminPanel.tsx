"use client";

import { useState, useEffect } from "react";
import {
  Card,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Badge,
  Paper,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Modal,
  ScrollArea,
  Code,
  Timeline,
  Tabs,
  Progress,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconRefresh,
  IconTrash,
  IconClock,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconSettings,
  IconEye,
  IconBrandGithub,
  IconTicket,
  IconRobot,
  IconPlayerPlay,
  IconDownload,
} from "@tabler/icons-react";

interface JobStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  logs: LogEntry[];
  result: any;
  config: any;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
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
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");

  useEffect(() => {
    loadStats();
    loadAllJobs();
  }, []);

  // Poll for updates if there are running jobs
  useEffect(() => {
    const hasRunningJobs = allJobs.some(
      (job) => job.status === "RUNNING" || job.status === "PENDING"
    );

    if (hasRunningJobs) {
      const interval = setInterval(() => {
        loadAllJobs();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [allJobs]);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/jobs/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to load job stats:", error);
    }
  };

  const loadAllJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/jobs?limit=50");
      if (response.ok) {
        const data = await response.json();
        setAllJobs(data);
      }
    } catch (error) {
      console.error("Failed to load jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    await Promise.all([loadStats(), loadAllJobs()]);
    notifications.show({
      title: "Refreshed",
      message: "Job data has been refreshed",
      color: "blue",
      icon: <IconRefresh size={16} />,
    });
  };

  const clearFailedJobs = async () => {
    setClearing(true);
    try {
      const response = await fetch("/api/jobs/clear-failed", {
        method: "POST",
      });
      if (response.ok) {
        const result = await response.json();
        notifications.show({
          title: "Cleared Unsuccessful Jobs",
          message: `Deleted ${result.deleted} failed/cancelled jobs`,
          color: "green",
          icon: <IconCheck size={16} />,
        });
        await refreshData();
      } else {
        throw new Error("Failed to clear jobs");
      }
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to clear jobs",
        color: "red",
        icon: <IconX size={16} />,
      });
    } finally {
      setClearing(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/sync/status/${jobId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        notifications.show({
          title: "Job Deleted",
          message: "Job has been deleted",
          color: "green",
          icon: <IconCheck size={16} />,
        });
        await refreshData();
      } else {
        throw new Error("Failed to delete job");
      }
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to delete job",
        color: "red",
        icon: <IconX size={16} />,
      });
    }
  };

  const viewJobLogs = (job: Job) => {
    setSelectedJob(job);
    setLogsModalOpen(true);
  };

  const downloadLogs = (job: Job) => {
    const logsText = job.logs
      .map(
        (log) =>
          `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
      )
      .join("\n");
    const blob = new Blob([logsText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-${job.id}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <IconCheck size={14} />;
      case "FAILED":
      case "CANCELLED":
        return <IconX size={14} />;
      case "RUNNING":
        return <Loader size={14} />;
      case "PENDING":
        return <IconClock size={14} />;
      default:
        return <IconAlertCircle size={14} />;
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

  const getJobTypeIcon = (type: string) => {
    if (type.includes("GITHUB")) return <IconBrandGithub size={14} />;
    if (type.includes("JIRA")) return <IconTicket size={14} />;
    if (type.includes("AGENT")) return <IconRobot size={14} />;
    return <IconPlayerPlay size={14} />;
  };

  const formatJobType = (type: string) => {
    return type.replace("AGENT_", "").replace("_SYNC", "").replace("_", " ");
  };

  const filteredJobs = allJobs.filter((job) => {
    if (activeTab === "all") return true;
    if (activeTab === "github") return job.type.includes("GITHUB");
    if (activeTab === "jira") return job.type.includes("JIRA");
    if (activeTab === "agent") return job.type.includes("AGENT");
    return true;
  });

  // Get the active (running or pending) job
  const activeJob = allJobs.find(
    (job) => job.status === "RUNNING" || job.status === "PENDING"
  );

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>
              <IconSettings
                size={24}
                style={{ verticalAlign: "middle", marginRight: 8 }}
              />
              Sync History & Admin
            </Title>
            <Text size="sm" c="dimmed">
              View sync history and manage background jobs
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "0.5rem",
              }}
            >
              <Paper withBorder p="xs" style={{ textAlign: "center" }}>
                <Text size="xl" fw={700} c="green">
                  {stats.completed}
                </Text>
                <Text size="xs" c="dimmed">
                  Passing
                </Text>
              </Paper>
              <Paper withBorder p="xs" style={{ textAlign: "center" }}>
                <Text size="xl" fw={700} c="yellow">
                  {stats.pending}
                </Text>
                <Text size="xs" c="dimmed">
                  Pending
                </Text>
              </Paper>
              <Paper withBorder p="xs" style={{ textAlign: "center" }}>
                <Text size="xl" fw={700} c="blue">
                  {stats.running}
                </Text>
                <Text size="xs" c="dimmed">
                  Running
                </Text>
              </Paper>
              <Paper withBorder p="xs" style={{ textAlign: "center" }}>
                <Text size="xl" fw={700} c="red">
                  {stats.failed}
                </Text>
                <Text size="xs" c="dimmed">
                  Failed
                </Text>
              </Paper>
              <Paper withBorder p="xs" style={{ textAlign: "center" }}>
                <Text size="xl" fw={700} c="gray">
                  {stats.cancelled}
                </Text>
                <Text size="xs" c="dimmed">
                  Cancelled
                </Text>
              </Paper>
            </div>
          </div>

          {/* Active Job Card */}
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <IconPlayerPlay size={18} />
                <Text fw={500}>Active Job</Text>
              </Group>
              {activeJob ? (
                <Badge
                  color={activeJob.status === "RUNNING" ? "blue" : "yellow"}
                  leftSection={
                    activeJob.status === "RUNNING" ? (
                      <Loader size={10} color="white" />
                    ) : (
                      <IconClock size={10} />
                    )
                  }
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
              <Stack gap="sm">
                <Group gap="xs">
                  {getJobTypeIcon(activeJob.type)}
                  <Text size="sm" fw={500}>
                    {formatJobType(activeJob.type)}
                  </Text>
                  {activeJob.type.includes("AGENT") && (
                    <Badge size="xs" variant="light" color="violet">
                      AI
                    </Badge>
                  )}
                </Group>

                <Progress
                  value={activeJob.progress}
                  size="sm"
                  color={activeJob.status === "RUNNING" ? "blue" : "yellow"}
                  animated={activeJob.status === "RUNNING"}
                />

                <Text size="xs" c="dimmed">
                  Started: {activeJob.startedAt ? new Date(activeJob.startedAt).toLocaleTimeString() : "Pending..."}
                  {activeJob.progress > 0 && ` • ${activeJob.progress}% complete`}
                </Text>

                {/* Live logs preview */}
                {activeJob.logs && activeJob.logs.length > 0 && (
                  <ScrollArea h={120} offsetScrollbars>
                    <Stack gap={2}>
                      {activeJob.logs.slice(-8).map((log, idx) => (
                        <Code
                          key={idx}
                          block
                          style={{
                            fontSize: "11px",
                            padding: "4px 8px",
                            backgroundColor:
                              log.level === "error"
                                ? "var(--mantine-color-red-light)"
                                : log.level === "warn"
                                ? "var(--mantine-color-yellow-light)"
                                : undefined,
                          }}
                        >
                          <Text span size="xs" c="dimmed">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </Text>{" "}
                          {log.message}
                        </Code>
                      ))}
                    </Stack>
                  </ScrollArea>
                )}

                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconEye size={14} />}
                  onClick={() => viewJobLogs(activeJob)}
                >
                  View Full Logs ({activeJob.logs?.length || 0})
                </Button>
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                No job is currently running. Start a sync from the Sync page.
              </Text>
            )}
          </Paper>

          {/* Actions */}
          <div>
            <Button
              leftSection={<IconTrash size={16} />}
              color="red"
              variant="light"
              onClick={clearFailedJobs}
              loading={clearing}
              disabled={stats.failed === 0 && stats.cancelled === 0}
              size="sm"
            >
              Clear Unsuccessful Jobs ({stats.failed + stats.cancelled})
            </Button>
          </div>

          {/* Sync History */}
          <div>
            <Text fw={500} mb="xs">
              Sync History
            </Text>
            <Tabs
              value={activeTab}
              onChange={(value) => setActiveTab(value || "all")}
            >
              <Tabs.List mb="sm">
                <Tabs.Tab value="all">All</Tabs.Tab>
                <Tabs.Tab
                  value="github"
                  leftSection={<IconBrandGithub size={14} />}
                >
                  GitHub
                </Tabs.Tab>
                <Tabs.Tab value="jira" leftSection={<IconTicket size={14} />}>
                  Jira
                </Tabs.Tab>
                <Tabs.Tab value="agent" leftSection={<IconRobot size={14} />}>
                  Agent
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>

            {loading ? (
              <Group justify="center" p="xl">
                <Loader size="md" />
              </Group>
            ) : filteredJobs.length === 0 ? (
              <Alert icon={<IconAlertCircle size={16} />} color="gray">
                No jobs found
              </Alert>
            ) : (
              <Timeline active={-1} bulletSize={24} lineWidth={2}>
                {filteredJobs.slice(0, 20).map((job) => (
                  <Timeline.Item
                    key={job.id}
                    bullet={getStatusIcon(job.status)}
                    title={
                      <Group justify="space-between">
                        <Group gap="xs">
                          {getJobTypeIcon(job.type)}
                          <Text size="sm" fw={500}>
                            {formatJobType(job.type)}
                          </Text>
                          {job.type.includes("AGENT") && (
                            <Badge size="xs" variant="light" color="violet">
                              AI
                            </Badge>
                          )}
                        </Group>
                        <Badge size="sm" color={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                      </Group>
                    }
                  >
                    <Text size="xs" c="dimmed">
                      {new Date(job.createdAt).toLocaleString()}
                      {job.completedAt && (
                        <>
                          {" "}
                          - Completed in{" "}
                          {Math.round(
                            (new Date(job.completedAt).getTime() -
                              new Date(job.createdAt).getTime()) /
                              1000
                          )}
                          s
                        </>
                      )}
                    </Text>
                    {job.config?.repositories && (
                      <Text size="xs" mt={4}>
                        Repos: {job.config.repositories.slice(0, 3).join(", ")}
                        {job.config.repositories.length > 3 &&
                          ` +${job.config.repositories.length - 3} more`}
                      </Text>
                    )}
                    {job.config?.projects && (
                      <Text size="xs" mt={4}>
                        Projects: {job.config.projects.join(", ")}
                      </Text>
                    )}
                    {job.result?.totalPRs !== undefined && (
                      <Text size="xs" c="green" mt={4}>
                        Processed {job.result.totalPRs} PRs
                      </Text>
                    )}
                    {job.result?.agentResponse && (
                      <Text size="xs" c="green" mt={4} lineClamp={2}>
                        {job.result.agentResponse.slice(0, 100)}...
                      </Text>
                    )}
                    {job.error && (
                      <Text size="xs" c="red" mt={4}>
                        Error: {job.error}
                      </Text>
                    )}
                    <Group gap="xs" mt="xs">
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconEye size={14} />}
                        onClick={() => viewJobLogs(job)}
                      >
                        View Logs ({job.logs?.length || 0})
                      </Button>
                      <Tooltip label="Delete job">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          size="sm"
                          onClick={() => deleteJob(job.id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </div>
        </Stack>
      </Card>

      {/* Logs Modal */}
      <Modal
        opened={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        title={
          <Group>
            <Text fw={500}>Job Logs</Text>
            {selectedJob && (
              <Badge color={getStatusColor(selectedJob.status)} size="sm">
                {selectedJob.status}
              </Badge>
            )}
          </Group>
        }
        size="xl"
      >
        {selectedJob && (
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text size="sm" c="dimmed">
                  Job ID: {selectedJob.id}
                </Text>
                <Text size="sm" c="dimmed">
                  Type: {selectedJob.type}
                </Text>
                <Text size="sm" c="dimmed">
                  Created: {new Date(selectedJob.createdAt).toLocaleString()}
                </Text>
              </div>
              <Button
                leftSection={<IconDownload size={16} />}
                variant="light"
                size="sm"
                onClick={() => downloadLogs(selectedJob)}
              >
                Download Logs
              </Button>
            </Group>

            <ScrollArea h={400}>
              <Stack gap={4}>
                {selectedJob.logs && selectedJob.logs.length > 0 ? (
                  selectedJob.logs.map((log, idx) => (
                    <Code
                      key={idx}
                      block
                      style={{
                        fontSize: "12px",
                        backgroundColor:
                          log.level === "error"
                            ? "var(--mantine-color-red-light)"
                            : log.level === "warn"
                            ? "var(--mantine-color-yellow-light)"
                            : undefined,
                      }}
                    >
                      <Text span size="xs" c="dimmed">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </Text>{" "}
                      <Text
                        span
                        size="xs"
                        fw={500}
                        c={
                          log.level === "error"
                            ? "red"
                            : log.level === "warn"
                            ? "yellow"
                            : "blue"
                        }
                      >
                        [{log.level.toUpperCase()}]
                      </Text>{" "}
                      {log.message}
                    </Code>
                  ))
                ) : (
                  <Text c="dimmed" size="sm">
                    No logs available
                  </Text>
                )}
              </Stack>
            </ScrollArea>

            {selectedJob.error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                title="Error"
              >
                {selectedJob.error}
              </Alert>
            )}

            {selectedJob.result && (
              <div>
                <Text fw={500} size="sm" mb="xs">
                  Result
                </Text>
                <ScrollArea h={150}>
                  <Code block style={{ fontSize: "11px" }}>
                    {JSON.stringify(selectedJob.result, null, 2)}
                  </Code>
                </ScrollArea>
              </div>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
