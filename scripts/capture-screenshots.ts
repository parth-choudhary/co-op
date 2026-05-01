// Drive a headless Chromium through the demo workspace and write screenshots
// to docs/screenshots/. Assumes:
//   - Postgres is up and seeded via scripts/seed-screenshots.ts
//   - Next.js dev server is running on http://localhost:3000
//
//   npx tsx scripts/capture-screenshots.ts

import { chromium, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const EMAIL = 'demo@co-op.dev';
const PASSWORD = 'co-op-demo-2026';
const OUT_DIR = path.resolve(__dirname, '../docs/screenshots');

fs.mkdirSync(OUT_DIR, { recursive: true });

async function shoot(page: Page, name: string) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[shot] ${name}.png`);
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await Promise.all([
    page.waitForURL(/^http:\/\/localhost:3000\/?($|\?)/, { timeout: 15000 }),
    page.click('button[type=submit]'),
  ]);
}

async function findProjectId(page: Page): Promise<string> {
  const res = await page.request.get(`${BASE}/api/projects`);
  const projects = await res.json();
  const acme = (projects as Array<{ id: string; name: string }>).find((p) => p.name === 'Acme Platform');
  if (!acme) throw new Error('Acme Platform project not found — did you run seed-screenshots.ts?');
  return acme.id;
}

async function findFirstBoardId(page: Page, projectId: string): Promise<string> {
  const res = await page.request.get(`${BASE}/api/projects/${projectId}/boards`);
  const boards = await res.json();
  return (boards as Array<{ id: string }>)[0].id;
}

// The seed creates 12 cards in known order; the OAuth card is the 5th.
const OAUTH_CARD_KEY = 'ACME-5';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina screenshots
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // 8. Login page (logged-out, captured first)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await shoot(page, '08-login');

  // Login for the rest
  await login(page);
  const projectId = await findProjectId(page);
  const boardId = await findFirstBoardId(page, projectId);
  const oauthKey = OAUTH_CARD_KEY;

  // 1. Project hub
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shoot(page, '01-projects');

  // 2. Project overview
  await page.goto(`${BASE}/p/${projectId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shoot(page, '02-overview');

  // 3. Kanban board
  await page.goto(`${BASE}/p/${projectId}/boards/${boardId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shoot(page, '03-board');

  // 4. Card detail (using key route)
  await page.goto(`${BASE}/p/${projectId}/c/${oauthKey}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shoot(page, '04-card');

  // 5. Agents page
  await page.goto(`${BASE}/p/${projectId}/agents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shoot(page, '05-agents');

  // 6. Agent harness modal — click the "Harness" button on Atlas (CTO).
  // The button text is exactly "Harness", which makes it easy to target.
  await page.goto(`${BASE}/p/${projectId}/agents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Harness' }).first().click({ timeout: 5000 });
  // Wait for modal to render (looks for the tab strip).
  await page.waitForSelector('text=identity', { timeout: 5000 }).catch(() => {});
  // Click the Capabilities tab — most visually-rich.
  await page.getByText(/^capabilities$/i).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shoot(page, '06-harness');

  // 7. Chat — try to populate by setting up the Matrix room on the seeded channel.
  await page.goto(`${BASE}/p/${projectId}/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // Click the first channel that says "click to setup" if it exists, otherwise
  // just click the seeded "general" channel.
  const setupTrigger = page.locator('text=/click to setup/i').first();
  if (await setupTrigger.count() > 0) {
    await setupTrigger.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  // Click the general channel name to ensure it's selected
  await page.getByText('general', { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shoot(page, '07-chat');

  await browser.close();
  console.log(`\nScreenshots written to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
