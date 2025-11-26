'use client';

import { Container, Stack, Skeleton, SimpleGrid, Paper, Group, Card, Divider } from '@mantine/core';
import { StatsGridSkeleton } from './StatsGridSkeleton';

export function GoalsPageSkeleton() {
  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Skeleton height={32} width={150} mb={8} />
            <Skeleton height={14} width={250} />
          </div>
          <Skeleton height={36} width={120} radius="sm" />
        </Group>

        {/* Stats Grid */}
        <StatsGridSkeleton cols={4} />

        {/* Goals List - Accordion-style */}
        <Stack gap="md">
          {[1, 2, 3].map((i) => (
            <Paper key={i} withBorder radius="md">
              <Group p="md">
                <Skeleton height={28} width={120} radius="sm" />
                <Skeleton height={14} width={80} />
              </Group>
              <Divider />
              <Stack gap="md" p="md">
                {[1, 2].map((j) => (
                  <Card key={j} withBorder padding="lg" radius="md">
                    <Stack gap="md">
                      <Group justify="space-between">
                        <Group>
                          <Skeleton height={24} width={80} radius="sm" />
                          <Skeleton height={24} width={60} radius="sm" />
                        </Group>
                        <Skeleton height={14} width={100} />
                      </Group>
                      <Skeleton height={20} width="80%" />
                      <Skeleton height={40} />
                      <div>
                        <Group justify="space-between" mb={5}>
                          <Skeleton height={12} width={60} />
                          <Skeleton height={12} width={40} />
                        </Group>
                        <Skeleton height={16} radius="xl" />
                      </div>
                      <Group gap="md">
                        <Skeleton height={12} width={80} />
                        <Skeleton height={12} width={70} />
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
