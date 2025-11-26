'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Paper, Text, Box, useMantineColorScheme } from '@mantine/core';
import { MarkdownRenderer } from './MarkdownRenderer';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

// Dynamically import to avoid SSR issues
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  previewBg?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Enter content...',
  minHeight = 150,
  label,
  onBlur,
  onFocus,
  autoFocus = false,
  previewBg = 'gray',
}: MarkdownEditorProps) {
  const [isEditing, setIsEditing] = useState(autoFocus);
  const { colorScheme } = useMantineColorScheme();

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    onBlur?.();
  }, [onBlur]);

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val || '');
    },
    [onChange]
  );

  if (!isEditing) {
    // View mode - show rendered markdown
    return (
      <Box>
        {label && (
          <Text size="xs" fw={600} c="dimmed" mb={4}>
            {label}
          </Text>
        )}
        <Paper
          p="sm"
          bg={`${previewBg}.0`}
          radius="sm"
          onClick={handleFocus}
          style={{ cursor: 'pointer', minHeight: minHeight / 2 }}
        >
          {value ? (
            <MarkdownRenderer content={value} />
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              {placeholder}
            </Text>
          )}
        </Paper>
      </Box>
    );
  }

  // Edit mode - show markdown editor with toolbar
  return (
    <Box data-color-mode={colorScheme}>
      {label && (
        <Text size="xs" fw={600} c="dimmed" mb={4}>
          {label}
        </Text>
      )}
      <MDEditor
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        preview="edit"
        height={minHeight}
        textareaProps={{
          placeholder,
          autoFocus: true,
        }}
        style={{
          borderRadius: '8px',
        }}
      />
      <Text size="xs" c="dimmed" mt={4}>
        Click outside to preview
      </Text>
    </Box>
  );
}

// Simpler inline variant for single-line prompts
interface InlineMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSave?: () => void;
  previewBg?: string;
  label?: string;
}

export function InlineMarkdownEditor({
  value,
  onChange,
  placeholder = 'Click to edit...',
  onSave,
  previewBg = 'violet',
  label,
}: InlineMarkdownEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { colorScheme } = useMantineColorScheme();

  const handleFocus = () => setIsEditing(true);

  const handleBlur = () => {
    setIsEditing(false);
    onSave?.();
  };

  if (!isEditing) {
    return (
      <Box>
        {label && (
          <Text size="xs" fw={600} c="dimmed" mb={4}>
            {label}
          </Text>
        )}
        <Paper
          p="sm"
          bg={`${previewBg}.0`}
          radius="sm"
          onClick={handleFocus}
          style={{ cursor: 'pointer' }}
        >
          {value ? (
            <Text size="sm">{value}</Text>
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              {placeholder}
            </Text>
          )}
        </Paper>
      </Box>
    );
  }

  return (
    <Box data-color-mode={colorScheme}>
      {label && (
        <Text size="xs" fw={600} c="dimmed" mb={4}>
          {label}
        </Text>
      )}
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        onBlur={handleBlur}
        preview="edit"
        height={100}
        hideToolbar={false}
        textareaProps={{
          placeholder,
          autoFocus: true,
        }}
        style={{
          borderRadius: '8px',
        }}
      />
    </Box>
  );
}
