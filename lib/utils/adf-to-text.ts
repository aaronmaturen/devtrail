/**
 * Convert Atlassian Document Format (ADF) to plain text
 * ADF is the JSON format Jira uses for rich text content
 */
export function adfToText(adf: any): string {
  if (!adf) return '';
  if (typeof adf === 'string') {
    // Check if it's a JSON string that needs parsing
    if (adf.startsWith('{') || adf.startsWith('[')) {
      try {
        const parsed = JSON.parse(adf);
        return adfToText(parsed);
      } catch {
        return adf;
      }
    }
    return adf;
  }

  // If it's not an ADF object, try to stringify
  if (!adf.type || !adf.content) {
    return typeof adf === 'object' ? JSON.stringify(adf) : String(adf);
  }

  const extractText = (node: any): string => {
    if (!node) return '';

    // Handle text nodes
    if (node.type === 'text') {
      return node.text || '';
    }

    // Handle nodes with content array
    if (Array.isArray(node.content)) {
      return node.content.map(extractText).join('');
    }

    // Handle specific node types
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        return (node.content?.map(extractText).join('') || '') + '\n';
      case 'bulletList':
      case 'orderedList':
        return (node.content?.map((item: any) => '• ' + extractText(item)).join('\n') || '') + '\n';
      case 'listItem':
        return node.content?.map(extractText).join('') || '';
      case 'codeBlock':
        return '```\n' + (node.content?.map(extractText).join('') || '') + '\n```\n';
      case 'blockquote':
        return '> ' + (node.content?.map(extractText).join('') || '') + '\n';
      case 'hardBreak':
        return '\n';
      case 'rule':
        return '\n---\n';
      case 'mediaSingle':
      case 'media':
        return '[image]\n';
      case 'table':
        return (node.content?.map(extractText).join('') || '') + '\n';
      case 'tableRow':
        return (node.content?.map(extractText).join(' | ') || '') + '\n';
      case 'tableCell':
      case 'tableHeader':
        return node.content?.map(extractText).join('') || '';
      case 'doc':
        return node.content?.map(extractText).join('') || '';
      default:
        // For unknown types, try to extract content
        if (node.content) {
          return node.content.map(extractText).join('');
        }
        return '';
    }
  };

  return extractText(adf).trim();
}
