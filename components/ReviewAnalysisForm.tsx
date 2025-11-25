'use client';

import { useState } from 'react';
import {
  Stack,
  Title,
  Text,
  TextInput,
  Textarea,
  Select,
  Button,
  Alert,
  FileInput,
  SimpleGrid,
} from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';

interface ReviewAnalysisFormProps {
  onAnalysisComplete?: (analysis: any) => void;
}

export default function ReviewAnalysisForm({ onAnalysisComplete }: ReviewAnalysisFormProps) {
  const [reviewText, setReviewText] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [reviewType, setReviewType] = useState('EMPLOYEE');
  const [source, setSource] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!reviewText.trim() || !title.trim()) {
      setError('Please provide both a title and review text');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/reviews/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reviewText,
          title,
          year: year || null,
          reviewType,
          source: source || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze review');
      }

      const analysis = await response.json();

      // Clear form
      setReviewText('');
      setTitle('');
      setYear('');
      setSource('');

      // Notify parent
      if (onAnalysisComplete) {
        onAnalysisComplete(analysis);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;

    // Only accept markdown and text files
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
      setError('Please upload a .md or .txt file');
      return;
    }

    try {
      const text = await file.text();
      setReviewText(text);

      // Try to extract title from filename
      if (!title) {
        const filename = file.name.replace(/\.(md|txt)$/, '');
        setTitle(filename.replace(/_/g, ' '));
      }

      // Try to extract year from filename (e.g., "2024" or "2024-mid")
      const yearMatch = file.name.match(/(\d{4}(-mid)?)/);
      if (yearMatch && !year) {
        setYear(yearMatch[1]);
      }

      setError(null);
    } catch (err) {
      setError('Failed to read file');
    }
  };

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Title order={3}>Analyze Performance Review</Title>
        <Text size="sm" c="dimmed">
          Upload or paste a performance review document to extract key insights, themes, strengths, and growth areas using AI.
        </Text>
      </Stack>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

      <FileInput
        label="Upload Review File (Optional)"
        placeholder="Choose .md or .txt file"
        accept=".md,.txt"
        leftSection={<IconUpload size={16} />}
        onChange={handleFileUpload}
      />

      <SimpleGrid cols={2}>
        <TextInput
          label="Review Title"
          placeholder="e.g., 2024 Mid-Year Review"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          withAsterisk
        />

        <TextInput
          label="Year/Period"
          placeholder="e.g., 2024 or 2024-mid"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </SimpleGrid>

      <SimpleGrid cols={2}>
        <Select
          label="Review Type"
          value={reviewType}
          onChange={(value) => setReviewType(value || 'EMPLOYEE')}
          data={[
            { value: 'EMPLOYEE', label: 'Employee Self-Review' },
            { value: 'MANAGER', label: 'Manager Review' },
            { value: 'PEER', label: 'Peer Review' },
            { value: 'SELF', label: 'Self-Assessment' },
          ]}
        />

        <TextInput
          label="Source (Optional)"
          placeholder="e.g., Lattice, BambooHR"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </SimpleGrid>

      <Stack gap="xs">
        <Textarea
          label="Review Text"
          placeholder="Paste your performance review text here..."
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          rows={12}
          required
          withAsterisk
          styles={{
            input: {
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            },
          }}
        />
        <Text size="xs" c="dimmed">
          {reviewText.length} characters
        </Text>
      </Stack>

      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing || !reviewText.trim() || !title.trim()}
        loading={isAnalyzing}
        fullWidth
        size="md"
      >
        {isAnalyzing ? 'Analyzing with AI...' : 'Analyze Review'}
      </Button>
    </Stack>
  );
}
