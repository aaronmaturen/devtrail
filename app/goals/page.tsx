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
  Progress,
  Loader,
  Center,
  Paper,
  Accordion,
} from '@mantine/core';
import {
  IconPlus,
  IconTarget,
  IconTrophy,
  IconClock,
  IconPlayerPause,
  IconX,
} from '@tabler/icons-react';

type Goal = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  progressPercent: number;
  targetDate: string;
  completedDate: string | null;
  createdAt: string;
  _count?: {
    milestones: number;
    progressEntries: number;
  };
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

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'red',
  MEDIUM: 'yellow',
  LOW: 'gray',
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGoals() {
      try {
        const response = await fetch('/api/goals');
        const data = await response.json();
        setGoals(data.goals || []);
      } catch (error) {
        console.error('Failed to fetch goals:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchGoals();
  }, []);

  // Group goals by category
  const goalsByCategory = goals.reduce((acc, goal) => {
    if (!acc[goal.category]) {
      acc[goal.category] = [];
    }
    acc[goal.category].push(goal);
    return acc;
  }, {} as Record<string, Goal[]>);

  // Calculate stats
  const stats = {
    total: goals.length,
    active: goals.filter((g) => g.status === 'ACTIVE').length,
    completed: goals.filter((g) => g.status === 'COMPLETED').length,
    avgProgress:
      goals.length > 0
        ? Math.round(
            goals.reduce((sum, g) => sum + g.progressPercent, 0) / goals.length
          )
        : 0,
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
            <Title order={1}>Goals</Title>
            <Text c="dimmed" size="sm">
              SMART career goals tracking
            </Text>
          </div>
          <Button
            component={Link}
            href="/goals/new"
            leftSection={<IconPlus size={18} />}
          >
            New Goal
          </Button>
        </Group>

        {/* Stats Grid */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
          <Paper withBorder p="md" radius="md">
            <Group>
              <IconTarget size={32} color="var(--mantine-color-blue-6)" />
              <div style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total Goals
                </Text>
                <Text size="xl" fw={700}>
                  {stats.total}
                </Text>
              </div>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group>
              <IconClock size={32} color="var(--mantine-color-blue-6)" />
              <div style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Active
                </Text>
                <Text size="xl" fw={700}>
                  {stats.active}
                </Text>
              </div>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group>
              <IconTrophy size={32} color="var(--mantine-color-green-6)" />
              <div style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Completed
                </Text>
                <Text size="xl" fw={700}>
                  {stats.completed}
                </Text>
              </div>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group>
              <IconTarget size={32} color="var(--mantine-color-violet-6)" />
              <div style={{ flex: 1 }}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Avg Progress
                </Text>
                <Text size="xl" fw={700}>
                  {stats.avgProgress}%
                </Text>
              </div>
            </Group>
          </Paper>
        </SimpleGrid>

        {/* Goals List */}
        {goals.length === 0 ? (
          <Card withBorder p="xl" radius="md">
            <Stack align="center" gap="sm">
              <Text c="dimmed">
                No goals found. Create your first SMART goal to get started.
              </Text>
              <Button
                component={Link}
                href="/goals/new"
                leftSection={<IconPlus size={18} />}
                variant="light"
              >
                Create your first goal
              </Button>
            </Stack>
          </Card>
        ) : (
          <Accordion variant="separated">
            {Object.entries(goalsByCategory).map(([category, categoryGoals]) => (
              <Accordion.Item key={category} value={category}>
                <Accordion.Control>
                  <Group>
                    <Badge
                      color={CATEGORY_COLORS[category] || 'gray'}
                      variant="light"
                      size="lg"
                    >
                      {category}
                    </Badge>
                    <Text size="sm" c="dimmed">
                      {categoryGoals.length} goal
                      {categoryGoals.length !== 1 ? 's' : ''}
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    {categoryGoals.map((goal) => {
                      const statusConfig =
                        STATUS_CONFIG[goal.status as keyof typeof STATUS_CONFIG];
                      const StatusIcon = statusConfig.icon;

                      return (
                        <Card
                          key={goal.id}
                          component={Link}
                          href={`/goals/${goal.id}`}
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
                          <Stack gap="md">
                            {/* Header */}
                            <Group justify="space-between">
                              <Group>
                                <Badge
                                  color={statusConfig.color}
                                  variant="light"
                                  leftSection={<StatusIcon size={14} />}
                                >
                                  {statusConfig.label}
                                </Badge>
                                <Badge
                                  color={
                                    PRIORITY_COLORS[goal.priority] || 'gray'
                                  }
                                  variant="outline"
                                  size="sm"
                                >
                                  {goal.priority}
                                </Badge>
                              </Group>
                              <Text size="sm" c="dimmed">
                                Due: {format(new Date(goal.targetDate), 'MMM d, yyyy')}
                              </Text>
                            </Group>

                            {/* Title */}
                            <Text fw={600} size="lg">
                              {goal.title}
                            </Text>

                            {/* Description */}
                            <Text size="sm" c="dimmed" lineClamp={2}>
                              {goal.description}
                            </Text>

                            {/* Progress */}
                            <div>
                              <Group justify="space-between" mb={5}>
                                <Text size="xs" c="dimmed">
                                  Progress
                                </Text>
                                <Text size="xs" fw={700}>
                                  {goal.progressPercent}%
                                </Text>
                              </Group>
                              <Progress
                                value={goal.progressPercent}
                                size="lg"
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

                            {/* Meta Info */}
                            {goal._count && (
                              <Group gap="md">
                                {goal._count.milestones > 0 && (
                                  <Text size="xs" c="dimmed">
                                    {goal._count.milestones} milestone
                                    {goal._count.milestones !== 1 ? 's' : ''}
                                  </Text>
                                )}
                                {goal._count.progressEntries > 0 && (
                                  <Text size="xs" c="dimmed">
                                    {goal._count.progressEntries} update
                                    {goal._count.progressEntries !== 1 ? 's' : ''}
                                  </Text>
                                )}
                              </Group>
                            )}
                          </Stack>
                        </Card>
                      );
                    })}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Stack>
    </Container>
  );
}
