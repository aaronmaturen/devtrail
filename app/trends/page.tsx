"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import {
  Container,
  Title,
  Text,
  Paper,
  Group,
  Stack,
  Button,
  Card,
  Loader,
  Divider,
  TextInput,
  Alert,
  Badge,
  SegmentedControl,
  Select,
} from "@mantine/core";
import {
  IconTrendingUp,
  IconRefresh,
  IconAlertCircle,
  IconChartLine,
  IconCalendarStats,
  IconUsers,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { MonthlyInsightCard, MonthlyInsight } from "@/components/MonthlyInsightCard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { format, subMonths } from "date-fns";

interface TimeSeriesData {
  timeseries: Array<{
    date: string;
    components: Record<string, { pr_count: number; total_changes: number }>;
  }>;
  filters_applied: any;
}

interface DateRange {
  earliest: string | null;
  latest: string | null;
}

type DirectReport = {
  id: string;
  name: string | null;
  email: string | null;
};

export default function TrendsPage() {
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"line" | "area">("area");

  // Team member viewing
  const [directReports, setDirectReports] = useState<DirectReport[]>([]);
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);

  // Monthly insights state
  const [monthlyInsights, setMonthlyInsights] = useState<MonthlyInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [generatingMonths, setGeneratingMonths] = useState<Set<string>>(new Set());
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const insightRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load direct reports on mount
  useEffect(() => {
    loadDateRange();
    loadDirectReports();
  }, []);

  // Reload date range when viewed user changes
  useEffect(() => {
    loadDateRange();
  }, [viewAsUserId]);

  // Load data when date range or viewed user changes
  useEffect(() => {
    if (!dateFrom) return;
    loadTimeSeriesData();
    loadMonthlyInsights();
  }, [dateFrom, dateTo, viewAsUserId]);

  const loadDirectReports = async () => {
    try {
      const response = await fetch("/api/user/manager");
      if (response.ok) {
        const data = await response.json();
        setDirectReports(data.reports || []);
      }
    } catch (error) {
      console.error("Error loading direct reports:", error);
    }
  };

  const loadDateRange = async () => {
    try {
      const params = new URLSearchParams();
      if (viewAsUserId) params.append("viewAsUserId", viewAsUserId);

      const response = await fetch(`/api/analytics/repositories?${params.toString()}`);
      const data = await response.json();
      if (data.dateRange) {
        setDateRange(data.dateRange);
        if (data.dateRange.earliest) {
          setDateFrom(format(new Date(data.dateRange.earliest), "yyyy-MM-dd"));
        }
      }
    } catch (error) {
      console.error("Error loading date range:", error);
      // Default to 12 months if we can't get the range
      setDateFrom(format(subMonths(new Date(), 12), "yyyy-MM-dd"));
    }
  };

  const loadTimeSeriesData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (viewAsUserId) params.append("viewAsUserId", viewAsUserId);

      const response = await fetch(`/api/analytics/components/timeseries?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load trends data");
      }

      setTimeSeriesData(data);
    } catch (error: any) {
      console.error("Error loading time series data:", error);
      setError(error.message || "Failed to load trends data");
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyInsights = async () => {
    try {
      setInsightsLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (viewAsUserId) params.append("viewAsUserId", viewAsUserId);

      const response = await fetch(`/api/analytics/monthly-insights?${params.toString()}`);
      const data = await response.json();
      setMonthlyInsights(data.insights || []);
    } catch (error) {
      console.error("Error loading monthly insights:", error);
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleGenerateInsight = async (month: string) => {
    try {
      setGeneratingMonths((prev) => new Set([...prev, month]));

      const response = await fetch("/api/analytics/monthly-insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, force: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to start insight generation");
      }

      const data = await response.json();
      await pollJobCompletion(data.jobId, month);
    } catch (error) {
      console.error("Error generating insight:", error);
      notifications.show({
        title: "Generation Failed",
        message: "Failed to generate insight for this month",
        color: "red",
      });
    } finally {
      setGeneratingMonths((prev) => {
        const next = new Set(prev);
        next.delete(month);
        return next;
      });
    }
  };

  const handleRegenerateAll = async () => {
    if (timeSeriesChartData.length === 0) return;

    try {
      setRegeneratingAll(true);
      const months = timeSeriesChartData.map((d) => d.date);
      setGeneratingMonths(new Set(months));

      const response = await fetch("/api/analytics/monthly-insights/regenerate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months }),
      });

      if (!response.ok) {
        throw new Error("Failed to start regeneration");
      }

      const data = await response.json();
      await pollBulkJobCompletion(data.jobIds, months);

      notifications.show({
        title: "Regeneration Complete",
        message: `Generated insights for ${months.length} months`,
        color: "green",
      });
    } catch (error) {
      console.error("Error regenerating all insights:", error);
      notifications.show({
        title: "Regeneration Failed",
        message: "Failed to regenerate insights",
        color: "red",
      });
    } finally {
      setRegeneratingAll(false);
      setGeneratingMonths(new Set());
    }
  };

  const pollBulkJobCompletion = async (jobIds: string[], months: string[]) => {
    const maxAttempts = 120;
    let attempts = 0;
    const completedJobs = new Set<string>();

    while (attempts < maxAttempts && completedJobs.size < jobIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      for (let i = 0; i < jobIds.length; i++) {
        if (completedJobs.has(jobIds[i])) continue;

        try {
          const response = await fetch(`/api/jobs/${jobIds[i]}`);
          const job = await response.json();

          if (job.status === "COMPLETED" || job.status === "FAILED") {
            completedJobs.add(jobIds[i]);
            setGeneratingMonths((prev) => {
              const next = new Set(prev);
              next.delete(months[i]);
              return next;
            });
          }
        } catch (error) {
          console.error(`Error polling job ${jobIds[i]}:`, error);
        }
      }

      attempts++;
    }

    await loadMonthlyInsights();
  };

  const pollJobCompletion = async (jobId: string, month: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = await response.json();

        if (job.status === "COMPLETED") {
          await loadMonthlyInsights();
          return;
        }

        if (job.status === "FAILED") {
          console.error("Insight generation failed:", job.error);
          return;
        }
      } catch (error) {
        console.error("Error polling job:", error);
      }

      attempts++;
    }
  };

  const scrollToInsight = useCallback((month: string) => {
    const ref = insightRefs.current[month];
    if (ref) {
      ref.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

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

  const timeSeriesChartData = prepareTimeSeriesChartData();

  // Calculate summary stats
  const summaryStats = timeSeriesChartData.reduce(
    (acc, item) => ({
      totalPRs: acc.totalPRs + item.total_prs,
      totalChanges: acc.totalChanges + item.total_changes,
      months: acc.months + 1,
    }),
    { totalPRs: 0, totalChanges: 0, months: 0 }
  );

  const avgPRsPerMonth = summaryStats.months > 0 ? (summaryStats.totalPRs / summaryStats.months).toFixed(1) : 0;
  const avgChangesPerMonth = summaryStats.months > 0 ? Math.round(summaryStats.totalChanges / summaryStats.months) : 0;

  // Count insights
  const insightsGenerated = monthlyInsights.length;
  const insightsPending = timeSeriesChartData.length - insightsGenerated;

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={500}>Error Loading Trends</Text>
          <Text size="sm">{error}</Text>
          <Button onClick={loadTimeSeriesData} size="xs" mt="md">
            Retry
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Activity Trends</Title>
          <Text c="dimmed" mt="xs">
            {viewAsUserId
              ? `Viewing trends for ${directReports.find(r => r.id === viewAsUserId)?.name || 'team member'}`
              : "Track your development activity over time with AI-powered insights"}
          </Text>
        </div>
        <Group>
          {directReports.length > 0 && (
            <Select
              placeholder="My Trends"
              leftSection={<IconUsers size={16} />}
              data={[
                { value: "", label: "My Trends" },
                ...directReports.map((r) => ({
                  value: r.id,
                  label: r.name || r.email || "Unknown",
                })),
              ]}
              value={viewAsUserId || ""}
              onChange={(value) => setViewAsUserId(value || null)}
              clearable
              size="sm"
              style={{ width: 180 }}
            />
          )}
          <TextInput
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.currentTarget.value)}
            size="sm"
            style={{ width: 150 }}
          />
          <Text c="dimmed">to</Text>
          <TextInput
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.currentTarget.value)}
            size="sm"
            style={{ width: 150 }}
          />
        </Group>
      </Group>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <Card withBorder padding="lg">
          <Group>
            <IconCalendarStats size={32} style={{ color: "var(--mantine-color-blue-6)" }} />
            <div>
              <Text size="sm" c="dimmed">Months Tracked</Text>
              <Text size="xl" fw={700}>{summaryStats.months}</Text>
            </div>
          </Group>
        </Card>

        <Card withBorder padding="lg">
          <Group>
            <IconTrendingUp size={32} style={{ color: "var(--mantine-color-green-6)" }} />
            <div>
              <Text size="sm" c="dimmed">Avg PRs/Month</Text>
              <Text size="xl" fw={700}>{avgPRsPerMonth}</Text>
            </div>
          </Group>
        </Card>

        <Card withBorder padding="lg">
          <Group>
            <IconChartLine size={32} style={{ color: "var(--mantine-color-violet-6)" }} />
            <div>
              <Text size="sm" c="dimmed">Avg Changes/Month</Text>
              <Text size="xl" fw={700}>{avgChangesPerMonth.toLocaleString()}</Text>
            </div>
          </Group>
        </Card>

        <Card withBorder padding="lg">
          <Group>
            <IconRefresh size={32} style={{ color: insightsPending > 0 ? "var(--mantine-color-yellow-6)" : "var(--mantine-color-green-6)" }} />
            <div>
              <Text size="sm" c="dimmed">Insights Generated</Text>
              <Text size="xl" fw={700}>
                {insightsGenerated}/{timeSeriesChartData.length}
              </Text>
            </div>
          </Group>
        </Card>
      </div>

      {/* Activity Chart */}
      <Paper withBorder p="md" mb="xl">
        <Group justify="space-between" mb="md">
          <div>
            <Text fw={500}>Activity Over Time</Text>
            <Text size="sm" c="dimmed">
              Click on a month to jump to its insight
            </Text>
          </div>
          <SegmentedControl
            size="xs"
            value={chartType}
            onChange={(v) => setChartType(v as "line" | "area")}
            data={[
              { label: "Area", value: "area" },
              { label: "Line", value: "line" },
            ]}
          />
        </Group>

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : (
          <div style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "area" ? (
                <AreaChart
                  data={timeSeriesChartData}
                  onClick={(data) => {
                    if (data?.activeLabel) {
                      scrollToInsight(String(data.activeLabel));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="total_prs"
                    stroke="var(--mantine-color-blue-6)"
                    fill="var(--mantine-color-blue-2)"
                    name="PRs"
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="total_changes"
                    stroke="var(--mantine-color-red-6)"
                    fill="var(--mantine-color-red-2)"
                    name="Total Changes"
                  />
                </AreaChart>
              ) : (
                <LineChart
                  data={timeSeriesChartData}
                  onClick={(data) => {
                    if (data?.activeLabel) {
                      scrollToInsight(String(data.activeLabel));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
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
                    activeDot={{ r: 8 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="total_changes"
                    stroke="var(--mantine-color-red-6)"
                    name="Total Changes"
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </Paper>

      {/* Monthly Insights */}
      <Paper withBorder p="md">
        <Group justify="space-between" mb="md">
          <div>
            <Text fw={500}>Monthly Insights</Text>
            <Text size="sm" c="dimmed">
              AI-generated analysis of your monthly activity
            </Text>
          </div>
          <Group gap="sm">
            {insightsLoading && <Loader size="sm" />}
            <Button
              size="sm"
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={handleRegenerateAll}
              loading={regeneratingAll}
              disabled={timeSeriesChartData.length === 0 || regeneratingAll}
            >
              Regenerate All
            </Button>
          </Group>
        </Group>

        <Stack gap="xl">
          {timeSeriesChartData.length > 0 ? (
            [...timeSeriesChartData]
              .reverse()
              .map((dataPoint, index, arr) => {
                const insight = monthlyInsights.find((i) => i.month === dataPoint.date);
                const isLast = index === arr.length - 1;
                return (
                  <Fragment key={dataPoint.date}>
                    <MonthlyInsightCard
                      ref={(el) => {
                        insightRefs.current[dataPoint.date] = el;
                      }}
                      insight={insight || null}
                      month={dataPoint.date}
                      isGenerating={generatingMonths.has(dataPoint.date)}
                      onRegenerate={() => handleGenerateInsight(dataPoint.date)}
                    />
                    {!isLast && <Divider />}
                  </Fragment>
                );
              })
          ) : (
            <Text c="dimmed" ta="center" py="xl">
              No activity data available. Run a sync to import your GitHub activity.
            </Text>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
