'use client';

import { useEffect, useState } from 'react';
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
  Loader,
  Center,
  Alert,
  NumberInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconArrowLeft, IconDeviceFloppy, IconAlertCircle } from '@tabler/icons-react';

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

export default function EditGoalPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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
    progressPercent: 0,
    startDate: new Date(),
    targetDate: null as Date | null,
    completedDate: null as Date | null,
  });

  useEffect(() => {
    async function fetchGoal() {
      try {
        const response = await fetch(`/api/goals/${params.id}`);
        if (response.ok) {
          const goal = await response.json();
          setFormData({
            title: goal.title,
            description: goal.description,
            category: goal.category,
            priority: goal.priority,
            status: goal.status,
            specific: goal.specific || '',
            measurable: goal.measurable || '',
            achievable: goal.achievable || '',
            relevant: goal.relevant || '',
            timeBound: goal.timeBound || '',
            progressPercent: goal.progressPercent,
            startDate: new Date(goal.startDate),
            targetDate: new Date(goal.targetDate),
            completedDate: goal.completedDate ? new Date(goal.completedDate) : null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch goal:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchGoal();
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.description || !formData.targetDate) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/goals/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push(`/goals/${params.id}`);
      } else {
        const error = await response.json();
        alert(`Failed to update goal: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to update goal:', error);
      alert('Failed to update goal');
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

  if (!formData.title) {
    return (
      <Container size="md" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} title="Not Found" color="red">
          Goal not found.
        </Alert>
        <Button component={Link} href="/goals" mt="md" leftSection={<IconArrowLeft size={18} />}>
          Back to Goals
        </Button>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>Edit Goal</Title>
            <Text c="dimmed" size="sm">
              Update your goal details
            </Text>
          </div>
          <Button
            component={Link}
            href={`/goals/${params.id}`}
            variant="subtle"
            leftSection={<IconArrowLeft size={18} />}
          >
            Cancel
          </Button>
        </Group>

        {/* Form */}
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

              {/* Progress */}
              <NumberInput
                label="Progress"
                placeholder="0-100"
                min={0}
                max={100}
                suffix="%"
                value={formData.progressPercent}
                onChange={(value) =>
                  setFormData({ ...formData, progressPercent: Number(value) || 0 })
                }
              />

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
                />

                <DatePickerInput
                  label="Completed Date"
                  placeholder="Pick completion date"
                  value={formData.completedDate}
                  onChange={(value) =>
                    setFormData({ ...formData, completedDate: value })
                  }
                  clearable
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
                  href={`/goals/${params.id}`}
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
                  Save Changes
                </Button>
              </Group>
            </Stack>
          </Card>
        </form>
      </Stack>
    </Container>
  );
}
