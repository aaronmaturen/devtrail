'use client';

import { useState } from 'react';
import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Select,
  Stack,
  Group,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconPlus } from '@tabler/icons-react';

type MilestoneFormProps = {
  goalId: string;
  onSuccess: () => void;
};

export function MilestoneForm({ goalId, onSuccess }: MilestoneFormProps) {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [status, setStatus] = useState<string>('PENDING');

  const handleSubmit = async () => {
    if (!title || !targetDate) {
      alert('Title and target date are required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/goals/${goalId}/milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: description.trim() || null,
          targetDate: targetDate.toISOString(),
          status,
        }),
      });

      if (response.ok) {
        setOpened(false);
        setTitle('');
        setDescription('');
        setTargetDate(null);
        setStatus('PENDING');
        onSuccess();
      } else {
        alert('Failed to add milestone');
      }
    } catch (error) {
      console.error('Failed to add milestone:', error);
      alert('Failed to add milestone');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        leftSection={<IconPlus size={18} />}
        onClick={() => setOpened(true)}
        variant="light"
      >
        Add Milestone
      </Button>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Add Milestone"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Milestone Title"
            placeholder="What needs to be accomplished?"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
          />

          <Textarea
            label="Description"
            placeholder="Provide additional details about this milestone"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={3}
            maxRows={6}
          />

          <DateInput
            label="Target Date"
            placeholder="When should this be completed?"
            value={targetDate}
            onChange={setTargetDate}
            required
          />

          <Select
            label="Status"
            value={status}
            onChange={(value) => setStatus(value || 'PENDING')}
            data={[
              { value: 'PENDING', label: 'Pending' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'BLOCKED', label: 'Blocked' },
            ]}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={loading}>
              Add Milestone
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
