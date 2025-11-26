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
  Grid,
  Badge,
  Divider,
  Textarea,
  Box,
  Tabs,
} from '@mantine/core';
import { IconSend, IconRobot, IconRefresh, IconSparkles, IconCheck, IconEdit } from '@tabler/icons-react';
import { ChatMessage } from '@/components/ChatMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ReviewQuestion {
  id: string;
  question: string;
  response: string;
  status: 'pending' | 'draft' | 'approved';
}

interface ReviewData {
  presenceWay: string | null;
  userContext: string | null;
  githubUsername: string | null;
  criteria: any[];
  evidence: any[];
  evidenceByCriterion: Record<number, any[]>;
  evidenceStats: any;
  goals: any[];
  reviewDocuments: any[];
  reviewAnalyses: any[];
}

const REVIEW_QUESTIONS: ReviewQuestion[] = [
  {
    id: 'accomplishments',
    question: 'Reflecting on your focus and goals for FY25, what were your key accomplishments? Provide specific examples of your impact to your team, department or the organization. Please include your Lattice goals and the extent to which you\'ve achieved them as part of your response.',
    response: '',
    status: 'pending',
  },
  {
    id: 'improvement',
    question: 'What are two areas in which you feel you could improve in to increase your impact at Presence?',
    response: '',
    status: 'pending',
  },
  {
    id: 'goals',
    question: 'Please outline your performance and development goals for FY26. How can your manager support you to achieve these goals?',
    response: '',
    status: 'pending',
  },
];

export default function InteractiveReviewPage() {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<ReviewQuestion[]>(REVIEW_QUESTIONS);
  const [activeQuestion, setActiveQuestion] = useState<string>('accomplishments');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load review data on mount
  useEffect(() => {
    loadReviewData();
  }, []);

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  const loadReviewData = async () => {
    try {
      const response = await fetch('/api/reviews/interactive');
      if (!response.ok) throw new Error('Failed to load review data');
      const result = await response.json();
      setReviewData(result.data);
    } catch (error) {
      console.error('Error loading review data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoadingChat) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoadingChat(true);

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
          agentType: 'review-assistant',
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
      setIsLoadingChat(false);
    }
  };

  const handleGenerateResponse = async (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    const prompt = `Please help me draft a response to this performance review question:\n\n"${question.question}"\n\nPlease review my evidence, goals, and past reviews to craft a thoughtful 3-5 sentence response that follows HR guidelines and aligns with the Presence Way framework.`;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoadingChat(true);

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
          agentType: 'review-assistant',
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

      // Update question with draft response
      setQuestions(prev =>
        prev.map(q =>
          q.id === questionId
            ? { ...q, response: assistantContent, status: 'draft' as const }
            : q
        )
      );
    } catch (error) {
      console.error('Generation error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleUpdateResponse = (questionId: string, newResponse: string) => {
    setQuestions(prev =>
      prev.map(q =>
        q.id === questionId
          ? { ...q, response: newResponse }
          : q
      )
    );
  };

  const handleApproveResponse = (questionId: string) => {
    setQuestions(prev =>
      prev.map(q =>
        q.id === questionId
          ? { ...q, status: 'approved' as const }
          : q
      )
    );
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const activeQuestionData = questions.find(q => q.id === activeQuestion);

  if (loading) {
    return (
      <Container size="xl" py={40}>
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="xl" color="violet" />
          <Text size="lg" c="dimmed">Loading review data...</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py={40}>
      <Stack gap="xl">
        {/* Header */}
        <Stack gap="sm">
          <Group>
            <IconSparkles size={40} color="var(--mantine-color-violet-6)" />
            <Title order={1}>Interactive Performance Review</Title>
          </Group>
          <Text size="lg" c="dimmed">
            AI-assisted annual performance review with your evidence, goals, and company framework
          </Text>
        </Stack>

        {/* Stats Overview */}
        {reviewData && (
          <Grid>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Card shadow="sm" padding="md" radius="md" withBorder>
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Evidence</Text>
                  <Text size="xl" fw={700}>{reviewData.evidenceStats.total}</Text>
                  <Text size="xs" c="dimmed">
                    {reviewData.evidenceStats.byType.PR || 0} PRs, {reviewData.evidenceStats.byType.SLACK || 0} Slack
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Card shadow="sm" padding="md" radius="md" withBorder>
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Criteria</Text>
                  <Text size="xl" fw={700}>{reviewData.criteria.length}</Text>
                  <Text size="xs" c="dimmed">Performance areas</Text>
                </Stack>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Card shadow="sm" padding="md" radius="md" withBorder>
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Goals</Text>
                  <Text size="xl" fw={700}>{reviewData.goals.length}</Text>
                  <Text size="xs" c="dimmed">Active & completed</Text>
                </Stack>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Card shadow="sm" padding="md" radius="md" withBorder>
                <Stack gap="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Reviews</Text>
                  <Text size="xl" fw={700}>{reviewData.reviewDocuments.length}</Text>
                  <Text size="xs" c="dimmed">Past documents</Text>
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        )}

        {/* Main Split Layout */}
        <Grid gutter="xl">
          {/* Left: Review Questions */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{ height: 'calc(100vh - 400px)', minHeight: '600px' }}>
              <Stack gap="md" style={{ height: '100%' }}>
                <Group justify="space-between">
                  <Text size="lg" fw={700}>Review Questions</Text>
                  <Group gap="xs">
                    {questions.map(q => (
                      <Badge
                        key={q.id}
                        color={q.status === 'approved' ? 'green' : q.status === 'draft' ? 'blue' : 'gray'}
                        variant={q.id === activeQuestion ? 'filled' : 'light'}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveQuestion(q.id)}
                      >
                        {q.status === 'approved' && <IconCheck size={12} />}
                        {q.id === 'accomplishments' ? 'Q1' : q.id === 'improvement' ? 'Q2' : 'Q3'}
                      </Badge>
                    ))}
                  </Group>
                </Group>

                <Divider />

                <ScrollArea style={{ flex: 1 }} type="auto">
                  {activeQuestionData && (
                    <Stack gap="lg">
                      {/* Question */}
                      <Paper p="md" radius="md" withBorder style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
                        <Stack gap="xs">
                          <Group>
                            <Badge color="blue" variant="light">Question {activeQuestionData.id === 'accomplishments' ? '1' : activeQuestionData.id === 'improvement' ? '2' : '3'}</Badge>
                            {activeQuestionData.status === 'approved' && (
                              <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
                                Approved
                              </Badge>
                            )}
                          </Group>
                          <Text size="sm" fw={500}>
                            {activeQuestionData.question}
                          </Text>
                        </Stack>
                      </Paper>

                      {/* Guidelines */}
                      <Paper p="md" radius="md" withBorder>
                        <Stack gap="xs">
                          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>HR Guidelines</Text>
                          <Text size="xs" c="dimmed">• Write 3-5 complete sentences</Text>
                          <Text size="xs" c="dimmed">• Include concrete examples and measurable outcomes</Text>
                          <Text size="xs" c="dimmed">• Focus on impact to projects, team, and organization</Text>
                          <Text size="xs" c="dimmed">• Connect achievements to business value</Text>
                        </Stack>
                      </Paper>

                      {/* Response */}
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm" fw={600}>Your Response</Text>
                          {!activeQuestionData.response && (
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconSparkles size={14} />}
                              onClick={() => handleGenerateResponse(activeQuestionData.id)}
                              disabled={isLoadingChat}
                            >
                              Generate with AI
                            </Button>
                          )}
                        </Group>

                        <Textarea
                          value={activeQuestionData.response}
                          onChange={(e) => handleUpdateResponse(activeQuestionData.id, e.target.value)}
                          placeholder="Your response will appear here... Use 'Generate with AI' to get started or type your own."
                          minRows={8}
                          autosize
                          maxRows={15}
                        />

                        {activeQuestionData.response && activeQuestionData.status !== 'approved' && (
                          <Button
                            fullWidth
                            color="green"
                            leftSection={<IconCheck size={16} />}
                            onClick={() => handleApproveResponse(activeQuestionData.id)}
                          >
                            Approve Response
                          </Button>
                        )}

                        {activeQuestionData.status === 'approved' && (
                          <Button
                            fullWidth
                            variant="light"
                            color="blue"
                            leftSection={<IconEdit size={16} />}
                            onClick={() => setQuestions(prev =>
                              prev.map(q =>
                                q.id === activeQuestionData.id
                                  ? { ...q, status: 'draft' as const }
                                  : q
                              )
                            )}
                          >
                            Edit Response
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  )}
                </ScrollArea>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Right: AI Assistant Chat */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{ height: 'calc(100vh - 400px)', minHeight: '600px' }}>
              <Stack gap="md" style={{ height: '100%' }}>
                <Group justify="space-between">
                  <Group gap="xs">
                    <IconRobot size={24} color="var(--mantine-color-violet-6)" />
                    <Text size="lg" fw={700}>Review Assistant</Text>
                  </Group>
                  {messages.length > 0 && (
                    <Button
                      variant="subtle"
                      size="xs"
                      color="gray"
                      leftSection={<IconRefresh size={14} />}
                      onClick={handleClearChat}
                    >
                      Clear
                    </Button>
                  )}
                </Group>

                <Divider />

                <ScrollArea style={{ flex: 1 }} type="auto" ref={scrollAreaRef}>
                  <Stack gap="md" p="xs">
                    {messages.length === 0 ? (
                      <Paper p="xl" radius="md" withBorder style={{ textAlign: 'center' }}>
                        <Stack gap="sm" align="center">
                          <IconRobot size={48} color="var(--mantine-color-gray-5)" />
                          <Text size="lg" fw={500} c="dimmed">
                            I'm here to help!
                          </Text>
                          <Text size="sm" c="dimmed">
                            Ask me to generate responses, refine your answers, or provide insights about your evidence and achievements.
                          </Text>
                          <Stack gap={4} mt="md">
                            <Text size="xs" c="dimmed">Try: "Help me with my accomplishments"</Text>
                            <Text size="xs" c="dimmed">Try: "What are my key strengths?"</Text>
                            <Text size="xs" c="dimmed">Try: "Suggest improvements to my response"</Text>
                          </Stack>
                        </Stack>
                      </Paper>
                    ) : (
                      messages.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                      ))
                    )}

                    {isLoadingChat && (
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

                {/* Chat Input */}
                <form onSubmit={handleChatSubmit}>
                  <Group gap="xs" align="flex-end">
                    <TextInput
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask for help with your review..."
                      size="md"
                      style={{ flex: 1 }}
                      disabled={isLoadingChat}
                    />
                    <ActionIcon
                      type="submit"
                      size="lg"
                      variant="filled"
                      color="violet"
                      disabled={!input.trim() || isLoadingChat}
                      loading={isLoadingChat}
                      aria-label="Send message"
                    >
                      <IconSend size={18} />
                    </ActionIcon>
                  </Group>
                </form>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

        {/* Action Buttons */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {questions.filter(q => q.status === 'approved').length} of {questions.length} questions completed
            </Text>
            <Group>
              <Button variant="outline" color="gray">
                Save Draft
              </Button>
              <Button
                color="green"
                disabled={questions.some(q => q.status !== 'approved')}
              >
                Export Review
              </Button>
            </Group>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
}
