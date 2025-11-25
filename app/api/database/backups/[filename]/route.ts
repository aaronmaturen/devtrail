import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * DELETE /api/database/backups/[filename]
 * Delete a specific backup file
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  try {
    const backupPath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json(
        { error: 'Backup file not found' },
        { status: 404 }
      );
    }

    fs.unlinkSync(backupPath);

    return NextResponse.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting backup:', error);
    return NextResponse.json(
      { error: 'Failed to delete backup' },
      { status: 500 }
    );
  }
}
