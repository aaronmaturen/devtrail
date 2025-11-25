"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  SimpleGrid,
  Paper,
  Divider,
  Loader,
  Center,
  Menu,
} from "@mantine/core";
import {
  IconPlus,
  IconBrandGithub,
  IconMessage,
  IconFileText,
  IconEdit,
  IconChevronDown,
} from "@tabler/icons-react";
import SlackEvidenceModal from "@/components/SlackEvidenceModal";

type Evidence = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  timestamp: string;
  repository: string | null;
  prNumber: number | null;
  criteria: Array<{
    criterionId: number;
    confidence: number;
    criterion: {
      subarea: string;
      description: string;
    };
  }>;
  attachments: Array<any>;
};

type Stats = {
  github: number;
  slack: number;
  reviews: number;
  manual: number;
};

type Criterion = {
  id: number;
  subarea: string;
  description: string;
  areaOfConcentration: string;
};

export default function EvidencePage() {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [stats, setStats] = useState<Stats>({
    github: 0,
    slack: 0,
    reviews: 0,
    manual: 0,
  });
  const [loading, setLoading] = useState(true);
  const [slackModalOpened, setSlackModalOpened] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [evidenceResponse, criteriaResponse] = await Promise.all([
          fetch("/api/evidence?limit=50"),
          fetch("/api/criteria"),
        ]);

        const evidenceData = await evidenceResponse.json();
        const criteriaData = await criteriaResponse.json();

        setEvidence(evidenceData.evidence ?? []);
        setCriteria(criteriaData.criteria ?? []);

        // Use statistics from API response
        if (evidenceData.statistics) {
          setStats(evidenceData.statistics);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleSlackSuccess = () => {
    // Refresh evidence list
    fetch("/api/evidence?limit=50")
      .then((res) => res.json())
      .then((data) => {
        setEvidence(data.evidence ?? []);

        // Use statistics from API response
        if (data.statistics) {
          setStats(data.statistics);
        }
      })
      .catch((error) => console.error("Failed to refresh evidence:", error));
  };

  const typeConfig = {
    PR: {
      color: "brand",
      icon: IconBrandGithub,
      label: "GitHub PRs",
      statKey: "github" as keyof Stats,
    },
    SLACK: {
      color: "forest",
      icon: IconMessage,
      label: "Slack Messages",
      statKey: "slack" as keyof Stats,
    },
    REVIEW: {
      color: "moss",
      icon: IconFileText,
      label: "Reviews",
      statKey: "reviews" as keyof Stats,
    },
    MANUAL: {
      color: "bark",
      icon: IconEdit,
      label: "Manual",
      statKey: "manual" as keyof Stats,
    },
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: "50vh" }}>
          <Loader size="xl" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>Evidence</Title>
            <Text c="dimmed" size="sm">
              {stats.github + stats.slack + stats.reviews + stats.manual} total
              evidence entries
            </Text>
          </div>
          <Group>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button
                  leftSection={<IconPlus size={18} />}
                  rightSection={<IconChevronDown size={16} />}
                >
                  Add Evidence
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  component={Link}
                  href="/evidence/new"
                  leftSection={<IconEdit size={16} />}
                >
                  Manual Entry
                </Menu.Item>
                <Menu.Item
                  onClick={() => setSlackModalOpened(true)}
                  leftSection={<IconMessage size={16} />}
                >
                  Slack Message
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {/* Slack Evidence Modal */}
        <SlackEvidenceModal
          opened={slackModalOpened}
          onClose={() => setSlackModalOpened(false)}
          onSuccess={handleSlackSuccess}
          criteria={criteria}
        />

        {/* Stats Grid */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
          {Object.entries(typeConfig).map(([type, config]) => {
            const Icon = config.icon;
            const count = stats[config.statKey] || 0;
            return (
              <Paper key={type} withBorder p="md" radius="md">
                <Group>
                  <Icon
                    size={32}
                    color={`var(--mantine-color-${config.color}-6)`}
                  />
                  <div style={{ flex: 1 }}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      {config.label}
                    </Text>
                    <Text size="xl" fw={700}>
                      {count}
                    </Text>
                  </div>
                </Group>
              </Paper>
            );
          })}
        </SimpleGrid>

        {/* Evidence List */}
        <Stack gap="md">
          {evidence.length === 0 ? (
            <Card withBorder p="xl" radius="md">
              <Stack align="center" gap="sm">
                <Text c="dimmed">
                  No evidence found. Import data or add evidence manually.
                </Text>
                <Button
                  component={Link}
                  href="/evidence/new"
                  leftSection={<IconPlus size={18} />}
                  variant="light"
                >
                  Add your first evidence
                </Button>
              </Stack>
            </Card>
          ) : (
            evidence.map((item) => {
              const config = typeConfig[item.type as keyof typeof typeConfig];
              return (
                <Card
                  key={item.id}
                  component={Link}
                  href={`/evidence/${item.id}`}
                  withBorder
                  padding="lg"
                  radius="md"
                  style={{ cursor: "pointer" }}
                  styles={{
                    root: {
                      transition: "transform 0.2s, box-shadow 0.2s",
                      "&:hover": {
                        transform: "translateY(-2px)",
                        boxShadow: "var(--mantine-shadow-md)",
                      },
                    },
                  }}
                >
                  <Stack gap="sm">
                    {/* Header */}
                    <Group justify="space-between">
                      <Group>
                        <Badge color={config.color} variant="light">
                          {item.type}
                        </Badge>
                        <Text fw={600} size="lg">
                          {item.title}
                        </Text>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {format(new Date(item.timestamp), "MMM d, yyyy")}
                      </Text>
                    </Group>

                    {/* Description */}
                    {item.description && (
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {item.description}
                      </Text>
                    )}

                    {/* Metadata */}
                    <Group gap="md">
                      {item.repository && (
                        <Text size="xs" c="dimmed">
                          📦 {item.repository}
                          {item.prNumber && `#${item.prNumber}`}
                        </Text>
                      )}
                      {item.criteria.length > 0 && (
                        <Text size="xs" c="dimmed">
                          🎯 {item.criteria.length} criteria
                        </Text>
                      )}
                      {item.attachments.length > 0 && (
                        <Text size="xs" c="dimmed">
                          📎 {item.attachments.length} files
                        </Text>
                      )}
                    </Group>

                    {/* Criteria Tags */}
                    {item.criteria.length > 0 && (
                      <>
                        <Divider />
                        <Group gap="xs">
                          {item.criteria.slice(0, 3).map((ec) => (
                            <Badge
                              key={ec.criterionId}
                              size="sm"
                              variant="dot"
                              color="gray"
                              title={ec.criterion.description}
                            >
                              {ec.criterion.subarea} (
                              {Math.round(ec.confidence)}%)
                            </Badge>
                          ))}
                          {item.criteria.length > 3 && (
                            <Badge size="sm" variant="light" color="gray">
                              +{item.criteria.length - 3} more
                            </Badge>
                          )}
                        </Group>
                      </>
                    )}
                  </Stack>
                </Card>
              );
            })
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
