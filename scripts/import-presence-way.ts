#!/usr/bin/env tsx
/**
 * Import presence_way.md into the database as company framework
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRESENCE_WAY_PATH = path.join(__dirname, '../../presence_way.md');

async function importPresenceWay() {
  console.log('📄 Importing Presence Way framework...');

  if (!fs.existsSync(PRESENCE_WAY_PATH)) {
    console.error(`❌ File not found: ${PRESENCE_WAY_PATH}`);
    console.log('Looking in parent directory...');

    const parentPath = path.join(__dirname, '../../../devtrail/presence_way.md');
    if (!fs.existsSync(parentPath)) {
      console.error(`❌ File not found: ${parentPath}`);
      console.log('\n💡 Please ensure presence_way.md exists in the parent devtrail directory');
      process.exit(1);
    }

    const content = fs.readFileSync(parentPath, 'utf-8');
    await saveFramework(content, parentPath);
    return;
  }

  const content = fs.readFileSync(PRESENCE_WAY_PATH, 'utf-8');
  await saveFramework(content, PRESENCE_WAY_PATH);
}

async function saveFramework(content: string, sourcePath: string) {
  try {
    await prisma.config.upsert({
      where: { key: 'company_framework' },
      update: {
        value: JSON.stringify(content),
        description: 'Company mission, values, and strategic framework for AI context',
      },
      create: {
        key: 'company_framework',
        value: JSON.stringify(content),
        encrypted: false,
        description: 'Company mission, values, and strategic framework for AI context',
      },
    });

    console.log(`✅ Successfully imported framework from ${sourcePath}`);
    console.log(`📊 Content length: ${content.length} characters`);
    console.log('\n✨ Framework is now available in Settings and will be used for AI context');
  } catch (error) {
    console.error('❌ Failed to save framework:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importPresenceWay();
