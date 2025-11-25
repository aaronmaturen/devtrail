import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/db/prisma';

const DB_PATH = path.join(process.cwd(), 'prisma', 'dev.db');
const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * POST /api/database/restore
 * Restore database from a backup
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json(
        { error: 'Backup filename required' },
        { status: 400 }
      );
    }

    const backupPath = path.join(BACKUP_DIR, filename);

    // Verify backup file exists
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json(
        { error: 'Backup file not found' },
        { status: 404 }
      );
    }

    // Disconnect Prisma client before replacing database
    await prisma.$disconnect();

    // Create a safety backup of current database before restoring
    if (fs.existsSync(DB_PATH)) {
      const safetyBackupPath = path.join(
        BACKUP_DIR,
        `dev-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
      );
      fs.copyFileSync(DB_PATH, safetyBackupPath);
    }

    // Restore backup
    fs.copyFileSync(backupPath, DB_PATH);

    return NextResponse.json({
      success: true,
      filename,
      restored: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error restoring database:', error);
    return NextResponse.json(
      { error: 'Failed to restore database' },
      { status: 500 }
    );
  }
}
