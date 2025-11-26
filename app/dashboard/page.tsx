"use client";

import { useState, useEffect } from "react";
import {
  Container,
  Title,
  Text,
  Paper,
  Group,
  Stack,
  Button,
  Loader,
  Alert,
  Tabs,
  Badge,
  Select,
  TextInput,
  MultiSelect,
  Card,
  Table,
  ActionIcon,
} from "@mantine/core";
import {
  IconChartBar,
  IconGitBranch,
  IconCode,
  IconUsers,
  IconTrendingUp,
  IconDownload,
  IconFilter,
  IconX,
  IconAlertCircle,
  IconClock,
  IconChecks,
} from "@tabler/icons-react";
import AdminPanel from "@/components/AdminPanel";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  ScatterChart,
  Scatter,
} from "recharts";
import { format, subMonths } from "date-fns";

interface ComponentData {
  name: string;
  pr_count: number;
  total_changes: number;
  additions: number;
  deletions: number;
  repos: string[];
  paths: string[];
  pr_numbers: number[];
  pr_titles: string[];
  jira_keys: string[];
  jira_types: string[];
  avg_duration: number;
  total_duration: number;
  first_contribution: string;
  last_contribution: string;
  role: string;
  criteria_matched: {
    lead: {
      min_prs: boolean;
      min_changes: boolean;
      min_duration_days: boolean;
    };
    significant: {
      min_prs: boolean;
      min_changes: boolean;
      min_duration_days: boolean;
    };
    support: {
      min_prs: boolean;
      min_changes: boolean;
      min_duration_days: boolean;
    };
  };
}

interface AnalyticsSummary {
  total_components: number;
  lead_components: number;
  significant_components: number;
  support_components: number;
  minor_components: number;
  total_prs: number;
  total_changes: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  components: ComponentData[];
  using_pr_counts?: boolean;
  note?: string;
  filters_applied: any;
}

interface Repository {
  name: string;
  total_prs: number;
  active_prs: number;
  latest_activity: string | null;
}

interface TimeSeriesData {
  timeseries: Array<{
    date: string;
    components: Record<string, { pr_count: number; total_changes: number }>;
  }>;
  filters_applied: any;
}

const ROLE_COLORS = {
  Lead: "#ef4444",
  "Significant Contributor": "#f97316",
  Support: "#eab308",
  "Minor Contributor": "#64748b",
};

const ROLE_DESCRIPTIONS = {
  Lead: "5+ PRs, 1000+ changes, 90+ days active",
  "Significant Contributor": "3+ PRs, 500+ changes, 30+ days active",
  Support: "1+ PRs, 100+ changes",
  "Minor Contributor": "Below support thresholds",
};

interface JobStats {
  total: number;
  completed: number;
  failed: number;
}

export default function DashboardPage() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null
  );
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData | null>(
    null
  );
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [availableComponents, setAvailableComponents] = useState<string[]>([]);
  const [jobStats, setJobStats] = useState<JobStats>({
    total: 0,
    completed: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [dateFrom, setDateFrom] = useState<string>(
    format(subMonths(new Date(), 12), "yyyy-MM-dd")
  );
  const [dateTo, setDateTo] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [selectedRepositories, setSelectedRepositories] = useState<string[]>(
    []
  );
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Load initial data
  useEffect(() => {
    loadRepositories();
    loadAvailableComponents();
    loadJobStats();
  }, []);

  const loadJobStats = async () => {
    try {
      const response = await fetch("/api/jobs/stats");
      if (response.ok) {
        const data = await response.json();
        setJobStats(data);
      }
    } catch (error) {
      console.error("Error loading job stats:", error);
    }
  };

  // Load analytics data when filters change
  useEffect(() => {
    loadAnalyticsData();
    loadTimeSeriesData();
  }, [dateFrom, dateTo, selectedRepositories, selectedComponents]);

  const loadRepositories = async () => {
    try {
      const response = await fetch("/api/analytics/repositories");
      const data = await response.json();
      setRepositories(data.repositories || []);
    } catch (error) {
      console.error("Error loading repositories:", error);
    }
  };

  const loadAvailableComponents = async () => {
    try {
      const response = await fetch("/api/analytics/components/list");
      const data = await response.json();
      setAvailableComponents(data.components || []);
    } catch (error) {
      console.error("Error loading components:", error);
    }
  };

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      selectedRepositories.forEach((repo) =>
        params.append("repositories", repo)
      );
      selectedComponents.forEach((comp) => params.append("components", comp));

      const response = await fetch(
        `/api/analytics/components?${params.toString()}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load analytics data");
      }

      setAnalyticsData(data);
    } catch (error: any) {
      console.error("Error loading analytics data:", error);
      setError(error.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const loadTimeSeriesData = async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      selectedRepositories.forEach((repo) =>
        params.append("repositories", repo)
      );
      selectedComponents.forEach((comp) => params.append("components", comp));

      const response = await fetch(
        `/api/analytics/components/timeseries?${params.toString()}`
      );
      const data = await response.json();
      setTimeSeriesData(data);
    } catch (error) {
      console.error("Error loading time series data:", error);
    }
  };

  const exportData = async () => {
    if (!analyticsData) return;

    const csvContent = [
      "Component,Role,PRs,Total Changes,Additions,Deletions,Avg Duration (days),Repositories,First Contribution,Last Contribution",
      ...analyticsData.components.map((comp) =>
        [
          comp.name,
          comp.role,
          comp.pr_count,
          comp.total_changes,
          comp.additions,
          comp.deletions,
          comp.avg_duration.toFixed(1),
          comp.repos.join(";"),
          comp.first_contribution.split("T")[0],
          comp.last_contribution.split("T")[0],
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `component-analysis-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setDateFrom(format(subMonths(new Date(), 12), "yyyy-MM-dd"));
    setDateTo(format(new Date(), "yyyy-MM-dd"));
    setSelectedRepositories([]);
    setSelectedComponents([]);
  };

  const prepareChartData = () => {
    if (!analyticsData)
      return { roleData: [], componentData: [], scatterData: [] };

    const roleData = [
      {
        name: "Lead",
        value: analyticsData.summary.lead_components,
        color: ROLE_COLORS.Lead,
      },
      {
        name: "Significant",
        value: analyticsData.summary.significant_components,
        color: ROLE_COLORS["Significant Contributor"],
      },
      {
        name: "Support",
        value: analyticsData.summary.support_components,
        color: ROLE_COLORS.Support,
      },
      {
        name: "Minor",
        value: analyticsData.summary.minor_components,
        color: ROLE_COLORS["Minor Contributor"],
      },
    ];

    const componentData = analyticsData.components.slice(0, 10).map((comp) => ({
      name:
        comp.name.length > 15 ? comp.name.substring(0, 15) + "..." : comp.name,
      fullName: comp.name,
      prs: comp.pr_count,
      changes: comp.total_changes,
      role: comp.role,
    }));

    const scatterData = analyticsData.components.map((comp) => ({
      x: comp.pr_count,
      y: analyticsData.using_pr_counts ? comp.avg_duration : comp.total_changes,
      name: comp.name,
      role: comp.role,
      fill: ROLE_COLORS[comp.role as keyof typeof ROLE_COLORS],
    }));

    return { roleData, componentData, scatterData };
  };

  const prepareTimeSeriesChartData = () => {
    if (!timeSeriesData) return [];

    return timeSeriesData.timeseries.map((item) => {
      const dataPoint: any = {
        date: item.date,
        total_prs: 0,
        total_changes: 0,
      };

      Object.values(item.components).forEach((comp) => {
        dataPoint.total_prs += comp.pr_count;
        dataPoint.total_changes += comp.total_changes;
      });

      return dataPoint;
    });
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Group justify="center" mt="xl">
          <Loader size="lg" />
        </Group>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={500}>Error Loading Analytics</Text>
          <Text size="sm">{error}</Text>
          <Button onClick={loadAnalyticsData} size="xs" mt="md">
            Retry
          </Button>
        </Alert>
      </Container>
    );
  }

  const { roleData, componentData, scatterData } = prepareChartData();
  const timeSeriesChartData = prepareTimeSeriesChartData();

  return (
    <Container size="xl" py="xl">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Component Analytics Dashboard</Title>
          <Text c="dimmed" mt="xs">
            Analyze your code contributions by component and domain
          </Text>
        </div>
        <Group>
          <Button
            variant="light"
            leftSection={<IconFilter size={16} />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={exportData}
            disabled={!analyticsData}
          >
            Export CSV
          </Button>
        </Group>
      </Group>

      {/* Notice for PR count mode */}
      {analyticsData?.using_pr_counts && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />} mb="xl">
          <Text fw={500}>Analysis Mode: PR Count Based</Text>
          <Text size="sm" mt="xs">
            {analyticsData.note} Role assignments are based on PR volume and
            duration instead of code changes.
          </Text>
        </Alert>
      )}

      {/* Filters */}
      {showFilters && (
        <Paper withBorder p="md" mb="xl">
          <Group justify="space-between" mb="md">
            <Text fw={500}>Filters</Text>
            <Button
              variant="subtle"
              size="xs"
              onClick={clearFilters}
              leftSection={<IconX size={14} />}
            >
              Clear All
            </Button>
          </Group>
          <Group grow>
            <TextInput
              label="From Date"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.currentTarget.value)}
            />
            <TextInput
              label="To Date"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.currentTarget.value)}
            />
            <MultiSelect
              label="Repositories"
              placeholder="Select repositories..."
              data={repositories.map((r) => ({ value: r.name, label: r.name }))}
              value={selectedRepositories}
              onChange={setSelectedRepositories}
            />
            <MultiSelect
              label="Components"
              placeholder="Select components..."
              data={availableComponents.map((c) => ({ value: c, label: c }))}
              value={selectedComponents}
              onChange={setSelectedComponents}
              searchable
            />
          </Group>
        </Paper>
      )}

      {analyticsData && (
        <>
          {/* Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <Card withBorder padding="lg">
              <Group>
                <IconCode
                  size={32}
                  style={{ color: "var(--mantine-color-blue-6)" }}
                />
                <div>
                  <Text size="sm" c="dimmed">
                    Total Components
                  </Text>
                  <Text size="xl" fw={700}>
                    {analyticsData.summary.total_components}
                  </Text>
                </div>
              </Group>
            </Card>

            <Card withBorder padding="lg">
              <Group>
                <IconGitBranch
                  size={32}
                  style={{ color: "var(--mantine-color-green-6)" }}
                />
                <div>
                  <Text size="sm" c="dimmed">
                    Total PRs
                  </Text>
                  <Text size="xl" fw={700}>
                    {analyticsData.summary.total_prs}
                  </Text>
                </div>
              </Group>
            </Card>

            <Card withBorder padding="lg">
              <Group>
                <IconTrendingUp
                  size={32}
                  style={{ color: "var(--mantine-color-violet-6)" }}
                />
                <div>
                  <Text size="sm" c="dimmed">
                    Total Changes
                  </Text>
                  <Text size="xl" fw={700}>
                    {analyticsData.summary.total_changes.toLocaleString()}
                  </Text>
                </div>
              </Group>
            </Card>

            <Card withBorder padding="lg">
              <Group>
                <IconUsers
                  size={32}
                  style={{ color: "var(--mantine-color-red-6)" }}
                />
                <div>
                  <Text size="sm" c="dimmed">
                    Leadership Roles
                  </Text>
                  <Text size="xl" fw={700}>
                    {analyticsData.summary.lead_components}
                  </Text>
                </div>
              </Group>
            </Card>

            <Card withBorder padding="lg">
              <Group>
                <IconChecks
                  size={32}
                  style={{
                    color:
                      jobStats.completed === jobStats.total
                        ? "var(--mantine-color-green-6)"
                        : "var(--mantine-color-yellow-6)",
                  }}
                />
                <div>
                  <Text size="sm" c="dimmed">
                    Sync Jobs
                  </Text>
                  <Text size="xl" fw={700}>
                    {jobStats.completed}/{jobStats.total}
                  </Text>
                </div>
              </Group>
            </Card>
          </div>

          {/* Charts */}
          <Tabs defaultValue="overview">
            <Tabs.List>
              <Tabs.Tab value="overview">Overview</Tabs.Tab>
              <Tabs.Tab value="sync">Sync History</Tabs.Tab>
              <Tabs.Tab value="components">Top Components</Tabs.Tab>
              <Tabs.Tab value="trends">Trends</Tabs.Tab>
              <Tabs.Tab value="details">Component Details</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="sync" pt="xl">
              <AdminPanel />
            </Tabs.Panel>

            <Tabs.Panel value="overview" pt="xl">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
                  gap: "2rem",
                }}
              >
                {/* Role Distribution */}
                <Paper withBorder p="md">
                  <Text fw={500} mb="xs">
                    Role Distribution
                  </Text>
                  <Text size="sm" c="dimmed" mb="md">
                    Breakdown of your leadership roles across components
                  </Text>
                  <div style={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={roleData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name}: ${value}`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {roleData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <Stack gap="xs" mt="md">
                    {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
                      <Group key={role} gap="xs">
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor:
                              ROLE_COLORS[role as keyof typeof ROLE_COLORS],
                          }}
                        />
                        <Text size="sm">
                          <strong>{role}:</strong> {desc}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Paper>

                {/* PR vs Changes Scatter */}
                <Paper withBorder p="md">
                  <Text fw={500} mb="xs">
                    Component Contribution Matrix
                  </Text>
                  <Text size="sm" c="dimmed" mb="md">
                    {analyticsData?.using_pr_counts
                      ? "PRs vs average duration by component role"
                      : "PRs vs code changes by component role"}
                  </Text>
                  <div style={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="x"
                          type="number"
                          name="PRs"
                          label={{
                            value: "Number of PRs",
                            position: "insideBottom",
                            offset: -10,
                          }}
                        />
                        <YAxis
                          dataKey="y"
                          type="number"
                          name={
                            analyticsData?.using_pr_counts
                              ? "Duration"
                              : "Changes"
                          }
                          label={{
                            value: analyticsData?.using_pr_counts
                              ? "Avg Duration (days)"
                              : "Total Changes",
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip
                          formatter={(value: any, name: any) => [
                            name === "x"
                              ? `${value} PRs`
                              : analyticsData?.using_pr_counts
                              ? `${value} days`
                              : `${value} changes`,
                            name === "x"
                              ? "PRs"
                              : analyticsData?.using_pr_counts
                              ? "Avg Duration"
                              : "Changes",
                          ]}
                          labelFormatter={(_, payload: any) =>
                            payload?.[0]?.payload?.name || ""
                          }
                        />
                        <Scatter data={scatterData} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </Paper>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="components" pt="xl">
              <Paper withBorder p="md">
                <Text fw={500} mb="xs">
                  Top Components by{" "}
                  {analyticsData?.using_pr_counts ? "PRs" : "Changes"}
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                  {analyticsData?.using_pr_counts
                    ? "Components with the highest number of pull requests"
                    : "Your most impactful component contributions"}
                </Text>
                <div style={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={componentData} layout="horizontal">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={120} />
                      <Tooltip
                        formatter={(value: any) => [
                          analyticsData?.using_pr_counts
                            ? `${value} PRs`
                            : `${value} changes`,
                          analyticsData?.using_pr_counts
                            ? "PRs"
                            : "Total Changes",
                        ]}
                        labelFormatter={(label, payload: any) =>
                          payload?.[0]?.payload?.fullName || label
                        }
                      />
                      <Bar
                        dataKey={
                          analyticsData?.using_pr_counts ? "prs" : "changes"
                        }
                        fill="var(--mantine-color-blue-6)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="trends" pt="xl">
              <Paper withBorder p="md">
                <Text fw={500} mb="xs">
                  Activity Trends Over Time
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                  Monthly PR and code change activity
                </Text>
                <div style={{ height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeSeriesChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="total_prs"
                        stroke="var(--mantine-color-blue-6)"
                        name="PRs"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="total_changes"
                        stroke="var(--mantine-color-red-6)"
                        name="Total Changes"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="details" pt="xl">
              <Paper withBorder p="md">
                <Text fw={500} mb="xs">
                  Component Details
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                  Detailed breakdown of all your component contributions
                </Text>
                <div style={{ overflowX: "auto" }}>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Component</Table.Th>
                        <Table.Th>Role</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>PRs</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>
                          Changes
                        </Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>
                          Avg Duration
                        </Table.Th>
                        <Table.Th>Repositories</Table.Th>
                        <Table.Th>Activity Period</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {analyticsData.components.map((comp) => (
                        <Table.Tr key={comp.name}>
                          <Table.Td style={{ fontWeight: 500 }}>
                            {comp.name}
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              color={
                                comp.role === "Lead"
                                  ? "red"
                                  : comp.role === "Significant Contributor"
                                  ? "orange"
                                  : comp.role === "Support"
                                  ? "yellow"
                                  : "gray"
                              }
                              variant="light"
                            >
                              {comp.role}
                            </Badge>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            {comp.pr_count}
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            {comp.total_changes.toLocaleString()}
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            {comp.avg_duration.toFixed(1)} days
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{comp.repos.join(", ")}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              {format(
                                new Date(comp.first_contribution),
                                "MMM yyyy"
                              )}{" "}
                              -{" "}
                              {format(
                                new Date(comp.last_contribution),
                                "MMM yyyy"
                              )}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </div>
              </Paper>
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Container>
  );
}
