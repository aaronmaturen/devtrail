'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Tabs,
  NumberInput,
  MultiSelect,
  Progress,
  Badge,
  Alert,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconArrowLeft, IconDeviceFloppy, IconSparkles, IconEdit } from '@tabler/icons-react';
import { JobStatus } from '@/components/JobStatus';

const CATEGORIES = [
  { value: 'DEVELOPMENT', label: 'Development' },
  { value: 'LEADERSHIP', label: 'Leadership' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'INFLUENCE', label: 'Influence' },
  { value: 'BUSINESS', label: 'Business' },
];

const PRIORITIES = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function NewGoalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string | null>('manual');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'DEVELOPMENT',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    specific: '',
    measurable: '',
    achievable: '',
    relevant: '',
    timeBound: '',
    startDate: new Date(),
    targetDate: null as Date | null,
  });

  // AI Generation state
  const [aiConfig, setAiConfig] = useState({
    count: 3,
    timeframe: 6,
    focusAreas: [] as string[],
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.description || !formData.targetDate) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const goal = await response.json();
        router.push(`/goals/${goal.id}`);
      } else {
        const error = await response.json();
        alert(`Failed to create goal: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to create goal:', error);
      alert('Failed to create goal');
    } finally {
      setSaving(false);
    }
  };

  const handleAIGenerate = async () => {
    if (aiConfig.focusAreas.length === 0) {
      alert('Please select at least one focus area');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('/api/goals/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count: aiConfig.count,
          timeframeMonths: aiConfig.timeframe,
          focusAreas: aiConfig.focusAreas,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setJobId(data.jobId);
      } else {
        const error = await response.json();
        alert(`Failed to generate goals: ${error.error}`);
        setGenerating(false);
      }
    } catch (error) {
      console.error('Failed to generate goals:', error);
      alert('Failed to generate goals');
      setGenerating(false);
    }
  };

  const handleJobComplete = () => {
    router.push('/goals');
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>New Goal</Title>
            <Text c="dimmed" size="sm">
              Create a new SMART career goal manually or use AI to generate goals
            </Text>
          </div>
          <Button
            component={Link}
            href="/goals"
            variant="subtle"
            leftSection={<IconArrowLeft size={18} />}
          >
            Cancel
          </Button>
        </Group>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="manual" leftSection={<IconEdit size={18} />}>
              Manual Entry
            </Tabs.Tab>
            <Tabs.Tab value="ai" leftSection={<IconSparkles size={18} />}>
              AI Generate
            </Tabs.Tab>
          </Tabs.List>

          {/* Manual Entry Tab */}
          <Tabs.Panel value="manual" pt="lg">
            <form onSubmit={handleSubmit}>
          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              {/* Basic Info */}
              <TextInput
                label="Title"
                placeholder="e.g., Master React Server Components"
                required
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />

              <Textarea
                label="Description"
                placeholder="Describe your goal in detail..."
                required
                minRows={3}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />

              <Group grow>
                <Select
                  label="Category"
                  data={CATEGORIES}
                  value={formData.category}
                  onChange={(value) =>
                    setFormData({ ...formData, category: value || 'DEVELOPMENT' })
                  }
                />

                <Select
                  label="Priority"
                  data={PRIORITIES}
                  value={formData.priority}
                  onChange={(value) =>
                    setFormData({ ...formData, priority: value || 'MEDIUM' })
                  }
                />

                <Select
                  label="Status"
                  data={STATUSES}
                  value={formData.status}
                  onChange={(value) =>
                    setFormData({ ...formData, status: value || 'ACTIVE' })
                  }
                />
              </Group>

              {/* Dates */}
              <Group grow>
                <DatePickerInput
                  label="Start Date"
                  placeholder="Pick start date"
                  value={formData.startDate}
                  onChange={(value) =>
                    setFormData({ ...formData, startDate: value || new Date() })
                  }
                />

                <DatePickerInput
                  label="Target Date"
                  placeholder="Pick target date"
                  required
                  value={formData.targetDate}
                  onChange={(value) =>
                    setFormData({ ...formData, targetDate: value })
                  }
                  minDate={new Date()}
                />
              </Group>

              {/* SMART Criteria */}
              <Title order={4} mt="md">
                SMART Criteria (Optional)
              </Title>

              <Textarea
                label="Specific"
                placeholder="What specifically will be accomplished?"
                minRows={2}
                value={formData.specific}
                onChange={(e) =>
                  setFormData({ ...formData, specific: e.target.value })
                }
              />

              <Textarea
                label="Measurable"
                placeholder="How will progress be measured?"
                minRows={2}
                value={formData.measurable}
                onChange={(e) =>
                  setFormData({ ...formData, measurable: e.target.value })
                }
              />

              <Textarea
                label="Achievable"
                placeholder="Why is this goal achievable?"
                minRows={2}
                value={formData.achievable}
                onChange={(e) =>
                  setFormData({ ...formData, achievable: e.target.value })
                }
              />

              <Textarea
                label="Relevant"
                placeholder="How does this align with career/org needs?"
                minRows={2}
                value={formData.relevant}
                onChange={(e) =>
                  setFormData({ ...formData, relevant: e.target.value })
                }
              />

              <Textarea
                label="Time-Bound"
                placeholder="What is the timeline and deadline?"
                minRows={2}
                value={formData.timeBound}
                onChange={(e) =>
                  setFormData({ ...formData, timeBound: e.target.value })
                }
              />

              {/* Actions */}
              <Group justify="flex-end" mt="md">
                <Button
                  component={Link}
                  href="/goals"
                  variant="subtle"
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  leftSection={<IconDeviceFloppy size={18} />}
                  loading={saving}
                >
                  Create Goal
                </Button>
              </Group>
            </Stack>
          </Card>
        </form>
          </Tabs.Panel>

          {/* AI Generate Tab */}
          <Tabs.Panel value="ai" pt="lg">
            <Card withBorder padding="lg" radius="md">
              <Stack gap="lg">
                <Alert color="blue" title="AI-Powered Goal Generation">
                  Analyze your evidence and generate SMART career goals tailored to your experience and growth areas.
                </Alert>

                {!jobId ? (
                  <>
                    <NumberInput
                      label="Number of Goals"
                      description="How many goals would you like to generate?"
                      min={3}
                      max={5}
                      value={aiConfig.count}
                      onChange={(value) =>
                        setAiConfig({ ...aiConfig, count: value as number })
                      }
                    />

                    <Select
                      label="Timeframe"
                      description="What timeframe should these goals target?"
                      data={[
                        { value: '3', label: '3 months (quarterly)' },
                        { value: '6', label: '6 months (bi-annual)' },
                        { value: '12', label: '12 months (annual)' },
                      ]}
                      value={aiConfig.timeframe.toString()}
                      onChange={(value) =>
                        setAiConfig({ ...aiConfig, timeframe: parseInt(value || '6') })
                      }
                    />

                    <MultiSelect
                      label="Focus Areas"
                      description="Select one or more areas to focus on"
                      data={CATEGORIES}
                      value={aiConfig.focusAreas}
                      onChange={(value) =>
                        setAiConfig({ ...aiConfig, focusAreas: value })
                      }
                      searchable
                      clearable
                    />

                    <Group justify="flex-end" mt="md">
                      <Button
                        variant="subtle"
                        component={Link}
                        href="/goals"
                        disabled={generating}
                      >
                        Cancel
                      </Button>
                      <Button
                        leftSection={<IconSparkles size={18} />}
                        onClick={handleAIGenerate}
                        loading={generating}
                      >
                        Generate Goals with AI
                      </Button>
                    </Group>
                  </>
                ) : (
                  <JobStatus
                    jobId={jobId}
                    onComplete={handleJobComplete}
                    onError={() => setGenerating(false)}
                  />
                )}
              </Stack>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
