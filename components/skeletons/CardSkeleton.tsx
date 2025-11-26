'use client';

import { Card, Skeleton, Group, Stack } from '@mantine/core';

export function CardSkeleton() {
  return (
    <Card withBorder>
      <Stack gap="sm">
        <Skeleton height={20} width="70%" />
        <Skeleton height={14} width="40%" />
        <Skeleton height={60} />
        <Group>
          <Skeleton height={24} width={80} radius="xl" />
          <Skeleton height={24} width={60} radius="xl" />
        </Group>
      </Stack>
    </Card>
  );
}
