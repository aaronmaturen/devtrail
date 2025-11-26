'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { notifications } from '@mantine/notifications';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  Progress,
  Loader,
  Center,
  Divider,
  Timeline,
  ActionIcon,
  Menu,
  Tabs,
  Alert,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconDots,
  IconTarget,
  IconTrophy,
  IconClock,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
  IconCheck,
  IconAlertCircle,
  IconChartLine,
  IconSparkles,
} from '@tabler/icons-react';
import { ProgressUpdateForm } from '@/components/ProgressUpdateForm';
import { MilestoneForm } from '@/components/MilestoneForm';
import { MilestoneItem } from '@/components/MilestoneItem';
import { ProgressChart } from '@/components/ProgressChart';
import { JobStatus } from '@/components/JobStatus';

type Goal = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  progressPercent: number;
  targetDate: string;
  startDate: string;
  completedDate: string | null;
  createdAt: string;
  milestones: Milestone[];
  progressEntries: ProgressEntry[];
};

type Milestone = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetDate: string;
  completedDate: string | null;
  createdAt: string;
};

type ProgressEntry = {
  id: string;
  progressPercent: number;
  notes: string | null;
  aiSummary: string | null;
  evidence: string | null;
  createdAt: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  DEVELOPMENT: 'blue',
  LEADERSHIP: 'violet',
  TECHNICAL: 'cyan',
  COMMUNICATION: 'green',
  DELIVERY: 'orange',
  INFLUENCE: 'grape',
  BUSINESS: 'pink',
};

const STATUS_CONFIG = {
  ACTIVE: { color: 'blue', icon: IconTarget, label: 'Active' },
  COMPLETED: { color: 'green', icon: IconTrophy, label: 'Completed' },
  PAUSED: { color: 'yellow', icon: IconPlayerPause, label: 'Paused' },
  CANCELLED: { color: 'red', icon: IconX, label: 'Cancelled' },
};

const MILESTONE_STATUS_CONFIG = {
  PENDING: { color: 'gray', icon: IconClock, label: 'Pending' },
  IN_PROGRESS: { color: 'blue', icon: IconClock, label: 'In Progress' },
  COMPLETED: { color: 'green', icon: IconCheck, label: 'Completed' },
  BLOCKED: { color: 'red', icon: IconAlertCircle, label: 'Blocked' },
};

export default function GoalDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState(false);
  const [progressJobId, setProgressJobId] = useState<string | null>(null);

  const fetchGoal = async () => {
    try {
      const response = await fetch(`/api/goals/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setGoal(data);
      } else {
        console.error('Goal not found');
      }
    } catch (error) {
      console.error('Failed to fetch goal:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoal();
  }, [params.id]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this goal?')) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/goals/${params.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/goals');
      } else {
        alert('Failed to delete goal');
      }
    } catch (error) {
      console.error('Failed to delete goal:', error);
      alert('Failed to delete goal');
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const updateData: { status: string; completedDate?: string | null } = {
        status: newStatus,
      };

      // Set completedDate when marking as completed
      if (newStatus === 'COMPLETED') {
        updateData.completedDate = new Date().toISOString();
      }

      // Clear completedDate when reactivating
      if (goal?.status === 'COMPLETED' && newStatus !== 'COMPLETED') {
        updateData.completedDate = null;
      }

      const response = await fetch(`/api/goals/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const updatedGoal = await response.json();
        setGoal(updatedGoal);

        const statusLabels: Record<string, string> = {
          ACTIVE: 'active',
          COMPLETED: 'completed',
          PAUSED: 'paused',
          CANCELLED: 'cancelled',
        };

        notifications.show({
          title: 'Goal Updated',
          message: `Goal marked as ${statusLabels[newStatus]}`,
          color: newStatus === 'COMPLETED' ? 'green' : 'blue',
        });
      } else {
        throw new Error('Failed to update goal status');
      }
    } catch (error) {
      console.error('Failed to update goal status:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update goal status',
        color: 'red',
      });
    }
  };

  const handleTrackProgress = async () => {
    setTrackingProgress(true);
    try {
      const response = await fetch(`/api/goals/${params.id}/track-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setProgressJobId(data.jobId);
        notifications.show({
          title: 'Progress Tracking Started',
          message: 'AI is analyzing your evidence and matching it to this goal',
          color: 'blue',
        });
      } else {
        throw new Error('Failed to start progress tracking');
      }
    } catch (error) {
      console.error('Failed to track progress:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to start progress tracking',
        color: 'red',
      });
      setTrackingProgress(false);
    }
  };

  const handleProgressJobComplete = () => {
    setProgressJobId(null);
    setTrackingProgress(false);
    fetchGoal(); // Refresh goal data
    notifications.show({
      title: 'Progress Updated',
      message: 'Goal progress has been updated with matched evidence',
      color: 'green',
    });
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

  if (!goal) {
    return (
      <Container size="xl" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} title="Not Found" color="red">
          Goal not found.
        </Alert>
        <Button component={Link} href="/goals" mt="md" leftSection={<IconArrowLeft size={18} />}>
          Back to Goals
        </Button>
      </Container>
    );
  }

  const statusConfig = STATUS_CONFIG[goal.status as keyof typeof STATUS_CONFIG];
  const StatusIcon = statusConfig.icon;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <Button
            component={Link}
            href="/goals"
            variant="subtle"
            leftSection={<IconArrowLeft size={18} />}
          >
            Back to Goals
          </Button>

          <Group>
            <Button
              component={Link}
              href={`/goals/${goal.id}/edit`}
              leftSection={<IconEdit size={18} />}
              variant="light"
            >
              Edit
            </Button>

            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="light" size="lg" aria-label="Goal options menu">
                  <IconDots size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {goal.status !== 'COMPLETED' && (
                  <Menu.Item
                    color="green"
                    leftSection={<IconCheck size={16} />}
                    onClick={() => handleStatusChange('COMPLETED')}
                  >
                    Mark as Complete
                  </Menu.Item>
                )}
                {goal.status === 'COMPLETED' && (
                  <Menu.Item
                    color="blue"
                    leftSection={<IconTarget size={16} />}
                    onClick={() => handleStatusChange('ACTIVE')}
                  >
                    Reactivate Goal
                  </Menu.Item>
                )}
                {goal.status === 'ACTIVE' && (
                  <Menu.Item
                    color="yellow"
                    leftSection={<IconPlayerPause size={16} />}
                    onClick={() => handleStatusChange('PAUSED')}
                  >
                    Pause Goal
                  </Menu.Item>
                )}
                {goal.status === 'PAUSED' && (
                  <Menu.Item
                    color="blue"
                    leftSection={<IconPlayerPlay size={16} />}
                    onClick={() => handleStatusChange('ACTIVE')}
                  >
                    Resume Goal
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  Delete Goal
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {/* Goal Info Card */}
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            {/* Badges */}
            <Group>
              <Badge
                color={statusConfig.color}
                variant="light"
                size="lg"
                leftSection={<StatusIcon size={14} />}
              >
                {statusConfig.label}
              </Badge>
              <Badge color={CATEGORY_COLORS[goal.category] || 'gray'} variant="outline">
                {goal.category}
              </Badge>
              <Badge color="gray" variant="outline">
                {goal.priority} Priority
              </Badge>
            </Group>

            {/* Title */}
            <Title order={2}>{goal.title}</Title>

            {/* Description */}
            <Text size="md" c="dimmed">
              {goal.description}
            </Text>

            {/* Progress */}
            <div>
              <Group justify="space-between" mb={5}>
                <Text size="sm" fw={600}>
                  Overall Progress
                </Text>
                <Text size="sm" fw={700}>
                  {goal.progressPercent}%
                </Text>
              </Group>
              <Progress
                value={goal.progressPercent}
                size="xl"
                radius="xl"
                color={
                  goal.progressPercent === 100
                    ? 'green'
                    : goal.progressPercent >= 70
                    ? 'blue'
                    : goal.progressPercent >= 40
                    ? 'yellow'
                    : 'red'
                }
              />
            </div>

            <Divider />

            {/* Dates */}
            <Group grow>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Start Date
                </Text>
                <Text size="sm">{format(new Date(goal.startDate), 'MMM d, yyyy')}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Target Date
                </Text>
                <Text size="sm">{format(new Date(goal.targetDate), 'MMM d, yyyy')}</Text>
              </div>
              {goal.completedDate && (
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Completed Date
                  </Text>
                  <Text size="sm">{format(new Date(goal.completedDate), 'MMM d, yyyy')}</Text>
                </div>
              )}
            </Group>
          </Stack>
        </Card>

        {/* Tabs for SMART criteria, Milestones, Progress, and Chart */}
        <Tabs defaultValue="smart">
          <Tabs.List>
            <Tabs.Tab value="smart">SMART Criteria</Tabs.Tab>
            <Tabs.Tab value="milestones">
              Milestones ({goal.milestones.length})
            </Tabs.Tab>
            <Tabs.Tab value="progress">
              Progress Updates ({goal.progressEntries.length})
            </Tabs.Tab>
            <Tabs.Tab value="chart" leftSection={<IconChartLine size={16} />}>
              Progress Chart
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="smart" pt="lg">
            <Stack gap="md">
              {goal.specific && (
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
                    Specific
                  </Text>
                  <Text size="sm">{goal.specific}</Text>
                </Card>
              )}
              {goal.measurable && (
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
                    Measurable
                  </Text>
                  <Text size="sm">{goal.measurable}</Text>
                </Card>
              )}
              {goal.achievable && (
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
                    Achievable
                  </Text>
                  <Text size="sm">{goal.achievable}</Text>
                </Card>
              )}
              {goal.relevant && (
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
                    Relevant
                  </Text>
                  <Text size="sm">{goal.relevant}</Text>
                </Card>
              )}
              {goal.timeBound && (
                <Card withBorder padding="md" radius="md">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="xs">
                    Time-Bound
                  </Text>
                  <Text size="sm">{goal.timeBound}</Text>
                </Card>
              )}
              {!goal.specific && !goal.measurable && !goal.achievable && !goal.relevant && !goal.timeBound && (
                <Card withBorder padding="xl" radius="md">
                  <Text c="dimmed" ta="center">
                    No SMART criteria details available
                  </Text>
                </Card>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="milestones" pt="lg">
            <Stack gap="md">
              <Group justify="flex-end">
                <MilestoneForm goalId={goal.id} onSuccess={fetchGoal} />
              </Group>
              {goal.milestones.length === 0 ? (
                <Card withBorder padding="xl" radius="md">
                  <Text c="dimmed" ta="center">
                    No milestones defined for this goal. Add milestones to track incremental progress.
                  </Text>
                </Card>
              ) : (
                <Stack gap="sm">
                  {goal.milestones.map((milestone) => (
                    <MilestoneItem
                      key={milestone.id}
                      milestone={milestone}
                      goalId={goal.id}
                      onUpdate={fetchGoal}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="progress" pt="lg">
            <Stack gap="md">
              {progressJobId ? (
                <JobStatus
                  jobId={progressJobId}
                  onComplete={handleProgressJobComplete}
                  onError={() => {
                    setTrackingProgress(false);
                    setProgressJobId(null);
                  }}
                />
              ) : (
                <Group justify="flex-end">
                  <Button
                    variant="light"
                    leftSection={<IconSparkles size={18} />}
                    onClick={handleTrackProgress}
                    loading={trackingProgress}
                  >
                    Auto-Match Evidence
                  </Button>
                  <ProgressUpdateForm
                    goalId={goal.id}
                    currentProgress={goal.progressPercent}
                    onSuccess={fetchGoal}
                  />
                </Group>
              )}
              {goal.progressEntries.length === 0 ? (
                <Card withBorder padding="xl" radius="md">
                  <Text c="dimmed" ta="center">
                    No progress updates yet. Add your first update to start tracking your progress.
                  </Text>
                </Card>
              ) : (
                <Timeline active={goal.progressEntries.length} bulletSize={24} lineWidth={2}>
                  {goal.progressEntries.map((entry) => (
                    <Timeline.Item
                      key={entry.id}
                      title={
                        <Group>
                          <Text fw={600}>Progress Update</Text>
                          <Badge color="blue" size="sm" variant="light">
                            {entry.progressPercent}%
                          </Badge>
                        </Group>
                      }
                    >
                      {entry.notes && (
                        <Text size="sm" mt="xs">
                          {entry.notes}
                        </Text>
                      )}
                      {entry.aiSummary && (
                        <Card withBorder padding="sm" radius="sm" mt="xs" bg="gray.0">
                          <Text size="xs" c="dimmed" mb="xs">
                            AI Analysis:
                          </Text>
                          <Text size="sm">{entry.aiSummary}</Text>
                        </Card>
                      )}
                      <Text size="xs" c="dimmed" mt="xs">
                        {format(new Date(entry.createdAt), 'MMM d, yyyy h:mm a')}
                      </Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="chart" pt="lg">
            <ProgressChart
              progressEntries={goal.progressEntries}
              startDate={goal.startDate}
              targetDate={goal.targetDate}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
