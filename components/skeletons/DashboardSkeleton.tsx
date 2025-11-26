'use client';

import { Stack, Group, Card, Skeleton } from '@mantine/core';

export function DashboardSkeleton() {
  return (
    <Stack gap="md">
      <Group grow>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} withBorder>
            <Skeleton height={24} width="50%" mb="sm" />
            <Skeleton height={40} width="30%" />
          </Card>
        ))}
      </Group>
      <Card withBorder>
        <Skeleton height={300} />
      </Card>
    </Stack>
  );
}
