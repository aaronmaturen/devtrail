'use client';

import { SimpleGrid, Paper, Group, Skeleton } from '@mantine/core';

export function StatsGridSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: cols }} spacing="lg">
      {Array.from({ length: cols }).map((_, i) => (
        <Paper key={i} withBorder p="md" radius="md">
          <Group>
            <Skeleton height={32} width={32} circle />
            <div style={{ flex: 1 }}>
              <Skeleton height={12} width="60%" mb={4} />
              <Skeleton height={24} width="40%" />
            </div>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
