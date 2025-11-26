'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  Loader,
  Center,
  Menu,
  ActionIcon,
  Divider,
  Textarea,
  Modal,
  Select,
  Drawer,
  ScrollArea,
  Tooltip,
  Paper,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconTrash,
  IconGripVertical,
  IconSparkles,
  IconMessage,
  IconChevronLeft,
  IconDotsVertical,
  IconHistory,
  IconEdit,
  IconHeading,
  IconMinus,
  IconMessageQuestion,
  IconCopy,
  IconCheck,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { MarkdownEditor, InlineMarkdownEditor } from '@/components/MarkdownEditor';

type ReportBlock = {
  id: string;
  type: string;
  prompt: string;
  content: string;
  position: number;
  metadata: Record<string, any>;
  revisions: any[];
};

type ReportDocument = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  contextConfig: Record<string, any>;
  blocks: ReportBlock[];
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function ReportEditorPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;

  const [document, setDocument] = useState<ReportDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  // Block creation modal
  const [createBlockOpened, { open: openCreateBlock, close: closeCreateBlock }] =
    useDisclosure(false);
  const [newBlockType, setNewBlockType] = useState<string>('PROMPT_RESPONSE');
  const [newBlockPosition, setNewBlockPosition] = useState<number>(0);

  // Chat drawer
  const [chatOpened, { open: openChat, close: closeChat }] = useDisclosure(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // History drawer
  const [historyOpened, { open: openHistory, close: closeHistory }] = useDisclosure(false);
  const [historyBlockId, setHistoryBlockId] = useState<string | null>(null);
  const [blockHistory, setBlockHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Finalize modal
  const [finalizeOpened, { open: openFinalize, close: closeFinalize }] = useDisclosure(false);
  const [finalizeYear, setFinalizeYear] = useState<string>(new Date().getFullYear().toString());
  const [finalizeReviewType, setFinalizeReviewType] = useState<string>('SELF');
  const [finalizing, setFinalizing] = useState(false);

  // Local block state for editing (keyed by blockId)
  const [blockEdits, setBlockEdits] = useState<Record<string, { prompt?: string; content?: string }>>({});

  // Track which block was just copied (for visual feedback)
  const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    try {
      const response = await fetch(`/api/report-builder/${documentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }
      const data = await response.json();
      setDocument(data);
    } catch (error) {
      console.error('Failed to fetch document:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load report',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  const handleCreateBlock = async () => {
    try {
      const response = await fetch(`/api/report-builder/${documentId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newBlockType,
          position: newBlockPosition,
          prompt: '',
          content: '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create block');
      }

      notifications.show({
        title: 'Success',
        message: 'Block created',
        color: 'green',
      });

      closeCreateBlock();
      fetchDocument();
    } catch (error) {
      console.error('Failed to create block:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create block',
        color: 'red',
      });
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!confirm('Delete this block?')) return;

    try {
      const response = await fetch(
        `/api/report-builder/${documentId}/blocks/${blockId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete block');
      }

      notifications.show({
        title: 'Success',
        message: 'Block deleted',
        color: 'green',
      });

      fetchDocument();
    } catch (error) {
      console.error('Failed to delete block:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete block',
        color: 'red',
      });
    }
  };

  const handleSaveBlock = useCallback(async (blockId: string, updates: { prompt?: string; content?: string }) => {
    try {
      const response = await fetch(
        `/api/report-builder/${documentId}/blocks/${blockId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save block');
      }

      // Clear local edits for this block
      setBlockEdits((prev) => {
        const newEdits = { ...prev };
        delete newEdits[blockId];
        return newEdits;
      });

      fetchDocument();
    } catch (error) {
      console.error('Failed to save block:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save block',
        color: 'red',
      });
    }
  }, [documentId, fetchDocument]);

  const updateLocalBlock = useCallback((blockId: string, field: 'prompt' | 'content', value: string) => {
    setBlockEdits((prev) => ({
      ...prev,
      [blockId]: {
        ...prev[blockId],
        [field]: value,
      },
    }));
  }, []);

  const handleGenerateResponse = async (blockId: string) => {
    setGenerating(blockId);
    try {
      const response = await fetch(
        `/api/report-builder/${documentId}/blocks/${blockId}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate content');
      }

      notifications.show({
        title: 'Success',
        message: 'Response generated',
        color: 'green',
        icon: <IconSparkles size={18} />,
      });

      fetchDocument();
    } catch (error) {
      console.error('Failed to generate:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to generate content',
        color: 'red',
      });
    } finally {
      setGenerating(null);
    }
  };

  const handleOpenChat = (blockId: string) => {
    setActiveBlockId(blockId);
    setChatMessages([]);
    openChat();
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeBlockId) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const response = await fetch(
        `/api/report-builder/${documentId}/blocks/${activeBlockId}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            chatHistory: chatMessages,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response },
      ]);

      if (data.blockUpdated) {
        notifications.show({
          title: 'Block Updated',
          message: 'Response has been refined and saved',
          color: 'green',
        });
        fetchDocument();
      }
    } catch (error) {
      console.error('Chat error:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to send message',
        color: 'red',
      });
    } finally {
      setChatLoading(false);
    }
  };

  const handleOpenHistory = async (blockId: string) => {
    setHistoryBlockId(blockId);
    setHistoryLoading(true);
    openHistory();

    try {
      const response = await fetch(
        `/api/report-builder/${documentId}/blocks/${blockId}/history`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }
      const data = await response.json();
      setBlockHistory(data.revisions || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRestoreRevision = async (revisionId: string) => {
    if (!historyBlockId) return;

    try {
      const response = await fetch(
        `/api/report-builder/${documentId}/blocks/${historyBlockId}/history`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to restore');
      }

      notifications.show({
        title: 'Success',
        message: 'Revision restored',
        color: 'green',
      });

      closeHistory();
      fetchDocument();
    } catch (error) {
      console.error('Failed to restore:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to restore revision',
        color: 'red',
      });
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const response = await fetch(`/api/report-builder/${documentId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: finalizeYear,
          reviewType: finalizeReviewType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to finalize report');
      }

      const data = await response.json();

      notifications.show({
        title: 'Report Published',
        message: `Your review has been saved and analyzed. Found ${data.reviewAnalysis.strengths.length} strengths and ${data.reviewAnalysis.achievements.length} achievements.`,
        color: 'green',
        icon: <IconCheck size={18} />,
        autoClose: 5000,
      });

      closeFinalize();
      fetchDocument();
    } catch (error) {
      console.error('Failed to finalize:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to finalize report',
        color: 'red',
      });
    } finally {
      setFinalizing(false);
    }
  };

  const handleCopyContent = useCallback(async (blockId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedBlockId(blockId);
      notifications.show({
        title: 'Copied',
        message: 'Response copied to clipboard',
        color: 'green',
        icon: <IconCheck size={18} />,
      });
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopiedBlockId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to copy to clipboard',
        color: 'red',
      });
    }
  }, []);

  const blockTypeConfig: Record<
    string,
    { color: string; icon: React.ReactNode; label: string }
  > = {
    PROMPT_RESPONSE: { color: 'violet', icon: <IconMessageQuestion size={16} />, label: 'Prompt & Response' },
    TEXT: { color: 'blue', icon: <IconEdit size={16} />, label: 'Text' },
    HEADING: { color: 'orange', icon: <IconHeading size={16} />, label: 'Heading' },
    DIVIDER: { color: 'gray', icon: <IconMinus size={16} />, label: 'Divider' },
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Center style={{ height: '50vh' }}>
          <Loader size="xl" />
        </Center>
      </Container>
    );
  }

  if (!document) {
    return (
      <Container size="lg" py="xl">
        <Center style={{ height: '50vh' }}>
          <Text>Report not found</Text>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" onClick={() => router.push('/report-builder')}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            <div>
              <Title order={2}>{document.name}</Title>
              {document.description && (
                <Text c="dimmed" size="sm">
                  {document.description}
                </Text>
              )}
            </div>
          </Group>
          <Group>
            <Badge color={document.status === 'DRAFT' ? 'yellow' : 'green'}>
              {document.status}
            </Badge>
            {document.status === 'DRAFT' && (
              <Button
                leftSection={<IconDeviceFloppy size={18} />}
                color="green"
                onClick={openFinalize}
                disabled={document.blocks.length === 0}
              >
                Save & Publish
              </Button>
            )}
          </Group>
        </Group>

        {/* Blocks */}
        <Stack gap="md">
          {document.blocks.length === 0 ? (
            <Card withBorder p="xl" radius="md">
              <Stack align="center" gap="sm">
                <Text c="dimmed">No blocks yet. Add your first block to get started.</Text>
                <Button
                  leftSection={<IconPlus size={18} />}
                  variant="light"
                  onClick={() => {
                    setNewBlockPosition(0);
                    openCreateBlock();
                  }}
                >
                  Add Block
                </Button>
              </Stack>
            </Card>
          ) : (
            document.blocks.map((block, index) => {
              const config = blockTypeConfig[block.type] || blockTypeConfig.TEXT;

              return (
                <Paper key={block.id} withBorder p="md" radius="md">
                  <Stack gap="sm">
                    {/* Block Header */}
                    <Group justify="space-between">
                      <Group gap="xs">
                        <ActionIcon variant="subtle" color="gray" style={{ cursor: 'grab' }}>
                          <IconGripVertical size={16} />
                        </ActionIcon>
                        <Badge color={config.color} leftSection={config.icon} variant="light">
                          {config.label}
                        </Badge>
                        {block.metadata?.generatedAt && (
                          <Tooltip label={`Generated ${new Date(block.metadata.generatedAt).toLocaleString()}`}>
                            <Badge size="xs" variant="outline" color="gray">
                              AI Generated
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>

                      <Group gap="xs">
                        {block.type === 'PROMPT_RESPONSE' && (
                          <>
                            <Tooltip label="Generate Response">
                              <ActionIcon
                                variant="light"
                                color="green"
                                loading={generating === block.id}
                                onClick={() => handleGenerateResponse(block.id)}
                                disabled={!block.prompt}
                              >
                                <IconSparkles size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Refine with Chat">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => handleOpenChat(block.id)}
                                disabled={!block.content}
                              >
                                <IconMessage size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label={copiedBlockId === block.id ? 'Copied!' : 'Copy Response'}>
                              <ActionIcon
                                variant="light"
                                color={copiedBlockId === block.id ? 'green' : 'gray'}
                                onClick={() => handleCopyContent(block.id, block.content)}
                                disabled={!block.content}
                              >
                                {copiedBlockId === block.id ? (
                                  <IconCheck size={16} />
                                ) : (
                                  <IconCopy size={16} />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          </>
                        )}

                        <Menu position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconHistory size={16} />}
                              onClick={() => handleOpenHistory(block.id)}
                            >
                              History
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={16} />}
                              onClick={() => handleDeleteBlock(block.id)}
                            >
                              Delete
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Group>

                    {/* Block Content */}
                    {block.type === 'DIVIDER' ? (
                      <Divider />
                    ) : block.type === 'PROMPT_RESPONSE' ? (
                      <Stack gap="md">
                        {/* Prompt Section */}
                        <InlineMarkdownEditor
                          label="PROMPT"
                          value={blockEdits[block.id]?.prompt ?? block.prompt}
                          onChange={(value) => updateLocalBlock(block.id, 'prompt', value)}
                          placeholder="Enter your prompt/question here..."
                          onSave={() => {
                            const newPrompt = blockEdits[block.id]?.prompt;
                            if (newPrompt !== undefined && newPrompt !== block.prompt) {
                              handleSaveBlock(block.id, { prompt: newPrompt });
                            }
                          }}
                          previewBg="violet.0"
                        />

                        {/* Response Section */}
                        <MarkdownEditor
                          label="RESPONSE"
                          value={blockEdits[block.id]?.content ?? block.content}
                          onChange={(value) => updateLocalBlock(block.id, 'content', value)}
                          placeholder="Click the generate button to create a response, or click here to write manually..."
                          minHeight={150}
                          onBlur={() => {
                            const newContent = blockEdits[block.id]?.content;
                            if (newContent !== undefined && newContent !== block.content) {
                              handleSaveBlock(block.id, { content: newContent });
                            }
                          }}
                          previewBg="gray.0"
                        />
                      </Stack>
                    ) : block.type === 'HEADING' ? (
                      <InlineMarkdownEditor
                        value={blockEdits[block.id]?.content ?? block.content}
                        onChange={(value) => updateLocalBlock(block.id, 'content', value)}
                        placeholder="Click to add heading..."
                        onSave={() => {
                          const newContent = blockEdits[block.id]?.content;
                          if (newContent !== undefined && newContent !== block.content) {
                            handleSaveBlock(block.id, { content: newContent });
                          }
                        }}
                        previewBg="orange.0"
                      />
                    ) : (
                      // TEXT block
                      <MarkdownEditor
                        value={blockEdits[block.id]?.content ?? block.content}
                        onChange={(value) => updateLocalBlock(block.id, 'content', value)}
                        placeholder="Click to add content..."
                        minHeight={120}
                        onBlur={() => {
                          const newContent = blockEdits[block.id]?.content;
                          if (newContent !== undefined && newContent !== block.content) {
                            handleSaveBlock(block.id, { content: newContent });
                          }
                        }}
                        previewBg="blue.0"
                      />
                    )}
                  </Stack>

                  {/* Add block button between blocks */}
                  <Center mt="sm">
                    <Tooltip label="Add block here">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => {
                          setNewBlockPosition(index + 1);
                          openCreateBlock();
                        }}
                      >
                        <IconPlus size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Center>
                </Paper>
              );
            })
          )}

          {/* Add block at end */}
          {document.blocks.length > 0 && (
            <Center>
              <Button
                variant="subtle"
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  setNewBlockPosition(document.blocks.length);
                  openCreateBlock();
                }}
              >
                Add Block
              </Button>
            </Center>
          )}
        </Stack>
      </Stack>

      {/* Create Block Modal */}
      <Modal opened={createBlockOpened} onClose={closeCreateBlock} title="Add Block">
        <Stack gap="md">
          <Select
            label="Block Type"
            value={newBlockType}
            onChange={(value) => setNewBlockType(value || 'PROMPT_RESPONSE')}
            data={[
              { value: 'PROMPT_RESPONSE', label: 'Prompt & Response - AI-assisted content' },
              { value: 'TEXT', label: 'Text - Free-form content' },
              { value: 'HEADING', label: 'Heading - Section header' },
              { value: 'DIVIDER', label: 'Divider - Visual separator' },
            ]}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeCreateBlock}>
              Cancel
            </Button>
            <Button onClick={handleCreateBlock}>Add Block</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Chat Drawer */}
      <Drawer
        opened={chatOpened}
        onClose={closeChat}
        title="Refine Response"
        position="right"
        size="md"
      >
        <Stack h="calc(100vh - 120px)">
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap="sm">
              {chatMessages.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  Ask for changes to refine the response. When you're satisfied,
                  the AI will save the final version.
                </Text>
              )}
              {chatMessages.map((msg, i) => (
                <Paper
                  key={i}
                  p="sm"
                  radius="md"
                  bg={msg.role === 'user' ? 'blue.0' : 'gray.0'}
                >
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </Text>
                  <MarkdownRenderer content={msg.content} />
                </Paper>
              ))}
              {chatLoading && (
                <Center>
                  <Loader size="sm" />
                </Center>
              )}
            </Stack>
          </ScrollArea>

          <Stack gap="xs">
            <Textarea
              placeholder="e.g., Make it more concise, add metrics, change the tone..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              minRows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
            />
            <Button
              onClick={handleSendChat}
              loading={chatLoading}
              disabled={!chatInput.trim()}
            >
              Send
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      {/* History Drawer */}
      <Drawer
        opened={historyOpened}
        onClose={closeHistory}
        title="Revision History"
        position="right"
        size="md"
      >
        {historyLoading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : blockHistory.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No revision history yet
          </Text>
        ) : (
          <Stack gap="md">
            {blockHistory.map((revision) => (
              <Paper key={revision.id} withBorder p="md" radius="md">
                <Group justify="space-between" mb="xs">
                  <Badge
                    color={
                      revision.changeType === 'MANUAL_EDIT'
                        ? 'blue'
                        : revision.changeType === 'AGENT_GENERATION'
                        ? 'green'
                        : 'violet'
                    }
                    size="sm"
                  >
                    {revision.changeType.replace('_', ' ')}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {new Date(revision.createdAt).toLocaleString()}
                  </Text>
                </Group>

                <Text size="sm" lineClamp={4}>
                  {revision.previousContent || '(empty)'}
                </Text>

                <Button
                  variant="light"
                  size="xs"
                  mt="sm"
                  onClick={() => handleRestoreRevision(revision.id)}
                >
                  Restore this version
                </Button>
              </Paper>
            ))}
          </Stack>
        )}
      </Drawer>

      {/* Finalize Modal */}
      <Modal
        opened={finalizeOpened}
        onClose={closeFinalize}
        title="Save & Publish Report"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This will finalize your report and save it to your review history.
            The AI will analyze your responses to extract key themes, strengths,
            growth areas, and achievements.
          </Text>

          <Select
            label="Review Year/Period"
            value={finalizeYear}
            onChange={(value) => setFinalizeYear(value || new Date().getFullYear().toString())}
            data={[
              { value: `${new Date().getFullYear()}`, label: `${new Date().getFullYear()} Annual` },
              { value: `${new Date().getFullYear()}-mid`, label: `${new Date().getFullYear()} Mid-Year` },
              { value: `${new Date().getFullYear() - 1}`, label: `${new Date().getFullYear() - 1} Annual` },
              { value: `${new Date().getFullYear() - 1}-mid`, label: `${new Date().getFullYear() - 1} Mid-Year` },
            ]}
          />

          <Select
            label="Review Type"
            value={finalizeReviewType}
            onChange={(value) => setFinalizeReviewType(value || 'SELF')}
            data={[
              { value: 'SELF', label: 'Self Assessment' },
              { value: 'EMPLOYEE', label: 'Employee Review' },
              { value: 'PEER', label: 'Peer Review' },
            ]}
          />

          <Divider my="sm" />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeFinalize} disabled={finalizing}>
              Cancel
            </Button>
            <Button
              color="green"
              leftSection={<IconDeviceFloppy size={18} />}
              onClick={handleFinalize}
              loading={finalizing}
            >
              Publish Report
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
