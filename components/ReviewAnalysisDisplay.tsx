'use client';

import {
  Card,
  Group,
  Stack,
  Title,
  Text,
  Badge,
  Button,
  Progress,
} from '@mantine/core';

interface ReviewAnalysis {
  id: string;
  title: string;
  year?: string;
  reviewType: string;
  source?: string;
  summary: string;
  themes: string[];
  strengths: string[];
  growthAreas: string[];
  achievements: string[];
  confidenceScore?: number;
  createdAt: string;
}

interface ReviewAnalysisDisplayProps {
  analysis: ReviewAnalysis;
  onEdit?: (analysis: ReviewAnalysis) => void;
  onDelete?: (id: string) => void;
}

export default function ReviewAnalysisDisplay({
  analysis,
  onEdit,
  onDelete,
}: ReviewAnalysisDisplayProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Card withBorder shadow="sm" padding="lg">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs">
            <Title order={3}>{analysis.title}</Title>
            <Group gap="xs">
              {analysis.year && (
                <Badge color="brand" variant="light">
                  {analysis.year}
                </Badge>
              )}
              <Badge color="gray" variant="light">
                {analysis.reviewType}
              </Badge>
              {analysis.source && (
                <Badge color="moss" variant="light">
                  {analysis.source}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              Analyzed on {formatDate(analysis.createdAt)}
            </Text>
          </Stack>

          <Group gap="xs">
            {onEdit && (
              <Button
                variant="light"
                color="brand"
                size="compact-sm"
                onClick={() => onEdit(analysis)}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="light"
                color="red"
                size="compact-sm"
                onClick={() => onDelete(analysis.id)}
              >
                Delete
              </Button>
            )}
          </Group>
        </Group>

        {/* Confidence Score */}
        {analysis.confidenceScore !== undefined && (
          <Stack gap="xs">
            <Group gap="xs">
              <Text size="sm" fw={500}>Confidence:</Text>
              <Text size="sm" c="dimmed">{analysis.confidenceScore}%</Text>
            </Group>
            <Progress value={analysis.confidenceScore} color="green" size="sm" />
          </Stack>
        )}

        {/* Summary */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed">Summary</Text>
          <Text>{analysis.summary}</Text>
        </Stack>

        {/* Themes */}
        {analysis.themes?.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">Key Themes</Text>
            <Group gap="xs">
              {analysis.themes.map((theme, idx) => (
                <Badge key={idx} color="forest" variant="light" radius="xl">
                  {theme}
                </Badge>
              ))}
            </Group>
          </Stack>
        )}

        {/* Strengths */}
        {analysis.strengths?.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">Strengths</Text>
            <Stack gap="xs">
              {analysis.strengths.map((strength, idx) => (
                <Group key={idx} gap="xs" align="flex-start">
                  <Text c="brand.6" style={{ marginTop: '2px' }}>✓</Text>
                  <Text style={{ flex: 1 }}>{strength}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        )}

        {/* Achievements */}
        {analysis.achievements?.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">Key Achievements</Text>
            <Stack gap="xs">
              {analysis.achievements.map((achievement, idx) => (
                <Group key={idx} gap="xs" align="flex-start">
                  <Text c="brand.6" style={{ marginTop: '2px' }}>★</Text>
                  <Text style={{ flex: 1 }}>{achievement}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        )}

        {/* Growth Areas */}
        {analysis.growthAreas?.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">Growth Areas</Text>
            <Stack gap="xs">
              {analysis.growthAreas.map((area, idx) => (
                <Group key={idx} gap="xs" align="flex-start">
                  <Text c="bark.6" style={{ marginTop: '2px' }}>→</Text>
                  <Text style={{ flex: 1 }}>{area}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
