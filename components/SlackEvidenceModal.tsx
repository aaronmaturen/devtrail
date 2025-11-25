'use client';

import { useState, useRef } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Text,
  Paper,
  Badge,
  ActionIcon,
  Loader,
  Alert,
  NumberInput,
  Stepper,
  FileInput,
  SegmentedControl,
  Image,
  Center,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconMessage, IconX, IconCheck, IconAlertCircle, IconSparkles, IconPhoto, IconUpload } from '@tabler/icons-react';

type Criterion = {
  id: number;
  subarea: string;
  description: string;
  areaOfConcentration: string;
};

type AnalyzedCriterion = {
  criterionId: number;
  confidence: number;
  explanation: string;
};

type AnalysisResult = {
  title: string;
  description: string;
  criteria: AnalyzedCriterion[];
};

interface SlackEvidenceModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  criteria: Criterion[];
}

export default function SlackEvidenceModal({
  opened,
  onClose,
  onSuccess,
  criteria,
}: SlackEvidenceModalProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [selectedCriteria, setSelectedCriteria] = useState<AnalyzedCriterion[]>([]);
  const [inputMode, setInputMode] = useState<'screenshot' | 'text'>('screenshot');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>('');

  const form = useForm({
    initialValues: {
      slackLink: '',
      messageText: '',
      title: '',
      description: '',
    },
    validate: {
      messageText: (value) => (!value ? 'Message text is required' : null),
      title: (value) => {
        if (activeStep === 2 && !value) return 'Title is required';
        return null;
      },
      description: (value) => {
        if (activeStep === 2 && !value) return 'Description is required';
        return null;
      },
    },
  });

  const handleScreenshotChange = (file: File) => {
    setScreenshotFile(file);
    const objectUrl = URL.createObjectURL(file);
    setScreenshotPreview(objectUrl);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      let response;
      let result;

      if (inputMode === 'screenshot') {
        if (!screenshotFile) {
          notifications.show({
            title: 'Error',
            message: 'Please upload a screenshot',
            color: 'red',
          });
          return;
        }

        const formData = new FormData();
        formData.append('screenshot', screenshotFile);

        response = await fetch('/api/evidence/analyze-screenshot', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to analyze screenshot');
        }

        result = await response.json();

        // Set messageText from screenshot analysis
        form.setValues({
          ...form.values,
          messageText: result.messageText || '',
          title: result.title,
          description: result.description,
        });
      } else {
        if (!form.values.messageText.trim()) {
          notifications.show({
            title: 'Error',
            message: 'Please enter the Slack message text',
            color: 'red',
          });
          return;
        }

        response = await fetch('/api/evidence/analyze-slack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageText: form.values.messageText,
            slackLink: form.values.slackLink || null,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to analyze message');
        }

        result = await response.json();

        // Pre-fill form with AI results
        form.setValues({
          ...form.values,
          title: result.title,
          description: result.description,
        });
      }

      setAnalysisResult(result);
      setSelectedCriteria(result.criteria || []);

      notifications.show({
        title: 'Analysis Complete',
        message: `AI has analyzed your Slack ${inputMode === 'screenshot' ? 'screenshot' : 'message'}`,
        color: 'green',
        icon: <IconSparkles size={18} />,
      });

      // Move to next step
      setActiveStep(1);
    } catch (error) {
      console.error('Failed to analyze:', error);
      notifications.show({
        title: 'Analysis Failed',
        message: error instanceof Error ? error.message : 'Failed to analyze. You can still continue manually.',
        color: 'yellow',
      });

      // Allow user to continue manually
      setActiveStep(1);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRemoveCriterion = (criterionId: number) => {
    setSelectedCriteria(selectedCriteria.filter((c) => c.criterionId !== criterionId));
  };

  const handleUpdateCriterion = (
    criterionId: number,
    field: keyof AnalyzedCriterion,
    value: any
  ) => {
    setSelectedCriteria(
      selectedCriteria.map((c) =>
        c.criterionId === criterionId ? { ...c, [field]: value } : c
      )
    );
  };

  const handleSubmit = async () => {
    if (!form.values.title || !form.values.description) {
      notifications.show({
        title: 'Error',
        message: 'Please provide a title and description',
        color: 'red',
      });
      return;
    }

    setSaving(true);
    try {
      // Create evidence entry
      const response = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SLACK',
          title: form.values.title,
          description: form.values.description,
          slackLink: form.values.slackLink || null,
          content: JSON.stringify({
            messageText: form.values.messageText,
          }),
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

      notifications.show({
        title: 'Success',
        message: 'Slack evidence added successfully',
        color: 'green',
        icon: <IconCheck size={18} />,
      });

      // Reset form and close
      form.reset();
      setActiveStep(0);
      setAnalysisResult(null);
      setSelectedCriteria([]);
      onSuccess();
      onClose();
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

  const handleClose = () => {
    form.reset();
    setActiveStep(0);
    setAnalysisResult(null);
    setSelectedCriteria([]);

    // Cleanup screenshot preview
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }
    setScreenshotFile(null);
    setScreenshotPreview('');
    setInputMode('screenshot');

    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Add Slack Message Evidence"
      size="xl"
      styles={{
        title: { fontWeight: 600, fontSize: '1.25rem' },
      }}
    >
      <Stack gap="md">
        <Stepper active={activeStep} onStepClick={setActiveStep}>
          <Stepper.Step
            label="Input"
            description="Paste Slack message"
            icon={<IconMessage size={18} />}
          >
            <Stack gap="md" mt="md">
              <SegmentedControl
                value={inputMode}
                onChange={(value) => setInputMode(value as 'screenshot' | 'text')}
                data={[
                  {
                    label: 'Screenshot',
                    value: 'screenshot',
                  },
                  {
                    label: 'Text',
                    value: 'text',
                  },
                ]}
                fullWidth
              />

              {inputMode === 'screenshot' ? (
                <>
                  <TextInput
                    label="Slack Link (Optional)"
                    placeholder="https://workspace.slack.com/archives/..."
                    description="Link to the Slack message or thread"
                    {...form.getInputProps('slackLink')}
                  />

                  <FileInput
                    label="Upload Screenshot"
                    required
                    placeholder="Click to select a screenshot"
                    description="Upload a screenshot of the Slack message"
                    accept="image/*"
                    leftSection={<IconUpload size={18} />}
                    value={screenshotFile}
                    onChange={(file) => file && handleScreenshotChange(file)}
                  />

                  {screenshotPreview && (
                    <Paper withBorder p="md" radius="md">
                      <Text size="sm" fw={600} mb="xs">
                        Preview
                      </Text>
                      <Center>
                        <Image
                          src={screenshotPreview}
                          alt="Screenshot preview"
                          fit="contain"
                          style={{ maxHeight: '400px' }}
                        />
                      </Center>
                    </Paper>
                  )}

                  <Alert color="blue" title="AI Analysis Available" icon={<IconSparkles size={18} />}>
                    Click "Analyze with AI" to automatically extract text, title, description, and
                    relevant performance criteria from this screenshot.
                  </Alert>
                </>
              ) : (
                <>
                  <TextInput
                    label="Slack Link (Optional)"
                    placeholder="https://workspace.slack.com/archives/..."
                    description="Link to the Slack message or thread"
                    {...form.getInputProps('slackLink')}
                  />

                  <Textarea
                    label="Message Text"
                    required
                    placeholder="Paste the Slack message content here..."
                    description="Copy and paste the Slack message you want to add as evidence"
                    rows={8}
                    {...form.getInputProps('messageText')}
                  />

                  <Alert color="blue" title="AI Analysis Available" icon={<IconSparkles size={18} />}>
                    Click "Analyze with AI" to automatically extract a title, description, and
                    relevant performance criteria from this message.
                  </Alert>
                </>
              )}

              <Group justify="flex-end">
                <Button variant="default" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAnalyze}
                  loading={analyzing}
                  leftSection={<IconSparkles size={18} />}
                  disabled={
                    (inputMode === 'screenshot' && !screenshotFile) ||
                    (inputMode === 'text' && !form.values.messageText)
                  }
                >
                  Analyze with AI
                </Button>
                <Button onClick={() => setActiveStep(1)}>Skip to Manual Entry</Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Review" description="Review AI analysis">
            <Stack gap="md" mt="md">
              <TextInput
                label="Title"
                required
                placeholder="Brief title for this evidence"
                description="A short, descriptive title"
                {...form.getInputProps('title')}
              />

              <Textarea
                label="Description"
                required
                placeholder="Description of the achievement and impact"
                description="Explain the context and impact of this work"
                rows={4}
                {...form.getInputProps('description')}
              />

              {selectedCriteria.length > 0 && (
                <div>
                  <Text fw={600} size="sm" mb="sm">
                    Performance Criteria ({selectedCriteria.length})
                  </Text>
                  <Stack gap="sm">
                    {selectedCriteria.map((sc) => {
                      const criterion = criteria.find((c) => c.id === sc.criterionId);
                      if (!criterion) return null;

                      return (
                        <Paper key={sc.criterionId} withBorder p="md" radius="md">
                          <Stack gap="sm">
                            <Group justify="space-between">
                              <div style={{ flex: 1 }}>
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

                            {sc.explanation && (
                              <Text size="sm" c="dimmed">
                                <strong>AI Explanation:</strong> {sc.explanation}
                              </Text>
                            )}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </div>
              )}

              {selectedCriteria.length === 0 && (
                <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
                  No criteria were identified. You can add this evidence without criteria and
                  link them later.
                </Alert>
              )}

              <Group justify="space-between">
                <Button variant="default" onClick={() => setActiveStep(0)}>
                  Back
                </Button>
                <Button onClick={() => setActiveStep(2)}>
                  Continue to Review
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Confirm" description="Save evidence">
            <Stack gap="md" mt="md">
              <Paper withBorder p="md" radius="md">
                <Stack gap="xs">
                  <div>
                    <Badge color="green" mb="xs">
                      SLACK
                    </Badge>
                    <Text fw={600} size="lg">
                      {form.values.title}
                    </Text>
                  </div>
                  <Text size="sm">{form.values.description}</Text>
                  {form.values.slackLink && (
                    <Text size="xs" c="dimmed">
                      🔗 {form.values.slackLink}
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    🎯 {selectedCriteria.length} criteria linked
                  </Text>
                </Stack>
              </Paper>

              <Alert color="blue" title="Ready to Save">
                This evidence will be added to your performance review collection.
              </Alert>

              <Group justify="space-between">
                <Button variant="default" onClick={() => setActiveStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  loading={saving}
                  leftSection={<IconCheck size={18} />}
                >
                  Save Evidence
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>
        </Stepper>
      </Stack>
    </Modal>
  );
}
