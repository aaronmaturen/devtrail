import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/report-builder/[id]/export
 * Export a report document as markdown or JSON (for PDF generation)
 * Query params:
 *   - format: "markdown" | "json" (default: "markdown")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const format = request.nextUrl.searchParams.get('format') || 'markdown';

    const document = await prisma.reportDocument.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Generate markdown content
    const markdown = generateMarkdown(document);

    if (format === 'markdown') {
      // Return as downloadable markdown file
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="${sanitizeFilename(document.name)}.md"`,
        },
      });
    }

    // Return JSON with markdown and metadata for client-side PDF generation
    return NextResponse.json({
      name: document.name,
      markdown,
      metadata: {
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        status: document.status,
        blockCount: document.blocks.length,
      },
    });
  } catch (error) {
    console.error('Error exporting document:', error);
    return NextResponse.json(
      { error: 'Failed to export document' },
      { status: 500 }
    );
  }
}

/**
 * Generate markdown content from a report document
 */
function generateMarkdown(document: any): string {
  const lines: string[] = [];

  // Document header
  lines.push(`# ${document.name}`);

  if (document.description) {
    lines.push(`\n*${document.description}*`);
  }

  // Metadata footer
  const createdDate = new Date(document.createdAt).toLocaleDateString();
  const statusBadge = document.status === 'DRAFT' ? 'Draft' : 'Published';
  lines.push(`\n*Status: ${statusBadge} | Created: ${createdDate}*`);
  lines.push('\n---\n');

  // Process blocks
  for (const block of document.blocks) {
    switch (block.type) {
      case 'HEADING':
        // Use ## for consistency (document title is #)
        lines.push(`## ${block.content}`);
        break;

      case 'PROMPT_RESPONSE':
        // Show prompt as heading, response as content
        if (block.prompt) {
          lines.push(`### ${block.prompt}`);
        }
        if (block.content) {
          lines.push(block.content);
        }
        break;

      case 'TEXT':
        lines.push(block.content);
        break;

      case 'DIVIDER':
        lines.push('---');
        break;

      default:
        // Unknown block type - just include content
        if (block.content) {
          lines.push(block.content);
        }
    }

    // Add spacing between blocks
    lines.push('');
  }

  // Add export footer
  lines.push('---');
  lines.push(`\n*Exported from DevTrail on ${new Date().toLocaleString()}*`);

  return lines.join('\n');
}

/**
 * Sanitize filename by replacing special characters with underscores
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}
