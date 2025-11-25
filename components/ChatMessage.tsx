'use client';

import { Card, Text, Group, Stack, Box } from '@mantine/core';
import { IconUser, IconRobot } from '@tabler/icons-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <Card
      shadow="sm"
      padding="md"
      radius="md"
      withBorder
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        backgroundColor: isUser ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-gray-0)',
      }}
    >
      <Stack gap="sm">
        {/* Message Header */}
        <Group justify="space-between">
          <Group gap="xs">
            {isUser ? (
              <IconUser size={18} color="var(--mantine-color-blue-6)" />
            ) : (
              <IconRobot size={18} color="var(--mantine-color-violet-6)" />
            )}
            <Text size="sm" fw={500}>
              {isUser ? 'You' : 'AI Assistant'}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {format(message.timestamp, 'h:mm a')}
          </Text>
        </Group>

        {/* Message Content */}
        <Box>
          <Text
            size="sm"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message.content}
          </Text>
        </Box>
      </Stack>
    </Card>
  );
}
