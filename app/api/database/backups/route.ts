import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * GET /api/database/backups
 * List available database backups
 */
export async function GET() {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      return NextResponse.json({ backups: [] });
    }

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((file) => file.endsWith('.db'))
      .map((filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          created: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

    return NextResponse.json({ backups: files });
  } catch (error) {
    console.error('Error listing backups:', error);
    return NextResponse.json(
      { error: 'Failed to list backups' },
      { status: 500 }
    );
  }
}
