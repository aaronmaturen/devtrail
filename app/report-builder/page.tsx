'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  SimpleGrid,
  Loader,
  Center,
  Menu,
  ActionIcon,
  Modal,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconFileText,
  IconDotsVertical,
  IconTrash,
  IconEdit,
  IconCopy,
} from '@tabler/icons-react';
import { format } from 'date-fns';

type ReportDocument = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  blockCount: number;
  promptCount: number;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
};

export default function ReportBuilderPage() {
  const [documents, setDocuments] = useState<ReportDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [creating, setCreating] = useState(false);

  const form = useForm({
    initialValues: {
      name: '',
      description: '',
    },
    validate: {
      name: (value) => (!value ? 'Name is required' : null),
    },
  });

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/report-builder');
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load report documents',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleCreate = async (values: typeof form.values) => {
    setCreating(true);
    try {
      const response = await fetch('/api/report-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to create document');
      }

      const newDoc = await response.json();

      notifications.show({
        title: 'Success',
        message: 'Report created successfully',
        color: 'green',
      });

      form.reset();
      setCreateModalOpened(false);

      // Navigate to the new document
      window.location.href = `/report-builder/${newDoc.id}`;
    } catch (error) {
      console.error('Failed to create document:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create report',
        color: 'red',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;

    try {
      const response = await fetch(`/api/report-builder/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      notifications.show({
        title: 'Success',
        message: 'Report deleted',
        color: 'green',
      });

      fetchDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete report',
        color: 'red',
      });
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'yellow';
      case 'PUBLISHED':
        return 'green';
      case 'ARCHIVED':
        return 'gray';
      default:
        return 'blue';
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '50vh' }}>
          <Loader size="xl" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>Report Builder</Title>
            <Text c="dimmed" size="sm">
              Create block-based performance reports with AI assistance
            </Text>
          </div>
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setCreateModalOpened(true)}
          >
            New Report
          </Button>
        </Group>

        {/* Documents Grid */}
        {documents.length === 0 ? (
          <Card withBorder p="xl" radius="md">
            <Stack align="center" gap="sm">
              <IconFileText size={48} color="gray" />
              <Text c="dimmed">No reports yet. Create your first report to get started.</Text>
              <Button
                leftSection={<IconPlus size={18} />}
                variant="light"
                onClick={() => setCreateModalOpened(true)}
              >
                Create Report
              </Button>
            </Stack>
          </Card>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {documents.map((doc) => (
              <Card
                key={doc.id}
                withBorder
                padding="lg"
                radius="md"
                style={{ cursor: 'pointer' }}
              >
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Badge color={statusColor(doc.status)} variant="light">
                      {doc.status}
                    </Badge>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDotsVertical size={18} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEdit size={16} />}
                          component={Link}
                          href={`/report-builder/${doc.id}`}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconCopy size={16} />}
                          disabled
                        >
                          Duplicate
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          onClick={() => handleDelete(doc.id)}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>

                  <Link
                    href={`/report-builder/${doc.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <Text fw={600} size="lg" lineClamp={1}>
                      {doc.name}
                    </Text>

                    {doc.description && (
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {doc.description}
                      </Text>
                    )}

                    <Group gap="xs" mt="sm">
                      <Badge size="sm" variant="outline" color="blue">
                        {doc.blockCount} blocks
                      </Badge>
                      <Badge size="sm" variant="outline" color="violet">
                        {doc.promptCount} prompts
                      </Badge>
                      <Badge size="sm" variant="outline" color="green">
                        {doc.responseCount} responses
                      </Badge>
                    </Group>

                    <Text size="xs" c="dimmed" mt="sm">
                      Updated {format(new Date(doc.updatedAt), 'MMM d, yyyy')}
                    </Text>
                  </Link>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>

      {/* Create Modal */}
      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        title="Create New Report"
      >
        <form onSubmit={form.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput
              label="Report Name"
              placeholder="FY25 Performance Review"
              required
              {...form.getInputProps('name')}
            />

            <Textarea
              label="Description"
              placeholder="Annual performance review for fiscal year 2025..."
              rows={3}
              {...form.getInputProps('description')}
            />

            <Group justify="flex-end">
              <Button variant="default" onClick={() => setCreateModalOpened(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={creating}>
                Create Report
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
