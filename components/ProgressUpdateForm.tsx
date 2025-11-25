'use client';

import { useState } from 'react';
import {
  Modal,
  Button,
  TextInput,
  Textarea,
  NumberInput,
  Stack,
  Group,
  Text,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

type ProgressUpdateFormProps = {
  goalId: string;
  currentProgress: number;
  onSuccess: () => void;
};

export function ProgressUpdateForm({
  goalId,
  currentProgress,
  onSuccess,
}: ProgressUpdateFormProps) {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(currentProgress);
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/goals/${goalId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          progressPercent,
          notes: notes.trim() || null,
        }),
      });

      if (response.ok) {
        setOpened(false);
        setNotes('');
        setProgressPercent(currentProgress);
        onSuccess();
      } else {
        alert('Failed to add progress update');
      }
    } catch (error) {
      console.error('Failed to add progress update:', error);
      alert('Failed to add progress update');
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
        Add Progress Update
      </Button>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Add Progress Update"
        size="md"
      >
        <Stack gap="md">
          <NumberInput
            label="Progress Percentage"
            description="Update the current progress for this goal"
            value={progressPercent}
            onChange={(value) => setProgressPercent(Number(value))}
            min={0}
            max={100}
            suffix="%"
            required
          />

          <Textarea
            label="Progress Notes"
            description="Describe what you've accomplished and any challenges"
            placeholder="What progress have you made toward this goal?"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            minRows={4}
            maxRows={8}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={loading}>
              Add Update
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
