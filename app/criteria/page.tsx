'use client';

import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Badge,
  Accordion,
  Loader,
  Center,
  Button,
  TextInput,
  Textarea,
  Checkbox,
  Select,
  Modal,
  Table,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconListCheck,
  IconAlertCircle,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
} from '@tabler/icons-react';

type Criterion = {
  id: number;
  areaOfConcentration: string;
  subarea: string;
  description: string;
  prDetectable: boolean;
  _count?: {
    evidenceCriteria: number;
  };
};

export default function CriteriaPage() {
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Criterion[]>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpened, setModalOpened] = useState(false);
  const [editing, setEditing] = useState<Criterion | null>(null);

  const form = useForm({
    initialValues: {
      areaOfConcentration: '',
      subarea: '',
      description: '',
      prDetectable: true,
    },
    validate: {
      areaOfConcentration: (value) => (value ? null : 'Required'),
      subarea: (value) => (value ? null : 'Required'),
      description: (value) => (value ? null : 'Required'),
    },
  });

  const fetchCriteria = async () => {
    try {
      const response = await fetch('/api/criteria');
      const data = await response.json();
      setCriteria(data.criteria);
      setGrouped(data.grouped);
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
  };

  useEffect(() => {
    fetchCriteria();
  }, []);

  const handleSubmit = async (values: typeof form.values) => {
    try {
      const response = await fetch('/api/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to create criterion');
      }

      notifications.show({
        title: 'Success',
        message: 'Criterion created successfully',
        color: 'green',
      });

      form.reset();
      setModalOpened(false);
      fetchCriteria();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create criterion',
        color: 'red',
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this criterion?')) {
      return;
    }

    try {
      const response = await fetch(`/api/criteria/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete criterion');
      }

      notifications.show({
        title: 'Success',
        message: 'Criterion deleted successfully',
        color: 'green',
      });

      fetchCriteria();
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete criterion',
        color: 'red',
      });
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

  const areas = Object.keys(grouped);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>Performance Review Criteria</Title>
            <Text c="dimmed" mt="xs">
              View and manage the {criteria.length} criteria used for evaluating PRs and evidence
            </Text>
          </div>
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setModalOpened(true)}
          >
            Add Criterion
          </Button>
        </Group>

        {/* Stats Cards */}
        <Group>
          <Card withBorder padding="md" radius="md" style={{ flex: 1 }}>
            <Text size="sm" c="dimmed" tt="uppercase" fw={700}>
              Total Criteria
            </Text>
            <Text size="xl" fw={700} mt="xs">
              {criteria.length}
            </Text>
          </Card>
          <Card withBorder padding="md" radius="md" style={{ flex: 1 }}>
            <Text size="sm" c="dimmed" tt="uppercase" fw={700}>
              PR Detectable
            </Text>
            <Text size="xl" fw={700} mt="xs">
              {criteria.filter((c) => c.prDetectable).length}
            </Text>
          </Card>
          <Card withBorder padding="md" radius="md" style={{ flex: 1 }}>
            <Text size="sm" c="dimmed" tt="uppercase" fw={700}>
              Areas of Focus
            </Text>
            <Text size="xl" fw={700} mt="xs">
              {areas.length}
            </Text>
          </Card>
        </Group>

        {/* Criteria Grouped by Area */}
        <Accordion variant="separated" multiple defaultValue={areas}>
          {areas.map((area) => (
            <Accordion.Item key={area} value={area}>
              <Accordion.Control>
                <Group>
                  <Text fw={600}>{area}</Text>
                  <Badge size="sm" variant="light">
                    {grouped[area].length} criteria
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Subarea</Table.Th>
                      <Table.Th>Description</Table.Th>
                      <Table.Th>PR Detectable</Table.Th>
                      <Table.Th>Evidence Count</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {grouped[area].map((criterion) => (
                      <Table.Tr key={criterion.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {criterion.subarea}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={2}>
                            {criterion.description}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {criterion.prDetectable ? (
                            <Badge color="green" variant="light" leftSection={<IconCheck size={14} />}>
                              Yes
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="light" leftSection={<IconX size={14} />}>
                              No
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light">
                            {criterion._count?.evidenceCriteria || 0}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              color="red"
                              onClick={() => handleDelete(criterion.id)}
                              disabled={(criterion._count?.evidenceCriteria || 0) > 0}
                            >
                              <IconTrash size={14} />
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>

        {/* Add Criterion Modal */}
        <Modal
          opened={modalOpened}
          onClose={() => {
            setModalOpened(false);
            form.reset();
          }}
          title="Add New Criterion"
          size="lg"
        >
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack>
              <TextInput
                label="Area of Concentration"
                placeholder="e.g., Engineering Experience, Delivery"
                required
                {...form.getInputProps('areaOfConcentration')}
              />
              <TextInput
                label="Subarea"
                placeholder="e.g., Quality & testing, Project management"
                required
                {...form.getInputProps('subarea')}
              />
              <Textarea
                label="Description"
                placeholder="Detailed description of this criterion..."
                required
                minRows={4}
                {...form.getInputProps('description')}
              />
              <Checkbox
                label="PR Detectable (can be identified in pull requests)"
                {...form.getInputProps('prDetectable', { type: 'checkbox' })}
              />
              <Group justify="flex-end" mt="md">
                <Button
                  variant="subtle"
                  onClick={() => {
                    setModalOpened(false);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" leftSection={<IconPlus size={18} />}>
                  Create Criterion
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      </Stack>
    </Container>
  );
}
