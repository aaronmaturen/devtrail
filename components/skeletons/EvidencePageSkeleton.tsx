'use client';

import { Container, Stack, Group, Skeleton } from '@mantine/core';
import { StatsGridSkeleton } from './StatsGridSkeleton';
import { EvidenceListSkeleton } from './EvidenceListSkeleton';

export function EvidencePageSkeleton() {
  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Skeleton height={32} width={150} mb={8} />
            <Skeleton height={14} width={200} />
          </div>
          <Skeleton height={36} width={140} radius="sm" />
        </Group>

        {/* Stats Grid */}
        <StatsGridSkeleton cols={5} />

        {/* Evidence List */}
        <EvidenceListSkeleton count={5} />
      </Stack>
    </Container>
  );
}
