'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Loader,
  Alert,
  FileInput,
  Badge,
  ActionIcon,
  Paper,
  NumberInput,
  Center,
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

type CriterionSelection = {
  criterionId: number;
  confidence: number;
  explanation: string;
};

export default function NewEvidencePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [selectedCriteria, setSelectedCriteria] = useState<CriterionSelection[]>([]);
  const [files, setFiles] = useState<File[]>([]);
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
    async function fetchCriteria() {
      try {
        const response = await fetch('/api/criteria');
        const data = await response.json();
        setCriteria(data.criteria);
      } catch (error) {
        console.error('Failed to fetch criteria:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load criteria',
          color: 'red',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchCriteria();
  }, []);

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

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (values: typeof form.values) => {
    setSaving(true);
    try {
      // Create evidence first
      const components = values.components
        ? values.components.split(',').map((c) => c.trim()).filter(Boolean)
        : null;

      const response = await fetch('/api/evidence', {
        method: 'POST',
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
        throw new Error('Failed to create evidence');
      }

      const evidence = await response.json();

      // Upload files if any
      if (files.length > 0) {
        setUploading(true);
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('evidenceId', evidence.id);

          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            console.error('Failed to upload file:', file.name);
          }
        }
        setUploading(false);
      }

      notifications.show({
        title: 'Success',
        message: 'Evidence created successfully',
        color: 'green',
      });

      router.push(`/evidence/${evidence.id}`);
    } catch (error) {
      console.error('Failed to create evidence:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create evidence',
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
              <Title order={1}>Add New Evidence</Title>
              <Text c="dimmed" size="sm">
                Create a new evidence entry for performance tracking
              </Text>
            </div>
            <Group>
              <Button
                component={Link}
                href="/evidence"
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
                Create Evidence
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
                description="Select the type of evidence you're adding"
                {...form.getInputProps('type')}
              />

              <TextInput
                label="Title"
                required
                placeholder="Brief title for this evidence"
                description="A short, descriptive title"
                {...form.getInputProps('title')}
              />

              <Textarea
                label="Description"
                placeholder="Detailed description of this evidence"
                description="Explain the context and impact of this work"
                rows={4}
                {...form.getInputProps('description')}
              />

              <DateTimePicker
                label="Timestamp"
                placeholder="When did this occur?"
                description="Date and time this evidence was created"
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
                  description="GitHub repository in owner/repo format"
                  {...form.getInputProps('repository')}
                />

                <Group grow>
                  <NumberInput
                    label="PR Number"
                    placeholder="123"
                    description="Pull request number"
                    {...form.getInputProps('prNumber')}
                  />
                  <TextInput
                    label="PR URL"
                    placeholder="https://github.com/..."
                    description="Full URL to the pull request"
                    {...form.getInputProps('prUrl')}
                  />
                </Group>

                <Group grow>
                  <NumberInput
                    label="Additions"
                    placeholder="Lines added"
                    description="Number of lines added"
                    {...form.getInputProps('additions')}
                  />
                  <NumberInput
                    label="Deletions"
                    placeholder="Lines deleted"
                    description="Number of lines deleted"
                    {...form.getInputProps('deletions')}
                  />
                  <NumberInput
                    label="Files Changed"
                    placeholder="Number of files"
                    description="Files modified in PR"
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
                  description="Link to the Slack message or thread"
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
                  Link this evidence to performance criteria that it demonstrates
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
                description="Select criteria that this evidence demonstrates"
              />

              {selectedCriteria.length === 0 && (
                <Alert color="blue" title="Optional">
                  You can add criteria now or link them later when editing this evidence.
                </Alert>
              )}

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
                            >
                              <IconX size={18} />
                            </ActionIcon>
                          </Group>

                          <NumberInput
                            label="Confidence %"
                            description="How strongly does this evidence demonstrate this criterion?"
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
                            description="Provide context for how this evidence relates to the criterion"
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
                  Upload screenshots, documents, or other supporting files (max 10MB per file)
                </Text>
              </div>

              <FileInput
                label="Upload Files"
                placeholder="Click to upload files"
                multiple
                leftSection={<IconUpload size={18} />}
                value={files}
                onChange={setFiles}
                description="Supported formats: images, PDFs, documents"
              />

              {files.length > 0 && (
                <div>
                  <Text fw={600} size="sm" mb="xs">
                    Files to Upload ({files.length})
                  </Text>
                  <Stack gap="xs">
                    {files.map((file, index) => (
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
                            onClick={() => handleRemoveFile(index)}
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
              href="/evidence"
              variant="subtle"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={saving || uploading}
              leftSection={<IconDeviceFloppy size={18} />}
            >
              {uploading ? 'Uploading files...' : 'Create Evidence'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Container>
  );
}
