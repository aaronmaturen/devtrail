'use client';

import { Container, Stack, Skeleton, Card } from '@mantine/core';
import { CardSkeleton } from './CardSkeleton';

export function ReviewsPageSkeleton() {
  return (
    <Container size="xl" py="xl" style={{ minHeight: '100vh' }}>
      <Stack gap="lg">
        {/* Header */}
        <Stack gap="xs">
          <Skeleton height={32} width={250} />
          <Skeleton height={14} width={600} />
        </Stack>

        {/* Add New Button */}
        <Skeleton height={36} width={200} radius="sm" />

        {/* Analyses List */}
        <Stack gap="md">
          <Skeleton height={28} width={150} />
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
