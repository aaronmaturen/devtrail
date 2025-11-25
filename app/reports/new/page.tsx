'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Stack,
  Select,
  MultiSelect,
  Group,
  Loader,
  Alert,
  Progress,
  Code,
  Paper,
  Divider,
  Badge,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck, IconFileAnalytics, IconX, IconClock, IconArrowLeft, IconPlus } from '@tabler/icons-react';
import Link from 'next/link';

type Criterion = {
  id: number;
  areaOfConcentration: string;
  subarea: string;
  description: string;
  prDetectable: boolean;
};

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
}

export default function NewReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);

  // Form state
  const [reportType, setReportType] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);

  // Job state
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadFormData() {
      try {
        // Load repositories
        const reposResponse = await fetch('/api/evidence/repositories');
        const reposData = await reposResponse.json();
        setRepositories(reposData.repositories || []);

        // Load criteria (only PR-detectable ones)
        const criteriaResponse = await fetch('/api/criteria?prDetectable=true');
        const criteriaData = await criteriaResponse.json();
        setCriteria(criteriaData.criteria || []);

        // Check for Anthropic API key
        const configResponse = await fetch('/api/config');
        if (configResponse.ok) {
          const configs = await configResponse.json();
          const anthropicConfig = configs.find((c: any) => c.key === 'anthropic_api_key');
          setHasAnthropicKey(!!anthropicConfig?.value);
        }
      } catch (error) {
        console.error('Failed to load form data:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load form data',
          color: 'red',
          icon: <IconAlertCircle />,
        });
      } finally {
        setLoadingData(false);
      }
    }

    loadFormData();
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

      // If job completed successfully, redirect to the report
      if (activeJob?.status === 'COMPLETED' && activeJob.result?.reportId) {
        setTimeout(() => {
          router.push(`/reports/${activeJob.result.reportId}`);
        }, 2000);
      }
    }
  }, [activeJob?.id, activeJob?.status]);

  const fetchJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/sync/status/${jobId}`);
      if (response.ok) {
        const job = await response.json();
        setActiveJob(job);

        // Show notification when job completes
        if (job.status === 'COMPLETED' && activeJob?.status !== 'COMPLETED') {
          notifications.show({
            title: 'Report generated',
            message: 'Your report has been generated successfully',
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        } else if (job.status === 'FAILED' && activeJob?.status !== 'FAILED') {
          notifications.show({
            title: 'Generation failed',
            message: job.error || 'Report generation failed',
            color: 'red',
            icon: <IconX size={16} />,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch job status:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reportType) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please select a report type',
        color: 'red',
        icon: <IconAlertCircle />,
      });
      return;
    }

    // Check if report type requires AI and we don't have a key
    const selectedReportType = reportTypes.find((rt) => rt.value === reportType);
    if (selectedReportType?.requiresAI && !hasAnthropicKey) {
      notifications.show({
        title: 'Configuration Required',
        message: 'This report type requires an Anthropic API key. Please configure it in Settings.',
        color: 'yellow',
        icon: <IconAlertCircle />,
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType,
          startDate: dateRange[0]?.toISOString(),
          endDate: dateRange[1]?.toISOString(),
          repositories: selectedRepos.length > 0 ? selectedRepos : undefined,
          criteriaIds: selectedCriteria.length > 0 ? selectedCriteria.map(id => parseInt(id)) : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create report generation job');
      }

      const data = await response.json();

      notifications.show({
        title: 'Report generation started',
        message: 'Your report is being generated in the background',
        color: 'blue',
        icon: <IconPlus size={16} />,
      });

      // Fetch the job status and set as active
      await fetchJobStatus(data.jobId);
    } catch (error) {
      console.error('Failed to generate report:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create report generation job',
        color: 'red',
        icon: <IconAlertCircle />,
      });
      setLoading(false);
    }
  };

  const reportTypes = [
    {
      value: 'EVIDENCE',
      label: 'Evidence Report',
      description: 'Detailed list of all evidence with criteria matches',
      requiresAI: false
    },
    {
      value: 'SUMMARY',
      label: 'AI Summary',
      description: 'Concise AI-generated summary of performance',
      requiresAI: true
    },
    {
      value: 'COMPREHENSIVE',
      label: 'Comprehensive Report',
      description: 'Combined evidence report + AI summary',
      requiresAI: true
    },
    {
      value: 'COMPONENT_ANALYSIS',
      label: 'Component Analysis',
      description: 'Contributions by code component/domain',
      requiresAI: true
    },
    {
      value: 'CAPITALIZATION',
      label: 'Capitalization Report',
      description: 'Software cap report with hour estimates',
      requiresAI: true
    },
    {
      value: 'UPWARD',
      label: 'Upward Review',
      description: 'Review for manager',
      requiresAI: true
    },
    {
      value: 'RESUME',
      label: 'Resume Statements',
      description: 'Generate resume statements from evidence with theme support',
      requiresAI: false
    },
    {
      value: 'REVIEW_PACKAGE',
      label: 'Complete Review Package',
      description: 'Full package with all report types combined',
      requiresAI: true
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <IconCheck size={16} />;
      case 'FAILED':
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
      case 'RUNNING':
        return 'blue';
      case 'PENDING':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  const criteriaOptions = (criteria || []).map(c => ({
    value: c.id.toString(),
    label: `${c.subarea} - ${c.description}`,
    group: c.areaOfConcentration,
  }));

  if (loadingData) {
    return (
      <Container size="md" py="xl">
        <Stack align="center" gap="md" py="xl">
          <Loader size="xl" />
          <Text c="dimmed">Loading form data...</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group>
          <Button
            component={Link}
            href="/reports"
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
          >
            Back to Reports
          </Button>
        </Group>

        <div>
          <Title order={1}>Generate New Report</Title>
          <Text c="dimmed" size="sm" mt="sm">
            Create a performance review report from your evidence entries
          </Text>
        </div>

        {/* Main Form or Job Status */}
        {!activeJob ? (
          <form onSubmit={handleSubmit}>
          <Card withBorder p="xl" radius="md">
            <Stack gap="md">
              {/* Report Type */}
              <Select
                label="Report Type"
                placeholder="Select report type"
                description="Choose the type of report to generate"
                data={reportTypes.map(rt => ({
                  value: rt.value,
                  label: rt.label,
                  disabled: rt.requiresAI && !hasAnthropicKey
                }))}
                value={reportType}
                onChange={setReportType}
                required
                searchable
              />

              {reportType && (
                <Alert
                  icon={<IconFileAnalytics size={16} />}
                  title={reportTypes.find((rt) => rt.value === reportType)?.label}
                  color="blue"
                  variant="light"
                >
                  {reportTypes.find((rt) => rt.value === reportType)?.description}
                  {reportTypes.find((rt) => rt.value === reportType)?.requiresAI && !hasAnthropicKey && (
                    <>
                      <br />
                      <Text c="red" size="sm" mt="xs">
                        Requires Anthropic API key (not configured)
                      </Text>
                    </>
                  )}
                </Alert>
              )}

              <Divider label="Filters (Optional)" labelPosition="center" />

              {/* Date Range */}
              <DatePickerInput
                type="range"
                label="Date Range"
                placeholder="Select date range"
                description="Filter evidence by date range (optional)"
                value={dateRange}
                onChange={setDateRange}
                clearable
              />

              {/* Repository Filter */}
              {repositories.length > 0 && (
                <MultiSelect
                  label="Repositories"
                  placeholder="Select repositories"
                  description="Filter by specific repositories (optional)"
                  data={repositories}
                  value={selectedRepos}
                  onChange={setSelectedRepos}
                  searchable
                  clearable
                />
              )}

              {/* Criteria Filter */}
              {criteria.length > 0 && (
                <MultiSelect
                  label="Criteria"
                  placeholder="Select criteria"
                  description="Filter by specific performance criteria (optional)"
                  data={criteriaOptions}
                  value={selectedCriteria}
                  onChange={setSelectedCriteria}
                  searchable
                  clearable
                  maxDropdownHeight={300}
                />
              )}

              {/* Submit Button */}
              <Divider />

              <Button
                fullWidth
                type="submit"
                loading={loading}
                leftSection={<IconPlus size={16} />}
                disabled={!reportType}
              >
                Generate Report
              </Button>
            </Stack>
          </Card>
        </form>
        ) : (
          /* Job Status Display */
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500} size="lg">Report Generation Status</Text>
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
                <Progress
                  value={activeJob.progress}
                  animated={activeJob.status === 'RUNNING'}
                  mt={4}
                />
                <Text size="xs" c="dimmed" mt={4}>
                  {activeJob.progress}%
                </Text>
              </div>

              {activeJob.status === 'COMPLETED' && activeJob.result?.reportId && (
                <Alert icon={<IconCheck size={16} />} title="Success" color="green">
                  Report generated successfully! Redirecting...
                </Alert>
              )}

              <Divider />

              <div>
                <Text size="xs" c="dimmed" mb="xs">
                  Logs
                </Text>
                <Paper withBorder p="xs" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <Code block style={{ fontSize: '0.75rem' }}>
                    {activeJob.logs.map((log, idx) => (
                      <div key={idx}>
                        [{new Date(log.timestamp).toLocaleTimeString()}]{' '}
                        {log.level.toUpperCase()}: {log.message}
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

              {activeJob.status === 'COMPLETED' && activeJob.result?.reportId && (
                <Button
                  component={Link}
                  href={`/reports/${activeJob.result?.reportId}`}
                  fullWidth
                  leftSection={<IconFileAnalytics size={16} />}
                >
                  View Report
                </Button>
              )}

              {(activeJob.status === 'FAILED' || activeJob.status === 'COMPLETED') && (
                <Button
                  variant="light"
                  fullWidth
                  onClick={() => {
                    setActiveJob(null);
                    setLoading(false);
                  }}
                >
                  Generate Another Report
                </Button>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
