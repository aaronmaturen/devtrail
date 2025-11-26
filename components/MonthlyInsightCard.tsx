"use client";

import { forwardRef } from "react";
import {
  Box,
  Text,
  Badge,
  Group,
  Stack,
  Button,
  Loader,
  List,
  ThemeIcon,
  SimpleGrid,
} from "@mantine/core";
import {
  IconRefresh,
  IconCheck,
  IconAlertTriangle,
  IconTrendingUp,
  IconTrendingDown,
  IconCalendar,
  IconGitBranch,
  IconCode,
} from "@tabler/icons-react";
import { format } from "date-fns";

export interface MonthlyInsight {
  id: string;
  month: string;
  year: number;
  monthNum: number;
  totalPrs: number;
  totalChanges: number;
  componentsCount: number;
  categories: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  tags: string[];
  summary: string;
  generatedAt: string;
  dataEndDate: string;
  isComplete: boolean;
  isStale: boolean;
}

interface MonthlyInsightCardProps {
  insight: MonthlyInsight | null;
  month: string; // For placeholder cards
  isGenerating: boolean;
  onRegenerate: () => void;
}

// Category colors for spark chart
const CATEGORY_COLORS: Record<string, string> = {
  feature: "#22c55e", // green
  bug: "#ef4444", // red
  refactor: "#f97316", // orange
  devex: "#8b5cf6", // violet
  docs: "#3b82f6", // blue
  test: "#06b6d4", // cyan
  infra: "#eab308", // yellow
  other: "#64748b", // gray
};

// Friendly category names
const CATEGORY_LABELS: Record<string, string> = {
  feature: "Feature",
  bug: "Bug Fix",
  refactor: "Refactor",
  devex: "DevEx",
  docs: "Docs",
  test: "Testing",
  infra: "Infra",
  other: "Other",
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS.other;
}

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category.toLowerCase()] || category;
}

// Spark chart component
function CategorySparkChart({ categories, totalPrs }: { categories: Record<string, number>; totalPrs: number }) {
  const entries = Object.entries(categories)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0 || totalPrs === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: "12px" }}>
      {/* Spark bar */}
      <div
        style={{
          display: "flex",
          height: "8px",
          borderRadius: "4px",
          overflow: "hidden",
          backgroundColor: "var(--mantine-color-gray-2)",
        }}
      >
        {entries.map(([category, count]) => {
          const percentage = (count / totalPrs) * 100;
          return (
            <div
              key={category}
              style={{
                width: `${percentage}%`,
                backgroundColor: getCategoryColor(category),
                minWidth: percentage > 0 ? "4px" : 0,
              }}
              title={`${getCategoryLabel(category)}: ${count} (${Math.round(percentage)}%)`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginTop: "6px",
        }}
      >
        {entries.slice(0, 4).map(([category, count]) => {
          const percentage = Math.round((count / totalPrs) * 100);
          return (
            <div
              key={category}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                color: "var(--mantine-color-dimmed)",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  backgroundColor: getCategoryColor(category),
                }}
              />
              <span>
                {getCategoryLabel(category)} ({percentage}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tag color mapping
const TAG_COLORS: Record<string, string> = {
  // Velocity
  "high-velocity": "green",
  "steady-pace": "blue",
  "low-activity": "gray",
  // Focus
  "feature-focused": "violet",
  "bug-fixing": "red",
  "refactoring": "orange",
  "maintenance": "yellow",
  "infrastructure": "cyan",
  // Scope
  "frontend-heavy": "pink",
  "backend-heavy": "indigo",
  "full-stack": "teal",
  "api-focused": "grape",
  // Quality
  "well-reviewed": "lime",
  "large-prs": "orange",
  "small-focused-prs": "green",
  // Collaboration
  "team-player": "blue",
  "solo-contributor": "gray",
  "code-reviewer": "violet",
  // Special
  "no-activity": "gray",
  "needs-review": "yellow",
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || "gray";
}

function formatMonthDisplay(month: string): string {
  try {
    const date = new Date(`${month}-01`);
    return format(date, "MMMM yyyy");
  } catch {
    return month;
  }
}

export const MonthlyInsightCard = forwardRef<HTMLDivElement, MonthlyInsightCardProps>(
  ({ insight, month, isGenerating, onRegenerate }, ref) => {
    const displayMonth = insight?.month || month;
    const monthName = formatMonthDisplay(displayMonth);

    // Placeholder state - no insight yet
    if (!insight) {
      return (
        <Box ref={ref} id={`insight-${displayMonth}`}>
          <Group justify="space-between" mb="md">
            <Group gap="sm">
              <IconCalendar size={20} style={{ color: "var(--mantine-color-dimmed)" }} />
              <Text fw={600} size="lg">
                {monthName}
              </Text>
            </Group>
            <Button
              variant="light"
              size="xs"
              leftSection={isGenerating ? <Loader size={14} /> : <IconRefresh size={14} />}
              onClick={onRegenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "Analyzing..." : "Generate Insights"}
            </Button>
          </Group>
          <Text c="dimmed" ta="center" py="xl">
            No insights generated yet. Click &quot;Generate Insights&quot; to analyze this month.
          </Text>
        </Box>
      );
    }

    // No activity state
    if (insight.totalPrs === 0) {
      return (
        <Box ref={ref} id={`insight-${displayMonth}`}>
          <Group justify="space-between" mb="md">
            <Group gap="sm">
              <IconCalendar size={20} style={{ color: "var(--mantine-color-dimmed)" }} />
              <Text fw={600} size="lg">
                {monthName}
              </Text>
              <Badge color="gray" variant="light" size="sm">
                No Activity
              </Badge>
            </Group>
          </Group>
          <Text c="dimmed" ta="center" py="md">
            {insight.summary}
          </Text>
        </Box>
      );
    }

    return (
      <Box ref={ref} id={`insight-${displayMonth}`}>
        {/* Header */}
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <IconCalendar size={20} style={{ color: "var(--mantine-color-blue-6)" }} />
            <Text fw={600} size="lg">
              {monthName}{!insight.isComplete && " (in progress)"}
            </Text>
            {insight.isStale && (
              <Badge color="yellow" variant="light" size="sm" leftSection={<IconAlertTriangle size={12} />}>
                Needs Refresh
              </Badge>
            )}
            {insight.isComplete && !insight.isStale && (
              <Badge color="green" variant="light" size="sm" leftSection={<IconCheck size={12} />}>
                Complete
              </Badge>
            )}
          </Group>
          <Button
            variant="subtle"
            size="xs"
            leftSection={isGenerating ? <Loader size={14} /> : <IconRefresh size={14} />}
            onClick={onRegenerate}
            disabled={isGenerating}
          >
            {isGenerating ? "Analyzing..." : "Refresh"}
          </Button>
        </Group>

        {/* Tags */}
        <Group gap="xs" mb="md">
          {insight.tags.map((tag) => (
            <Badge key={tag} color={getTagColor(tag)} variant="light" size="sm">
              {tag}
            </Badge>
          ))}
        </Group>

        {/* Category Spark Chart */}
        {insight.categories && Object.keys(insight.categories).length > 0 && (
          <CategorySparkChart categories={insight.categories} totalPrs={insight.totalPrs} />
        )}

        {/* Summary */}
        <Text size="sm" mb="md" c="dimmed">
          {insight.summary}
        </Text>

        {/* Metrics Row */}
        <Group gap="xl" mb="md">
          <Group gap="xs">
            <IconGitBranch size={16} style={{ color: "var(--mantine-color-green-6)" }} />
            <Text size="sm" fw={500}>
              {insight.totalPrs} PRs
            </Text>
          </Group>
          <Group gap="xs">
            <IconCode size={16} style={{ color: "var(--mantine-color-violet-6)" }} />
            <Text size="sm" fw={500}>
              {insight.totalChanges.toLocaleString()} changes
            </Text>
          </Group>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {insight.componentsCount} components
            </Text>
          </Group>
        </Group>

        {/* Strengths and Weaknesses */}
        <SimpleGrid cols={2} spacing="md">
          {/* Strengths */}
          <Stack gap="xs">
            <Group gap="xs">
              <IconTrendingUp size={16} style={{ color: "var(--mantine-color-green-6)" }} />
              <Text size="sm" fw={500}>
                Strengths
              </Text>
            </Group>
            <List
              size="sm"
              spacing="xs"
              icon={
                <ThemeIcon color="green" size={16} radius="xl">
                  <IconCheck size={12} />
                </ThemeIcon>
              }
              styles={{ itemWrapper: { alignItems: "flex-start" } }}
            >
              {insight.strengths.length > 0 ? (
                insight.strengths.map((strength, idx) => (
                  <List.Item key={idx}>{strength}</List.Item>
                ))
              ) : (
                <List.Item>
                  <Text c="dimmed" size="sm">
                    No strengths identified
                  </Text>
                </List.Item>
              )}
            </List>
          </Stack>

          {/* Areas for Improvement */}
          <Stack gap="xs">
            <Group gap="xs">
              <IconTrendingDown size={16} style={{ color: "var(--mantine-color-orange-6)" }} />
              <Text size="sm" fw={500}>
                Areas to Improve
              </Text>
            </Group>
            <List
              size="sm"
              spacing="xs"
              icon={
                <ThemeIcon color="orange" size={16} radius="xl">
                  <IconAlertTriangle size={12} />
                </ThemeIcon>
              }
              styles={{ itemWrapper: { alignItems: "flex-start" } }}
            >
              {insight.weaknesses.length > 0 ? (
                insight.weaknesses.map((weakness, idx) => (
                  <List.Item key={idx}>{weakness}</List.Item>
                ))
              ) : (
                <List.Item>
                  <Text c="dimmed" size="sm">
                    No improvements suggested
                  </Text>
                </List.Item>
              )}
            </List>
          </Stack>
        </SimpleGrid>
      </Box>
    );
  }
);

MonthlyInsightCard.displayName = "MonthlyInsightCard";
