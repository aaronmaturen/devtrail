'use client';

import { useMemo } from 'react';
import { Paper, Title, Text, List, Divider, Code } from '@mantine/core';

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const renderMarkdown = useMemo(() => {
    const lines = content.split('\n');
    const elements: React.ReactElement[] = [];
    let listItems: string[] = [];
    let codeBlock: string[] = [];
    let inCodeBlock = false;

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <List key={`list-${elements.length}`} mb="md" size="sm">
            {listItems.map((item, i) => (
              <List.Item key={i}>{item}</List.Item>
            ))}
          </List>
        );
        listItems = [];
      }
    };

    const flushCodeBlock = () => {
      if (codeBlock.length > 0) {
        elements.push(
          <Code key={`code-${elements.length}`} block mb="md">
            {codeBlock.join('\n')}
          </Code>
        );
        codeBlock = [];
      }
    };

    lines.forEach((line, index) => {
      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushList();
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBlock.push(line);
        return;
      }

      // Headers
      if (line.startsWith('# ')) {
        flushList();
        elements.push(
          <Title key={`h1-${index}`} order={1} mb="md" mt="xl">
            {line.substring(2)}
          </Title>
        );
      } else if (line.startsWith('## ')) {
        flushList();
        elements.push(
          <Title key={`h2-${index}`} order={2} mb="md" mt="lg">
            {line.substring(3)}
          </Title>
        );
      } else if (line.startsWith('### ')) {
        flushList();
        elements.push(
          <Title key={`h3-${index}`} order={3} mb="sm" mt="md">
            {line.substring(4)}
          </Title>
        );
      } else if (line.startsWith('#### ')) {
        flushList();
        elements.push(
          <Title key={`h4-${index}`} order={4} mb="sm" mt="sm">
            {line.substring(5)}
          </Title>
        );
      }
      // Horizontal rule
      else if (line.trim() === '---' || line.trim() === '***') {
        flushList();
        elements.push(<Divider key={`hr-${index}`} my="lg" />);
      }
      // Lists
      else if (line.match(/^[\s]*[-*+]\s/)) {
        const item = line.replace(/^[\s]*[-*+]\s/, '');
        listItems.push(item);
      } else if (line.match(/^[\s]*\d+\.\s/)) {
        const item = line.replace(/^[\s]*\d+\.\s/, '');
        listItems.push(item);
      }
      // Empty line
      else if (line.trim() === '') {
        flushList();
      }
      // Regular text
      else if (line.trim()) {
        flushList();
        // Process inline formatting
        let processedLine = line;

        // Bold
        processedLine = processedLine.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        processedLine = processedLine.replace(/__(.+?)__/g, '<strong>$1</strong>');

        // Italic
        processedLine = processedLine.replace(/\*(.+?)\*/g, '<em>$1</em>');
        processedLine = processedLine.replace(/_(.+?)_/g, '<em>$1</em>');

        // Inline code
        processedLine = processedLine.replace(/`(.+?)`/g, '<code>$1</code>');

        elements.push(
          <Text
            key={`p-${index}`}
            mb="sm"
            dangerouslySetInnerHTML={{ __html: processedLine }}
          />
        );
      }
    });

    flushList();
    flushCodeBlock();

    return elements;
  }, [content]);

  return (
    <Paper p="xl" radius="md" withBorder>
      <div style={{
        maxWidth: '100%',
        wordWrap: 'break-word',
        overflow: 'hidden'
      }}>
        {renderMarkdown}
      </div>
    </Paper>
  );
}
