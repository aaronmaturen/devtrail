'use client';

import { Stack } from '@mantine/core';
import { CardSkeleton } from './CardSkeleton';

export function EvidenceListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Stack gap="sm">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </Stack>
  );
}
