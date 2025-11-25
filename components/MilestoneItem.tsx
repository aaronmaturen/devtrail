'use client';

import { useState } from 'react';
import {
  Card,
  Text,
  Badge,
  Group,
  ActionIcon,
  Menu,
  Modal,
  Button,
  TextInput,
  Textarea,
  Select,
  Stack,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconDots, IconEdit, IconTrash, IconCheck } from '@tabler/icons-react';
import { format } from 'date-fns';

type Milestone = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetDate: string;
  completedDate: string | null;
};

type MilestoneItemProps = {
  milestone: Milestone;
  goalId: string;
  onUpdate: () => void;
};

const MILESTONE_STATUS_CONFIG = {
  PENDING: { color: 'gray', label: 'Pending' },
  IN_PROGRESS: { color: 'blue', label: 'In Progress' },
  COMPLETED: { color: 'green', label: 'Completed' },
  BLOCKED: { color: 'red', label: 'Blocked' },
};

export function MilestoneItem({ milestone, goalId, onUpdate }: MilestoneItemProps) {
  const [editOpened, setEditOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description || '');
  const [targetDate, setTargetDate] = useState<Date>(new Date(milestone.targetDate));
  const [status, setStatus] = useState(milestone.status);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/goals/${goalId}/milestones/${milestone.id}`, {
        method: 'PATCH',
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
        setEditOpened(false);
        onUpdate();
      } else {
        alert('Failed to update milestone');
      }
    } catch (error) {
      console.error('Failed to update milestone:', error);
      alert('Failed to update milestone');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this milestone?')) {
      return;
    }

    try {
      const response = await fetch(`/api/goals/${goalId}/milestones/${milestone.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onUpdate();
      } else {
        alert('Failed to delete milestone');
      }
    } catch (error) {
      console.error('Failed to delete milestone:', error);
      alert('Failed to delete milestone');
    }
  };

  const handleMarkComplete = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/goals/${goalId}/milestones/${milestone.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'COMPLETED',
        }),
      });

      if (response.ok) {
        onUpdate();
      } else {
        alert('Failed to mark milestone as complete');
      }
    } catch (error) {
      console.error('Failed to mark milestone as complete:', error);
      alert('Failed to mark milestone as complete');
    } finally {
      setLoading(false);
    }
  };

  const statusConfig =
    MILESTONE_STATUS_CONFIG[milestone.status as keyof typeof MILESTONE_STATUS_CONFIG];

  return (
    <>
      <Card withBorder padding="md" radius="md">
        <Group justify="space-between" align="flex-start">
          <div style={{ flex: 1 }}>
            <Group mb="xs">
              <Text fw={600} size="sm">
                {milestone.title}
              </Text>
              <Badge color={statusConfig.color} size="sm" variant="light">
                {statusConfig.label}
              </Badge>
            </Group>

            {milestone.description && (
              <Text size="sm" c="dimmed" mb="xs">
                {milestone.description}
              </Text>
            )}

            <Group gap="lg">
              <Text size="xs" c="dimmed">
                Target: {format(new Date(milestone.targetDate), 'MMM d, yyyy')}
              </Text>
              {milestone.completedDate && (
                <Text size="xs" c="green">
                  Completed: {format(new Date(milestone.completedDate), 'MMM d, yyyy')}
                </Text>
              )}
            </Group>
          </div>

          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" size="sm">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {milestone.status !== 'COMPLETED' && (
                <Menu.Item
                  leftSection={<IconCheck size={16} />}
                  onClick={handleMarkComplete}
                  disabled={loading}
                >
                  Mark Complete
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<IconEdit size={16} />}
                onClick={() => setEditOpened(true)}
              >
                Edit
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleDelete}
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Card>

      <Modal
        opened={editOpened}
        onClose={() => setEditOpened(false)}
        title="Edit Milestone"
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
            onChange={(date) => setTargetDate(date || new Date())}
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
            <Button variant="subtle" onClick={() => setEditOpened(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={loading}>
              Update Milestone
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
