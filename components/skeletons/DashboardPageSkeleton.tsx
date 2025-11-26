'use client';

import { Container, Group, Skeleton, Card, Paper, Stack, Tabs } from '@mantine/core';

export function DashboardPageSkeleton() {
  return (
    <Container size="xl" py="xl">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <div>
          <Skeleton height={32} width={400} mb={8} />
          <Skeleton height={14} width={500} />
        </div>
        <Group>
          <Skeleton height={36} width={100} radius="sm" />
          <Skeleton height={36} width={120} radius="sm" />
        </Group>
      </Group>

      {/* Summary Cards - 5 columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} withBorder padding="lg">
            <Group>
              <Skeleton height={32} width={32} circle />
              <div>
                <Skeleton height={12} width={100} mb={4} />
                <Skeleton height={24} width={50} />
              </div>
            </Group>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Skeleton height={36} width={100} mr="xs" />
          <Skeleton height={36} width={120} mr="xs" />
          <Skeleton height={36} width={140} mr="xs" />
          <Skeleton height={36} width={100} mr="xs" />
          <Skeleton height={36} width={160} />
        </Tabs.List>

        {/* Chart Skeleton */}
        <Stack gap="xl" pt="xl">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
              gap: '2rem',
            }}
          >
            <Paper withBorder p="md">
              <Skeleton height={20} width="40%" mb="xs" />
              <Skeleton height={14} width="60%" mb="md" />
              <Skeleton height={320} />
            </Paper>
            <Paper withBorder p="md">
              <Skeleton height={20} width="40%" mb="xs" />
              <Skeleton height={14} width="60%" mb="md" />
              <Skeleton height={320} />
            </Paper>
          </div>
        </Stack>
      </Tabs>
    </Container>
  );
}
