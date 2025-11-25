'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Container,
  Title,
  Text,
  Button,
  Badge,
  Group,
  Stack,
  Loader,
  Center,
  ActionIcon,
  Menu,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconDownload,
  IconDots,
  IconTrash,
  IconFileText,
  IconFileAnalytics,
  IconFileDescription,
  IconComponents,
  IconChartBar,
  IconArrowUp,
  IconPackage,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

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

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch(`/api/reports/${params.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch report');
        }
        const data = await response.json();
        setReport(data);
      } catch (error) {
        console.error('Failed to fetch report:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load report',
          color: 'red',
          icon: <IconAlertCircle />,
        });
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      fetchReport();
    }
  }, [params.id]);

  const handleDownload = () => {
    if (!report) return;

    const blob = new Blob([report.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.name.replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    notifications.show({
      title: 'Success',
      message: 'Report downloaded',
      color: 'green',
      icon: <IconCheck />,
    });
  };

  const handleDelete = async () => {
    if (!report || !confirm('Are you sure you want to delete this report?')) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      notifications.show({
        title: 'Success',
        message: 'Report deleted',
        color: 'green',
        icon: <IconCheck />,
      });

      router.push('/reports');
    } catch (error) {
      console.error('Failed to delete report:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete report',
        color: 'red',
        icon: <IconAlertCircle />,
      });
      setDeleting(false);
    }
  };

  const typeConfig: Record<string, { color: string; icon: any; label: string }> = {
    EVIDENCE: { color: 'blue', icon: IconFileText, label: 'Evidence Report' },
    SUMMARY: { color: 'green', icon: IconFileAnalytics, label: 'AI Summary' },
    COMPREHENSIVE: { color: 'violet', icon: IconFileDescription, label: 'Comprehensive' },
    COMPONENT_ANALYSIS: { color: 'orange', icon: IconComponents, label: 'Component Analysis' },
    CAPITALIZATION: { color: 'cyan', icon: IconChartBar, label: 'Capitalization' },
    UPWARD: { color: 'pink', icon: IconArrowUp, label: 'Upward Review' },
    REVIEW_PACKAGE: { color: 'grape', icon: IconPackage, label: 'Review Package' },
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

  if (!report) {
    return (
      <Container size="xl" py="xl">
        <Stack align="center" gap="md" py="xl">
          <IconAlertCircle size={48} color="var(--mantine-color-red-6)" />
          <Title order={2}>Report Not Found</Title>
          <Text c="dimmed">The report you're looking for doesn't exist.</Text>
          <Button
            leftSection={<IconArrowLeft size={18} />}
            onClick={() => router.push('/reports')}
          >
            Back to Reports
          </Button>
        </Stack>
      </Container>
    );
  }

  const config = typeConfig[report.type] || {
    color: 'gray',
    icon: IconFileText,
    label: report.type,
  };
  const Icon = config.icon;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => router.push('/reports')}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Group gap="xs" mb="xs">
                <Icon size={24} color={`var(--mantine-color-${config.color}-6)`} />
                <Title order={1}>{report.name}</Title>
              </Group>
              <Group gap="md">
                <Badge color={config.color} variant="light">
                  {config.label}
                </Badge>
                <Text size="sm" c="dimmed">
                  Created {format(new Date(report.createdAt), 'MMM d, yyyy \'at\' h:mm a')}
                </Text>
              </Group>
            </div>
          </Group>

          <Group>
            <Button
              leftSection={<IconDownload size={18} />}
              variant="light"
              onClick={handleDownload}
            >
              Download
            </Button>
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" size="lg">
                  <IconDots size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  Delete Report
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {/* Metadata */}
        {(report.evidenceCount || report.criteriaCount || report.jobId) && (
          <Group gap="md">
            {report.evidenceCount !== null && report.evidenceCount > 0 && (
              <Badge variant="dot" color="gray">
                {report.evidenceCount} evidence entries
              </Badge>
            )}
            {report.criteriaCount !== null && report.criteriaCount > 0 && (
              <Badge variant="dot" color="gray">
                {report.criteriaCount} criteria
              </Badge>
            )}
            {report.jobId && (
              <Badge variant="dot" color="gray">
                Job #{report.jobId.slice(0, 8)}
              </Badge>
            )}
          </Group>
        )}

        {/* Content */}
        <MarkdownRenderer content={report.content} />
      </Stack>
    </Container>
  );
}
