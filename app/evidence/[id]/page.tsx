'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  Divider,
  Loader,
  Center,
  Alert,
  Paper,
  SimpleGrid,
  Image,
  ActionIcon,
  Modal,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconBrandGithub,
  IconMessage,
  IconFileText,
  IconPencil,
  IconAlertCircle,
  IconDownload,
  IconExternalLink,
  IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

type Evidence = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  content: string;
  timestamp: string;
  repository: string | null;
  prNumber: number | null;
  prUrl: string | null;
  slackLink: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  components: string | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  criteria: Array<{
    criterionId: number;
    confidence: number;
    explanation: string | null;
    criterion: {
      id: number;
      subarea: string;
      description: string;
      areaOfConcentration: string;
    };
  }>;
  attachments: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    path: string;
    createdAt: string;
  }>;
};

export default function EvidenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvidence() {
      try {
        const response = await fetch(`/api/evidence/${params.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch evidence');
        }
        const data = await response.json();
        setEvidence(data);
      } catch (error) {
        console.error('Failed to fetch evidence:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load evidence',
          color: 'red',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchEvidence();
  }, [params.id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/evidence/${params.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete evidence');
      }

      notifications.show({
        title: 'Success',
        message: 'Evidence deleted successfully',
        color: 'green',
      });

      router.push('/evidence');
    } catch (error) {
      console.error('Failed to delete evidence:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete evidence',
        color: 'red',
      });
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  const typeConfig = {
    PR: { color: 'blue', icon: IconBrandGithub, label: 'Pull Request' },
    SLACK: { color: 'green', icon: IconMessage, label: 'Slack Message' },
    REVIEW: { color: 'violet', icon: IconFileText, label: 'Review' },
    MANUAL: { color: 'orange', icon: IconPencil, label: 'Manual Entry' },
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  if (!evidence) {
    return (
      <Container size="xl" py="xl">
        <Alert icon={<IconAlertCircle size={18} />} title="Not Found" color="red">
          Evidence not found. It may have been deleted.
        </Alert>
        <Button
          component={Link}
          href="/evidence"
          leftSection={<IconArrowLeft size={18} />}
          mt="md"
        >
          Back to Evidence List
        </Button>
      </Container>
    );
  }

  const config = typeConfig[evidence.type as keyof typeof typeConfig];
  const Icon = config.icon;

  // Group criteria by area of concentration
  const criteriaByArea = evidence.criteria.reduce((acc, ec) => {
    const area = ec.criterion.areaOfConcentration;
    if (!acc[area]) {
      acc[area] = [];
    }
    acc[area].push(ec);
    return acc;
  }, {} as Record<string, typeof evidence.criteria>);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <Button
            component={Link}
            href="/evidence"
            leftSection={<IconArrowLeft size={18} />}
            variant="subtle"
          >
            Back to List
          </Button>
          <Group>
            <Button
              component={Link}
              href={`/evidence/${evidence.id}/edit`}
              leftSection={<IconEdit size={18} />}
            >
              Edit
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={18} />}
              onClick={() => setDeleteModalOpen(true)}
            >
              Delete
            </Button>
          </Group>
        </Group>

        {/* Main Card */}
        <Card withBorder padding="xl" radius="md">
          <Stack gap="lg">
            {/* Title Section */}
            <div>
              <Group mb="xs">
                <Icon size={32} color={`var(--mantine-color-${config.color}-6)`} />
                <Badge color={config.color} size="lg">
                  {evidence.type}
                </Badge>
              </Group>
              <Title order={1} mb="xs">
                {evidence.title}
              </Title>
              <Group gap="md">
                <Text size="sm" c="dimmed">
                  {format(new Date(evidence.timestamp), 'MMMM d, yyyy h:mm a')}
                </Text>
                {evidence.repository && (
                  <Text size="sm" c="dimmed">
                    {evidence.repository}
                    {evidence.prNumber && `#${evidence.prNumber}`}
                  </Text>
                )}
              </Group>
            </div>

            {/* Description */}
            {evidence.description && (
              <>
                <Divider />
                <div>
                  <Text fw={600} mb="xs">
                    Description
                  </Text>
                  <Text>{evidence.description}</Text>
                </div>
              </>
            )}

            {/* PR Metrics */}
            {evidence.type === 'PR' && (evidence.additions || evidence.deletions || evidence.changedFiles) && (
              <>
                <Divider />
                <div>
                  <Text fw={600} mb="sm">
                    Code Metrics
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                    {evidence.additions !== null && (
                      <Paper withBorder p="md" radius="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                          Additions
                        </Text>
                        <Text size="xl" fw={700} c="green">
                          +{evidence.additions.toLocaleString()}
                        </Text>
                      </Paper>
                    )}
                    {evidence.deletions !== null && (
                      <Paper withBorder p="md" radius="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                          Deletions
                        </Text>
                        <Text size="xl" fw={700} c="red">
                          -{evidence.deletions.toLocaleString()}
                        </Text>
                      </Paper>
                    )}
                    {evidence.changedFiles !== null && (
                      <Paper withBorder p="md" radius="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                          Files Changed
                        </Text>
                        <Text size="xl" fw={700}>
                          {evidence.changedFiles}
                        </Text>
                      </Paper>
                    )}
                  </SimpleGrid>
                </div>
              </>
            )}

            {/* Components */}
            {evidence.components && (
              <>
                <Divider />
                <div>
                  <Text fw={600} mb="xs">
                    Components Affected
                  </Text>
                  <Group gap="xs">
                    {JSON.parse(evidence.components).map((component: { name: string; count: number; depth: number }, idx: number) => (
                      <Badge key={idx} variant="light" size="lg">
                        {component.name}
                      </Badge>
                    ))}
                  </Group>
                </div>
              </>
            )}

            {/* Links */}
            {(evidence.prUrl || evidence.slackLink) && (
              <>
                <Divider />
                <div>
                  <Text fw={600} mb="xs">
                    Links
                  </Text>
                  <Group gap="sm">
                    {evidence.prUrl && (
                      <Button
                        component="a"
                        href={evidence.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={<IconExternalLink size={18} />}
                        variant="light"
                        color={config.color}
                      >
                        View on GitHub
                      </Button>
                    )}
                    {evidence.slackLink && (
                      <Button
                        component="a"
                        href={evidence.slackLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={<IconExternalLink size={18} />}
                        variant="light"
                        color="green"
                      >
                        View on Slack
                      </Button>
                    )}
                  </Group>
                </div>
              </>
            )}
          </Stack>
        </Card>

        {/* Criteria Section */}
        {evidence.criteria.length > 0 && (
          <Card withBorder padding="xl" radius="md">
            <Stack gap="lg">
              <div>
                <Title order={2} size="h3">
                  Matched Performance Criteria
                </Title>
                <Text c="dimmed" size="sm">
                  {evidence.criteria.length} criteria matched with confidence scores
                </Text>
              </div>

              {Object.entries(criteriaByArea).map(([area, criteria]) => (
                <div key={area}>
                  <Text fw={600} mb="sm" c="blue">
                    {area}
                  </Text>
                  <Stack gap="sm">
                    {criteria
                      .sort((a, b) => b.confidence - a.confidence)
                      .map((ec) => (
                        <Paper key={ec.criterionId} withBorder p="md" radius="md">
                          <Group justify="space-between" mb="xs">
                            <Group>
                              <Badge variant="light" size="lg">
                                {ec.criterion.subarea}
                              </Badge>
                              <Badge color="teal" variant="filled">
                                {Math.round(ec.confidence)}% confidence
                              </Badge>
                            </Group>
                          </Group>
                          <Text size="sm" mb={ec.explanation ? 'xs' : undefined}>
                            {ec.criterion.description}
                          </Text>
                          {ec.explanation && (
                            <Text size="sm" c="dimmed" fs="italic">
                              {ec.explanation}
                            </Text>
                          )}
                        </Paper>
                      ))}
                  </Stack>
                </div>
              ))}
            </Stack>
          </Card>
        )}

        {/* Attachments Section */}
        {evidence.attachments.length > 0 && (
          <Card withBorder padding="xl" radius="md">
            <Stack gap="md">
              <div>
                <Title order={2} size="h3">
                  Attachments
                </Title>
                <Text c="dimmed" size="sm">
                  {evidence.attachments.length} file(s) attached
                </Text>
              </div>

              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                {evidence.attachments.map((attachment) => {
                  const isImage = attachment.mimeType.startsWith('image/');
                  return (
                    <Paper key={attachment.id} withBorder p="md" radius="md">
                      {isImage ? (
                        <div
                          style={{ position: 'relative', cursor: 'pointer' }}
                          onClick={() => setPreviewImage(attachment.path)}
                        >
                          <Image
                            src={attachment.path}
                            alt={attachment.originalName}
                            height={200}
                            fit="cover"
                            radius="sm"
                          />
                        </div>
                      ) : (
                        <Center style={{ height: 200 }}>
                          <Stack align="center" gap="xs">
                            <IconFileText size={48} opacity={0.5} />
                            <Text size="sm" c="dimmed">
                              {attachment.originalName}
                            </Text>
                          </Stack>
                        </Center>
                      )}
                      <Group justify="space-between" mt="sm">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" truncate>
                            {attachment.originalName}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {formatFileSize(attachment.size)}
                          </Text>
                        </div>
                        <Button
                          component="a"
                          href={attachment.path}
                          download={attachment.originalName}
                          size="xs"
                          variant="subtle"
                          leftSection={<IconDownload size={14} />}
                        >
                          Download
                        </Button>
                      </Group>
                    </Paper>
                  );
                })}
              </SimpleGrid>
            </Stack>
          </Card>
        )}

        {/* Metadata */}
        <Card withBorder padding="md" radius="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Created: {format(new Date(evidence.createdAt), 'MMM d, yyyy h:mm a')}
            </Text>
            <Text size="xs" c="dimmed">
              Updated: {format(new Date(evidence.updatedAt), 'MMM d, yyyy h:mm a')}
            </Text>
            <Text size="xs" c="dimmed">
              ID: {evidence.id}
            </Text>
          </Group>
        </Card>
      </Stack>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Evidence"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete this evidence? This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={deleting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        opened={!!previewImage}
        onClose={() => setPreviewImage(null)}
        size="xl"
        withCloseButton={false}
        padding={0}
      >
        <div style={{ position: 'relative' }}>
          <ActionIcon
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}
            onClick={() => setPreviewImage(null)}
            size="lg"
            variant="filled"
            color="dark"
          >
            <IconX size={18} />
          </ActionIcon>
          {previewImage && (
            <Image src={previewImage} alt="Preview" fit="contain" />
          )}
        </div>
      </Modal>
    </Container>
  );
}
