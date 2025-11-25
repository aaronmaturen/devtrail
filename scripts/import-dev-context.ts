#!/usr/bin/env tsx
/**
 * Import initial developer context
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_CONTEXT = `I am a happy senior developer working hard to become a staff engineer. I have a wonderful and supportive team and manager, and I feel fulfilled by my work. I consistently contribute high-quality code, mentor junior developers, and help drive technical decisions that align with our organization's goals.`;

async function importDevContext() {
  console.log('👤 Importing developer context...');

  try {
    await prisma.config.upsert({
      where: { key: 'user_context' },
      update: {
        value: JSON.stringify(DEV_CONTEXT),
        description: 'Personal career context and aspirations for AI personalization',
      },
      create: {
        key: 'user_context',
        value: JSON.stringify(DEV_CONTEXT),
        encrypted: false,
        description: 'Personal career context and aspirations for AI personalization',
      },
    });

    console.log(`✅ Successfully imported developer context`);
    console.log(`📊 Content length: ${DEV_CONTEXT.length} characters`);
    console.log('\n✨ Developer context is now available in Settings and will be used for AI personalization');
  } catch (error) {
    console.error('❌ Failed to save developer context:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importDevContext();
