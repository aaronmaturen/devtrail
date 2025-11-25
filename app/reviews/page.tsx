'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Stack,
  Center,
  Loader,
  Alert,
} from '@mantine/core';
import { IconFileAnalytics } from '@tabler/icons-react';
import ReviewAnalysisForm from '@/components/ReviewAnalysisForm';
import ReviewAnalysisDisplay from '@/components/ReviewAnalysisDisplay';

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

export default function ReviewsPage() {
  const [analyses, setAnalyses] = useState<ReviewAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Fetch analyses on mount
  useEffect(() => {
    fetchAnalyses();
  }, []);

  const fetchAnalyses = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/reviews');
      if (!response.ok) {
        throw new Error('Failed to fetch analyses');
      }

      const data = await response.json();
      setAnalyses(data.analyses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalysisComplete = (newAnalysis: ReviewAnalysis) => {
    setAnalyses([newAnalysis, ...analyses]);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) {
      return;
    }

    try {
      const response = await fetch(`/api/reviews/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete analysis');
      }

      setAnalyses(analyses.filter((a) => a.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <Container size="xl" py="xl" style={{ minHeight: '100vh' }}>
      <Stack gap="lg">
        {/* Header */}
        <Stack gap="xs">
          <Title order={1}>Review Analysis</Title>
          <Text c="dimmed">
            Analyze performance reviews with AI to extract insights, themes, strengths, and growth areas.
          </Text>
        </Stack>

        {/* Add New Button */}
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Analyze New Review'}
        </Button>

        {/* Form */}
        {showForm && (
          <Card withBorder shadow="sm" p="lg">
            <ReviewAnalysisForm onAnalysisComplete={handleAnalysisComplete} />
          </Card>
        )}

        {/* Error */}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {/* Loading */}
        {isLoading && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <Loader size="xl" />
              <Text c="dimmed">Loading analyses...</Text>
            </Stack>
          </Center>
        )}

        {/* Empty State */}
        {!isLoading && analyses.length === 0 && (
          <Center py="xl">
            <Stack align="center" gap="md">
              <IconFileAnalytics size={64} color="gray" stroke={1.5} />
              <Title order={3} c="dimmed">
                No Review Analyses Yet
              </Title>
              <Text c="dimmed">
                Analyze your first performance review to get started.
              </Text>
              <Button onClick={() => setShowForm(true)}>
                Analyze Your First Review
              </Button>
            </Stack>
          </Center>
        )}

        {/* Analyses List */}
        {!isLoading && analyses.length > 0 && (
          <Stack gap="md">
            <Title order={2}>
              {analyses.length} {analyses.length === 1 ? 'Analysis' : 'Analyses'}
            </Title>
            {analyses.map((analysis) => (
              <ReviewAnalysisDisplay
                key={analysis.id}
                analysis={analysis}
                onDelete={handleDelete}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
