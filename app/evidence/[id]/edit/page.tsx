'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Group,
  Stack,
  TextInput,
  Textarea,
  Select,
  MultiSelect,
  Loader,
  Center,
  Alert,
  FileInput,
  Badge,
  ActionIcon,
  Paper,
  NumberInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { DateTimePicker } from '@mantine/dates';
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconAlertCircle,
  IconUpload,
  IconX,
  IconFile,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

type Criterion = {
  id: number;
  subarea: string;
  description: string;
  areaOfConcentration: string;
};

type Evidence = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  timestamp: string;
  repository: string | null;
  prNumber: number | null;
  prUrl: string | null;
  slackLink: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  components: string | null;
  criteria: Array<{
    criterionId: number;
    confidence: number;
    explanation: string | null;
  }>;
  attachments: Array<{
    id: string;
    filename: string;
    originalName: string;
    path: string;
    size: number;
  }>;
};

type CriterionSelection = {
  criterionId: number;
  confidence: number;
  explanation: string;
};

export default function EvidenceEditPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [selectedCriteria, setSelectedCriteria] = useState<CriterionSelection[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Evidence['attachments']>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const form = useForm({
    initialValues: {
      type: 'MANUAL',
      title: '',
      description: '',
      timestamp: new Date(),
      repository: '',
      prNumber: null as number | null,
      prUrl: '',
      slackLink: '',
      additions: null as number | null,
      deletions: null as number | null,
      changedFiles: null as number | null,
      components: '',
    },
    validate: {
      title: (value) => (!value ? 'Title is required' : null),
      type: (value) => (!value ? 'Type is required' : null),
    },
  });

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch criteria and evidence in parallel
        const [criteriaResponse, evidenceResponse] = await Promise.all([
          fetch('/api/criteria'),
          fetch(`/api/evidence/${params.id}`),
        ]);

        if (!evidenceResponse.ok) {
          throw new Error('Failed to fetch evidence');
        }

        const criteriaData = await criteriaResponse.json();
        const evidenceData = await evidenceResponse.json();

        setCriteria(criteriaData.criteria);
        setEvidence(evidenceData);
        setExistingAttachments(evidenceData.attachments);

        // Populate form with existing data
        form.setValues({
          type: evidenceData.type,
          title: evidenceData.title,
          description: evidenceData.description || '',
          timestamp: new Date(evidenceData.timestamp),
          repository: evidenceData.repository || '',
          prNumber: evidenceData.prNumber,
          prUrl: evidenceData.prUrl || '',
          slackLink: evidenceData.slackLink || '',
          additions: evidenceData.additions,
          deletions: evidenceData.deletions,
          changedFiles: evidenceData.changedFiles,
          components: evidenceData.components
            ? JSON.parse(evidenceData.components).join(', ')
            : '',
        });

        // Set selected criteria
        setSelectedCriteria(
          evidenceData.criteria.map((c: any) => ({
            criterionId: c.criterionId,
            confidence: c.confidence,
            explanation: c.explanation || '',
          }))
        );
      } catch (error) {
        console.error('Failed to fetch data:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load evidence',
          color: 'red',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [params.id]);

  const handleAddCriterion = (criterionId: string) => {
    const id = parseInt(criterionId);
    if (!selectedCriteria.find((c) => c.criterionId === id)) {
      setSelectedCriteria([
        ...selectedCriteria,
        { criterionId: id, confidence: 80, explanation: '' },
      ]);
    }
  };

  const handleRemoveCriterion = (criterionId: number) => {
    setSelectedCriteria(selectedCriteria.filter((c) => c.criterionId !== criterionId));
  };

  const handleUpdateCriterion = (
    criterionId: number,
    field: keyof CriterionSelection,
    value: any
  ) => {
    setSelectedCriteria(
      selectedCriteria.map((c) =>
        c.criterionId === criterionId ? { ...c, [field]: value } : c
      )
    );
  };

  const handleRemoveExistingAttachment = async (attachmentId: string) => {
    const attachment = existingAttachments.find((a) => a.id === attachmentId);
    if (!attachment) return;

    try {
      await fetch(`/api/upload?filename=${attachment.filename}`, {
        method: 'DELETE',
      });
      setExistingAttachments(existingAttachments.filter((a) => a.id !== attachmentId));
      notifications.show({
        title: 'Success',
        message: 'Attachment removed',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to remove attachment',
        color: 'red',
      });
    }
  };

  const handleRemoveNewFile = (index: number) => {
    setNewFiles(newFiles.filter((_, i) => i !== index));
  };

  const handleSubmit = async (values: typeof form.values) => {
    setSaving(true);
    try {
      // Upload new files first
      const uploadedFiles: string[] = [];
      if (newFiles.length > 0) {
        setUploading(true);
        for (const file of newFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('evidenceId', params.id as string);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Failed to upload file');
          }

          const data = await response.json();
          uploadedFiles.push(data.attachment.id);
        }
        setUploading(false);
      }

      // Update evidence
      const components = values.components
        ? values.components.split(',').map((c) => c.trim()).filter(Boolean)
        : null;

      const response = await fetch(`/api/evidence/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          prNumber: values.prNumber || null,
          additions: values.additions || null,
          deletions: values.deletions || null,
          changedFiles: values.changedFiles || null,
          components,
          criteriaIds: selectedCriteria.map((c) => ({
            criterionId: c.criterionId,
            confidence: c.confidence,
            explanation: c.explanation || null,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update evidence');
      }

      notifications.show({
        title: 'Success',
        message: 'Evidence updated successfully',
        color: 'green',
      });

      router.push(`/evidence/${params.id}`);
    } catch (error) {
      console.error('Failed to update evidence:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update evidence',
        color: 'red',
      });
    } finally {
      setSaving(false);
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

  const criteriaOptions = criteria.map((c) => ({
    value: c.id.toString(),
    label: `${c.subarea} - ${c.description}`,
    group: c.areaOfConcentration,
  }));

  return (
    <Container size="xl" py="xl">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          {/* Header */}
          <Group justify="space-between">
            <div>
              <Title order={1}>Edit Evidence</Title>
              <Text c="dimmed" size="sm">
                Update evidence details and criteria
              </Text>
            </div>
            <Group>
              <Button
                component={Link}
                href={`/evidence/${params.id}`}
                variant="subtle"
                leftSection={<IconArrowLeft size={18} />}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={saving || uploading}
                leftSection={<IconDeviceFloppy size={18} />}
              >
                Save Changes
              </Button>
            </Group>
          </Group>

          {/* Basic Information */}
          <Card withBorder padding="xl" radius="md">
            <Stack gap="md">
              <Title order={2} size="h3">
                Basic Information
              </Title>

              <Select
                label="Type"
                required
                data={[
                  { value: 'PR', label: 'Pull Request' },
                  { value: 'SLACK', label: 'Slack Message' },
                  { value: 'REVIEW', label: 'Review' },
                  { value: 'MANUAL', label: 'Manual Entry' },
                ]}
                {...form.getInputProps('type')}
              />

              <TextInput
                label="Title"
                required
                placeholder="Brief title for this evidence"
                {...form.getInputProps('title')}
              />

              <Textarea
                label="Description"
                placeholder="Detailed description of this evidence"
                rows={4}
                {...form.getInputProps('description')}
              />

              <DateTimePicker
                label="Timestamp"
                placeholder="When did this occur?"
                {...form.getInputProps('timestamp')}
              />
            </Stack>
          </Card>

          {/* PR-Specific Fields */}
          {form.values.type === 'PR' && (
            <Card withBorder padding="xl" radius="md">
              <Stack gap="md">
                <Title order={2} size="h3">
                  Pull Request Details
                </Title>

                <TextInput
                  label="Repository"
                  placeholder="owner/repo"
                  {...form.getInputProps('repository')}
                />

                <Group grow>
                  <NumberInput
                    label="PR Number"
                    placeholder="123"
                    {...form.getInputProps('prNumber')}
                  />
                  <TextInput
                    label="PR URL"
                    placeholder="https://github.com/..."
                    {...form.getInputProps('prUrl')}
                  />
                </Group>

                <Group grow>
                  <NumberInput
                    label="Additions"
                    placeholder="Lines added"
                    {...form.getInputProps('additions')}
                  />
                  <NumberInput
                    label="Deletions"
                    placeholder="Lines deleted"
                    {...form.getInputProps('deletions')}
                  />
                  <NumberInput
                    label="Files Changed"
                    placeholder="Number of files"
                    {...form.getInputProps('changedFiles')}
                  />
                </Group>

                <TextInput
                  label="Components"
                  placeholder="component1, component2, component3"
                  description="Comma-separated list of components affected"
                  {...form.getInputProps('components')}
                />
              </Stack>
            </Card>
          )}

          {/* Slack-Specific Fields */}
          {form.values.type === 'SLACK' && (
            <Card withBorder padding="xl" radius="md">
              <Stack gap="md">
                <Title order={2} size="h3">
                  Slack Message Details
                </Title>

                <TextInput
                  label="Slack Link"
                  placeholder="https://workspace.slack.com/..."
                  {...form.getInputProps('slackLink')}
                />
              </Stack>
            </Card>
          )}

          {/* Criteria Selection */}
          <Card withBorder padding="xl" radius="md">
            <Stack gap="md">
              <div>
                <Title order={2} size="h3">
                  Performance Criteria
                </Title>
                <Text c="dimmed" size="sm">
                  Link this evidence to performance criteria
                </Text>
              </div>

              <Select
                label="Add Criterion"
                placeholder="Search and select criteria..."
                data={criteriaOptions}
                searchable
                nothingFoundMessage="No criteria found"
                onChange={(value) => value && handleAddCriterion(value)}
                value={null}
              />

              {selectedCriteria.length > 0 && (
                <Stack gap="md">
                  {selectedCriteria.map((sc) => {
                    const criterion = criteria.find((c) => c.id === sc.criterionId);
                    if (!criterion) return null;

                    return (
                      <Paper key={sc.criterionId} withBorder p="md" radius="md">
                        <Stack gap="sm">
                          <Group justify="space-between">
                            <div>
                              <Badge size="sm" mb={4}>
                                {criterion.areaOfConcentration}
                              </Badge>
                              <Text fw={600}>{criterion.subarea}</Text>
                              <Text size="sm" c="dimmed">
                                {criterion.description}
                              </Text>
                            </div>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => handleRemoveCriterion(sc.criterionId)}
                              aria-label="Remove criterion"
                            >
                              <IconX size={18} />
                            </ActionIcon>
                          </Group>

                          <NumberInput
                            label="Confidence %"
                            min={0}
                            max={100}
                            value={sc.confidence}
                            onChange={(value) =>
                              handleUpdateCriterion(
                                sc.criterionId,
                                'confidence',
                                value
                              )
                            }
                          />

                          <Textarea
                            label="Explanation (optional)"
                            placeholder="How does this evidence demonstrate this criterion?"
                            rows={2}
                            value={sc.explanation}
                            onChange={(e) =>
                              handleUpdateCriterion(
                                sc.criterionId,
                                'explanation',
                                e.currentTarget.value
                              )
                            }
                          />
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Card>

          {/* Attachments */}
          <Card withBorder padding="xl" radius="md">
            <Stack gap="md">
              <div>
                <Title order={2} size="h3">
                  Attachments
                </Title>
                <Text c="dimmed" size="sm">
                  Upload screenshots, documents, or other supporting files
                </Text>
              </div>

              {/* Existing Attachments */}
              {existingAttachments.length > 0 && (
                <div>
                  <Text fw={600} size="sm" mb="xs">
                    Current Attachments
                  </Text>
                  <Stack gap="xs">
                    {existingAttachments.map((attachment) => (
                      <Paper key={attachment.id} withBorder p="sm" radius="md">
                        <Group justify="space-between">
                          <Group>
                            <IconFile size={20} />
                            <div>
                              <Text size="sm">{attachment.originalName}</Text>
                              <Text size="xs" c="dimmed">
                                {(attachment.size / 1024).toFixed(1)} KB
                              </Text>
                            </div>
                          </Group>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() =>
                              handleRemoveExistingAttachment(attachment.id)
                            }
                            aria-label="Remove attachment"
                          >
                            <IconX size={18} />
                          </ActionIcon>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </div>
              )}

              {/* New Files */}
              <FileInput
                label="Add New Files"
                placeholder="Click to upload files"
                multiple
                leftSection={<IconUpload size={18} />}
                value={newFiles}
                onChange={setNewFiles}
              />

              {newFiles.length > 0 && (
                <div>
                  <Text fw={600} size="sm" mb="xs">
                    Files to Upload
                  </Text>
                  <Stack gap="xs">
                    {newFiles.map((file, index) => (
                      <Paper key={index} withBorder p="sm" radius="md">
                        <Group justify="space-between">
                          <Group>
                            <IconFile size={20} />
                            <div>
                              <Text size="sm">{file.name}</Text>
                              <Text size="xs" c="dimmed">
                                {(file.size / 1024).toFixed(1)} KB
                              </Text>
                            </div>
                          </Group>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() => handleRemoveNewFile(index)}
                          >
                            <IconX size={18} />
                          </ActionIcon>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </div>
              )}
            </Stack>
          </Card>

          {/* Submit Button */}
          <Group justify="flex-end">
            <Button
              component={Link}
              href={`/evidence/${params.id}`}
              variant="subtle"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={saving || uploading}
              leftSection={<IconDeviceFloppy size={18} />}
            >
              {uploading ? 'Uploading files...' : 'Save Changes'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Container>
  );
}
