'use client';

import { Skeleton } from '@mantine/core';

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}>
          <Skeleton height={20} />
        </td>
      ))}
    </tr>
  );
}
