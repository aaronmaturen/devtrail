/**
 * Marketing Screenshots Generator
 * Uses Playwright to capture screenshots of DevTrail for marketing materials
 */

import { chromium, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:4000';
const OUTPUT_DIR = './site/assets/screenshots';

// Screenshot configurations
const SCREENSHOTS = [
  {
    name: 'dashboard',
    path: '/dashboard',
    description: 'Main dashboard with stats and recent activity',
    waitFor: '.mantine-Card-root',
  },
  {
    name: 'evidence-list',
    path: '/evidence',
    description: 'Evidence list showing tracked PRs and contributions',
    waitFor: '.mantine-Table-root, .mantine-Card-root',
  },
  {
    name: 'goals',
    path: '/goals',
    description: 'Goal tracking with SMART goals and milestones',
    waitFor: '.mantine-Card-root',
  },
  {
    name: 'reports',
    path: '/reports',
    description: 'Generated reports list',
    waitFor: '.mantine-Card-root, .mantine-Table-root',
  },
  {
    name: 'sync',
    path: '/sync',
    description: 'GitHub and Jira sync interface',
    waitFor: '.mantine-Card-root',
  },
  {
    name: 'criteria',
    path: '/criteria',
    description: 'Performance criteria management',
    waitFor: '.mantine-Table-root, .mantine-Card-root',
  },
  {
    name: 'reviews',
    path: '/reviews',
    description: 'Review documents and analysis',
    waitFor: '.mantine-Card-root',
  },
  {
    name: 'report-builder',
    path: '/report-builder',
    description: 'AI-powered report builder',
    waitFor: '.mantine-Card-root',
  },
  {
    name: 'assistant',
    path: '/assistant',
    description: 'AI assistant chat interface',
    waitFor: '.mantine-Card-root, .mantine-Textarea-root',
  },
  {
    name: 'settings',
    path: '/settings',
    description: 'Settings and configuration',
    waitFor: '.mantine-Card-root',
  },
];

// Viewport sizes
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

async function waitForPageLoad(page: Page, waitForSelector?: string) {
  // Wait for network to be idle
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Wait for specific selector if provided
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
      console.log(`  Warning: Selector "${waitForSelector}" not found, continuing...`);
    });
  }

  // Extra wait for animations to settle
  await page.waitForTimeout(500);
}

async function takeScreenshot(
  page: Page,
  name: string,
  viewport: keyof typeof VIEWPORTS = 'desktop'
) {
  const filename = `${name}-${viewport}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);

  await page.setViewportSize(VIEWPORTS[viewport]);
  await page.waitForTimeout(300); // Let layout adjust

  await page.screenshot({
    path: filepath,
    fullPage: false,
  });

  console.log(`  ✓ ${filename}`);
  return filepath;
}

async function captureAllScreenshots() {
  console.log('🎬 DevTrail Marketing Screenshots');
  console.log('==================================\n');

  await ensureOutputDir();

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: VIEWPORTS.desktop,
    deviceScaleFactor: 2, // Retina quality
  });

  const page = await context.newPage();

  // Check if app is running
  try {
    await page.goto(BASE_URL, { timeout: 5000 });
  } catch (error) {
    console.error('❌ Error: App not running on localhost:4000');
    console.error('   Please start the app with: npm run dev');
    await browser.close();
    process.exit(1);
  }

  console.log(`📸 Capturing ${SCREENSHOTS.length} pages...\n`);

  for (const screenshot of SCREENSHOTS) {
    console.log(`📄 ${screenshot.name}: ${screenshot.description}`);

    try {
      await page.goto(`${BASE_URL}${screenshot.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await waitForPageLoad(page, screenshot.waitFor);

      // Take desktop screenshot (primary)
      await takeScreenshot(page, screenshot.name, 'desktop');

    } catch (error) {
      console.log(`  ⚠ Error capturing ${screenshot.name}: ${error}`);
    }

    console.log('');
  }

  // Take some special screenshots
  console.log('📄 Special screenshots...');

  // Homepage/landing
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, 'homepage', 'desktop');
  } catch (e) {
    console.log('  ⚠ Could not capture homepage');
  }

  // Evidence detail (if we can find one)
  try {
    await page.goto(`${BASE_URL}/evidence`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, '.mantine-Table-root');

    // Click first evidence item if table exists
    const firstRow = await page.$('table tbody tr:first-child td:first-child a');
    if (firstRow) {
      await firstRow.click();
      await waitForPageLoad(page);
      await takeScreenshot(page, 'evidence-detail', 'desktop');
    }
  } catch (e) {
    console.log('  ⚠ Could not capture evidence detail');
  }

  // Goal detail (if we can find one)
  try {
    await page.goto(`${BASE_URL}/goals`, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, '.mantine-Card-root');

    // Click first goal card link
    const firstGoal = await page.$('.mantine-Card-root a[href^="/goals/"]');
    if (firstGoal) {
      await firstGoal.click();
      await waitForPageLoad(page);
      await takeScreenshot(page, 'goal-detail', 'desktop');
    }
  } catch (e) {
    console.log('  ⚠ Could not capture goal detail');
  }

  console.log('\n');
  await browser.close();

  // List all generated files
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`✅ Generated ${files.length} screenshots in ${OUTPUT_DIR}/`);
  console.log('\nFiles:');
  files.forEach(f => console.log(`  - ${f}`));
}

// Run
captureAllScreenshots().catch(console.error);
