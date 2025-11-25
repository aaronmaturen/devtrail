'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  SimpleGrid,
  Paper,
  Loader,
  Center,
} from '@mantine/core';
import {
  IconPlus,
  IconFileText,
  IconFileAnalytics,
  IconChartBar,
  IconComponents,
  IconArrowUp,
  IconFileDescription,
  IconPackage,
} from '@tabler/icons-react';

type Report = {
  id: string;
  name: string;
  type: string;
  content: string;
  metadata: string | null;
  jobId: string | null;
  evidenceCount: number | null;
  criteriaCount: number | null;
  createdAt: string;
  updatedAt: string;
};

type Stats = {
  type: string;
  _count: number;
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReports() {
      try {
        const response = await fetch('/api/reports?limit=50');
        const data = await response.json();
        setReports(data.reports);

        // Calculate stats from reports
        const statsByType = data.reports.reduce((acc: Record<string, number>, item: Report) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {});

        const statsArray = Object.entries(statsByType).map(([type, count]) => ({
          type,
          _count: count as number,
        }));

        setStats(statsArray);
      } catch (error) {
        console.error('Failed to fetch reports:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchReports();
  }, []);

  const statsByType = stats.reduce((acc, stat) => {
    acc[stat.type] = stat._count;
    return acc;
  }, {} as Record<string, number>);

  const typeConfig = {
    EVIDENCE: { color: 'blue', icon: IconFileText, label: 'Evidence Reports' },
    SUMMARY: { color: 'green', icon: IconFileAnalytics, label: 'AI Summaries' },
    COMPREHENSIVE: { color: 'violet', icon: IconFileDescription, label: 'Comprehensive' },
    COMPONENT_ANALYSIS: { color: 'orange', icon: IconComponents, label: 'Component Analysis' },
    CAPITALIZATION: { color: 'cyan', icon: IconChartBar, label: 'Capitalization' },
    UPWARD: { color: 'pink', icon: IconArrowUp, label: 'Upward Reviews' },
    REVIEW_PACKAGE: { color: 'grape', icon: IconPackage, label: 'Review Packages' },
  };

  const getPreviewText = (content: string, maxLength: number = 150): string => {
    // Remove markdown headers and get first few lines
    const lines = content.split('\n').filter(line => !line.startsWith('#'));
    const preview = lines.join(' ').substring(0, maxLength);
    return preview + (content.length > maxLength ? '...' : '');
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '50vh' }}>
          <Loader size="xl" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>Reports</Title>
            <Text c="dimmed" size="sm">
              {reports.length} total reports generated
            </Text>
          </div>
          <Button
            component={Link}
            href="/reports/new"
            leftSection={<IconPlus size={18} />}
          >
            Generate Report
          </Button>
        </Group>

        {/* Stats Grid */}
        {stats.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            {Object.entries(typeConfig).map(([type, config]) => {
              const Icon = config.icon;
              const count = statsByType[type] || 0;
              if (count === 0) return null;
              return (
                <Paper key={type} withBorder p="md" radius="md">
                  <Group>
                    <Icon size={32} color={`var(--mantine-color-${config.color}-6)`} />
                    <div style={{ flex: 1 }}>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        {config.label}
                      </Text>
                      <Text size="xl" fw={700}>
                        {count}
                      </Text>
                    </div>
                  </Group>
                </Paper>
              );
            })}
          </SimpleGrid>
        )}

        {/* Reports List */}
        <Stack gap="md">
          {reports.length === 0 ? (
            <Card withBorder p="xl" radius="md">
              <Stack align="center" gap="sm">
                <IconFileText size={48} color="var(--mantine-color-gray-5)" />
                <Text c="dimmed">No reports generated yet. Create your first report.</Text>
                <Button
                  component={Link}
                  href="/reports/new"
                  leftSection={<IconPlus size={18} />}
                  variant="light"
                >
                  Generate Report
                </Button>
              </Stack>
            </Card>
          ) : (
            reports.map((report) => {
              const config = typeConfig[report.type as keyof typeof typeConfig] || {
                color: 'gray',
                icon: IconFileText,
                label: report.type,
              };
              const Icon = config.icon;

              return (
                <Card
                  key={report.id}
                  component={Link}
                  href={`/reports/${report.id}`}
                  withBorder
                  padding="lg"
                  radius="md"
                  style={{ cursor: 'pointer' }}
                  styles={{
                    root: {
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: 'var(--mantine-shadow-md)',
                      },
                    },
                  }}
                >
                  <Stack gap="sm">
                    {/* Header */}
                    <Group justify="space-between">
                      <Group>
                        <Icon size={24} color={`var(--mantine-color-${config.color}-6)`} />
                        <div>
                          <Text fw={600} size="lg">
                            {report.name}
                          </Text>
                          <Badge color={config.color} variant="light" size="sm">
                            {config.label}
                          </Badge>
                        </div>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {format(new Date(report.createdAt), 'MMM d, yyyy')}
                      </Text>
                    </Group>

                    {/* Preview */}
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {getPreviewText(report.content)}
                    </Text>

                    {/* Metadata */}
                    <Group gap="md">
                      {report.evidenceCount !== null && report.evidenceCount > 0 && (
                        <Text size="xs" c="dimmed">
                          📊 {report.evidenceCount} evidence entries
                        </Text>
                      )}
                      {report.criteriaCount !== null && report.criteriaCount > 0 && (
                        <Text size="xs" c="dimmed">
                          🎯 {report.criteriaCount} criteria
                        </Text>
                      )}
                      {report.jobId && (
                        <Text size="xs" c="dimmed">
                          🔄 Job #{report.jobId.slice(0, 8)}
                        </Text>
                      )}
                    </Group>
                  </Stack>
                </Card>
              );
            })
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
