'use client';

import { useMemo } from 'react';
import { Card, Text, Stack, Group } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { format } from 'date-fns';

type ProgressEntry = {
  id: string;
  progressPercent: number;
  notes: string | null;
  aiSummary: string | null;
  evidence: string | null;
  createdAt: string;
};

type ProgressChartProps = {
  progressEntries: ProgressEntry[];
  startDate: string;
  targetDate: string;
};

export function ProgressChart({
  progressEntries,
  startDate,
  targetDate,
}: ProgressChartProps) {
  const chartData = useMemo(() => {
    // Sort entries by date (oldest first)
    const sortedEntries = [...progressEntries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Build chart data with baseline
    const data = [
      {
        date: format(new Date(startDate), 'MMM d'),
        progress: 0,
        fullDate: new Date(startDate),
      },
      ...sortedEntries.map((entry) => ({
        date: format(new Date(entry.createdAt), 'MMM d'),
        progress: entry.progressPercent,
        fullDate: new Date(entry.createdAt),
      })),
    ];

    // Calculate ideal progress line
    const start = new Date(startDate).getTime();
    const end = new Date(targetDate).getTime();
    const now = Date.now();
    const totalDuration = end - start;

    return data.map((point) => {
      const elapsed = point.fullDate.getTime() - start;
      const idealProgress = Math.min(100, (elapsed / totalDuration) * 100);

      return {
        ...point,
        ideal: Math.round(idealProgress),
      };
    });
  }, [progressEntries, startDate, targetDate]);

  if (progressEntries.length === 0) {
    return (
      <Card withBorder padding="xl" radius="md">
        <Text c="dimmed" ta="center">
          No progress data to display yet. Add your first progress update to see the chart.
        </Text>
      </Card>
    );
  }

  const currentProgress = progressEntries[0]?.progressPercent || 0;
  const startProgress = progressEntries[progressEntries.length - 1]?.progressPercent || 0;
  const progressChange = currentProgress - startProgress;

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Text size="sm" c="dimmed" tt="uppercase" fw={700}>
              Progress Over Time
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              Tracking your journey toward goal completion
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" ta="right">
              Change
            </Text>
            <Text
              size="lg"
              fw={700}
              c={progressChange >= 0 ? 'green' : 'red'}
              ta="right"
            >
              {progressChange >= 0 ? '+' : ''}
              {progressChange}%
            </Text>
          </div>
        </Group>

        <LineChart
          h={300}
          data={chartData}
          dataKey="date"
          series={[
            { name: 'progress', label: 'Actual Progress', color: 'blue' },
            { name: 'ideal', label: 'Ideal Progress', color: 'gray.5' },
          ]}
          curveType="monotone"
          withLegend
          withDots
          withTooltip
          yAxisProps={{
            domain: [0, 100],
          }}
          gridAxis="xy"
        />

        <Text size="xs" c="dimmed">
          The gray line shows ideal linear progress from start to target date. The blue line shows
          your actual progress updates.
        </Text>
      </Stack>
    </Card>
  );
}
