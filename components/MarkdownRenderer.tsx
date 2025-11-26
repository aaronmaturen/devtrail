'use client';

import ReactMarkdown from 'react-markdown';
import { Paper, TypographyStylesProvider } from '@mantine/core';

type MarkdownRendererProps = {
  content: string;
  withBorder?: boolean;
  withPadding?: boolean;
};

export function MarkdownRenderer({
  content,
  withBorder = true,
  withPadding = true
}: MarkdownRendererProps) {
  return (
    <Paper
      p={withPadding ? "xl" : 0}
      radius="md"
      withBorder={withBorder}
    >
      <TypographyStylesProvider>
        <ReactMarkdown>{content}</ReactMarkdown>
      </TypographyStylesProvider>
    </Paper>
  );
}
