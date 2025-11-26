'use client';

import { useMemo } from 'react';
import { Text, Box, Group, Button, Paper } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { computeDiff, DiffSegment, getNewText } from '@/lib/utils/diff';

type DiffViewProps = {
  oldText: string;
  newText: string;
  onAccept?: () => void;
  onRevert?: () => void;
  showActions?: boolean;
};

export function DiffView({
  oldText,
  newText,
  onAccept,
  onRevert,
  showActions = true,
}: DiffViewProps) {
  const diff = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);

  return (
    <Box>
      <Paper p="md" radius="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
        <Text component="div" size="sm" style={{ lineHeight: 1.7 }}>
          {diff.map((segment, i) => (
            <DiffSegmentView key={i} segment={segment} />
          ))}
        </Text>
      </Paper>

      {showActions && (
        <Group justify="flex-end" mt="sm" gap="xs">
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconX size={14} />}
            onClick={onRevert}
          >
            Revert
          </Button>
          <Button
            size="xs"
            variant="filled"
            color="green"
            leftSection={<IconCheck size={14} />}
            onClick={onAccept}
          >
            Accept Changes
          </Button>
        </Group>
      )}
    </Box>
  );
}

function DiffSegmentView({ segment }: { segment: DiffSegment }) {
  if (segment.type === 'unchanged') {
    return <span>{segment.text}</span>;
  }

  if (segment.type === 'removed') {
    return (
      <span
        style={{
          textDecoration: 'line-through',
          backgroundColor: 'var(--mantine-color-red-1)',
          color: 'var(--mantine-color-red-7)',
          padding: '0 2px',
          borderRadius: '2px',
        }}
      >
        {segment.text}
      </span>
    );
  }

  if (segment.type === 'added') {
    return (
      <span
        style={{
          backgroundColor: 'var(--mantine-color-green-1)',
          color: 'var(--mantine-color-green-8)',
          padding: '0 2px',
          borderRadius: '2px',
        }}
      >
        {segment.text}
      </span>
    );
  }

  return null;
}

/**
 * Inline diff that can be used within markdown content
 */
export function InlineDiff({
  oldText,
  newText,
}: {
  oldText: string;
  newText: string;
}) {
  const diff = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);

  return (
    <>
      {diff.map((segment, i) => (
        <DiffSegmentView key={i} segment={segment} />
      ))}
    </>
  );
}
