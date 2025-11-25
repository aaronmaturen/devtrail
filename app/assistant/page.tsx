'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Container,
  Stack,
  Card,
  TextInput,
  Button,
  Select,
  ScrollArea,
  Title,
  Text,
  Group,
  Loader,
  Paper,
  ActionIcon,
} from '@mantine/core';
import { IconSend, IconRobot, IconRefresh } from '@tabler/icons-react';
import { ChatMessage } from '@/components/ChatMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const agentOptions = [
  {
    value: 'performance-analyst',
    label: 'Performance Analyst',
    description: 'Analyze PRs, evidence, and performance trends',
  },
  {
    value: 'goal-generator',
    label: 'Goal Generator',
    description: 'Create SMART goals and track progress',
  },
  {
    value: 'evidence-reviewer',
    label: 'Evidence Reviewer',
    description: 'Review and enhance evidence documentation',
  },
];

export default function AssistantPage() {
  const [agentType, setAgentType] = useState<string>('performance-analyst');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          agentType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantContent += chunk;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const selectedAgent = agentOptions.find((opt) => opt.value === agentType);

  return (
    <Container size="lg" py={40}>
      <Stack gap="xl">
        {/* Header */}
        <Stack gap="sm" align="center">
          <Group>
            <IconRobot size={40} color="var(--mantine-color-violet-6)" />
            <Title order={1}>AI Assistant</Title>
          </Group>
          <Text size="lg" c="dimmed" ta="center">
            Chat with specialized AI agents to analyze performance, generate goals, and review evidence
          </Text>
        </Stack>

        {/* Agent Selector */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4} style={{ flex: 1 }}>
                <Text size="sm" fw={500}>
                  Select AI Agent
                </Text>
                <Text size="xs" c="dimmed">
                  {selectedAgent?.description}
                </Text>
              </Stack>
              {messages.length > 0 && (
                <Button
                  variant="subtle"
                  size="xs"
                  color="gray"
                  leftSection={<IconRefresh size={14} />}
                  onClick={handleClearChat}
                >
                  Clear Chat
                </Button>
              )}
            </Group>

            <Select
              value={agentType}
              onChange={(value) => value && setAgentType(value)}
              data={agentOptions.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
              size="md"
              disabled={isLoading}
            />
          </Stack>
        </Card>

        {/* Chat Messages */}
        <Card shadow="sm" padding="lg" radius="md" withBorder style={{ minHeight: '500px' }}>
          <Stack gap="md" style={{ height: '500px' }}>
            <ScrollArea style={{ flex: 1 }} type="auto" ref={scrollAreaRef}>
              <Stack gap="md" p="xs">
                {messages.length === 0 ? (
                  <Paper p="xl" radius="md" withBorder style={{ textAlign: 'center' }}>
                    <Stack gap="sm" align="center">
                      <IconRobot size={48} color="var(--mantine-color-gray-5)" />
                      <Text size="lg" fw={500} c="dimmed">
                        Start a conversation
                      </Text>
                      <Text size="sm" c="dimmed">
                        Ask me anything about your performance evidence, goals, or need help reviewing your work
                      </Text>
                    </Stack>
                  </Paper>
                ) : (
                  messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                )}

                {isLoading && (
                  <Card
                    shadow="sm"
                    padding="md"
                    radius="md"
                    withBorder
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: 'var(--mantine-color-gray-0)',
                    }}
                  >
                    <Group gap="xs">
                      <Loader size="sm" color="violet" />
                      <Text size="sm" c="dimmed">
                        AI is thinking...
                      </Text>
                    </Group>
                  </Card>
                )}
              </Stack>
            </ScrollArea>

            {/* Input Form */}
            <form onSubmit={handleSubmit}>
              <Group gap="xs" align="flex-end">
                <TextInput
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  size="md"
                  style={{ flex: 1 }}
                  disabled={isLoading}
                  autoFocus
                />
                <ActionIcon
                  type="submit"
                  size="lg"
                  variant="filled"
                  color="violet"
                  disabled={!input.trim() || isLoading}
                  loading={isLoading}
                >
                  <IconSend size={18} />
                </ActionIcon>
              </Group>
            </form>
          </Stack>
        </Card>

        {/* Helpful Tips */}
        <Card shadow="sm" padding="md" radius="md" withBorder style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Helpful Tips:
            </Text>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                • Ask "Show me my recent evidence" to see your latest contributions
              </Text>
              <Text size="xs" c="dimmed">
                • Request "Generate goals based on my performance" for personalized SMART goals
              </Text>
              <Text size="xs" c="dimmed">
                • Say "Review my evidence for gaps" to identify missing documentation
              </Text>
              <Text size="xs" c="dimmed">
                • Try "What are my strengths?" to get insights from your evidence
              </Text>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
