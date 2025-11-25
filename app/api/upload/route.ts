import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * POST /api/upload
 * Upload file and optionally attach to evidence
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const evidenceId = formData.get('evidenceId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `${randomUUID()}.${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    const filepath = join(uploadDir, filename);
    const publicPath = `/uploads/${filename}`;

    // Convert file to buffer and write
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // If evidenceId provided, create attachment record
    if (evidenceId) {
      // Verify evidence exists
      const evidence = await prisma.evidenceEntry.findUnique({
        where: { id: evidenceId },
      });

      if (!evidence) {
        return NextResponse.json(
          { error: 'Evidence not found' },
          { status: 404 }
        );
      }

      // Create attachment record
      const attachment = await prisma.attachment.create({
        data: {
          filename,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          path: publicPath,
          evidenceId,
        },
      });

      return NextResponse.json({
        attachment,
        url: publicPath,
      });
    }

    // Return file info without creating attachment record
    return NextResponse.json({
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      url: publicPath,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload?filename=xxx
 * Delete uploaded file and attachment record
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json(
        { error: 'No filename provided' },
        { status: 400 }
      );
    }

    // Delete attachment record if exists
    const attachment = await prisma.attachment.findFirst({
      where: { filename },
    });

    if (attachment) {
      await prisma.attachment.delete({
        where: { id: attachment.id },
      });
    }

    // Delete physical file
    const filepath = join(process.cwd(), 'public', 'uploads', filename);
    const fs = await import('fs/promises');
    try {
      await fs.unlink(filepath);
    } catch (error) {
      // File might not exist, ignore
      console.warn('Failed to delete file:', error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
