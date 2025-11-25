import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/db/prisma';

const DB_PATH = path.join(process.cwd(), 'prisma', 'dev.db');
const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * POST /api/database/backup
 * Create a database backup
 */
export async function POST() {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Check if database file exists
    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json(
        { error: 'Database file not found' },
        { status: 404 }
      );
    }

    // Disconnect Prisma before copying (to ensure clean backup)
    await prisma.$disconnect();

    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `dev-backup-${timestamp}.db`;
    const backupPath = path.join(BACKUP_DIR, backupFilename);

    // Copy database file to backup
    fs.copyFileSync(DB_PATH, backupPath);

    // Get file size
    const stats = fs.statSync(backupPath);

    return NextResponse.json({
      success: true,
      filename: backupFilename,
      path: backupPath,
      size: stats.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating database backup:', error);
    return NextResponse.json(
      { error: 'Failed to create database backup' },
      { status: 500 }
    );
  }
}
