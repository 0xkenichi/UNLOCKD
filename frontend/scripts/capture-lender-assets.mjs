import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:5174';
const OUT_DIR = process.env.OUT_DIR
  ? path.resolve(process.env.OUT_DIR)
  : path.resolve(process.cwd(), '..', 'artifacts', 'alchemy-application');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function safeClick(page, selectorOrRole, options = {}) {
  try {
    if (selectorOrRole.type === 'role') {
      await page.getByRole(selectorOrRole.role, selectorOrRole.options).click(options);
    } else {
      await page.locator(selectorOrRole).click(options);
    }
    return true;
  } catch {
    return false;
  }
}

async function safeFill(page, selector, value) {
  try {
    await page.locator(selector).fill(value);
    return true;
  } catch {
    return false;
  }
}

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: path.join(OUT_DIR, '01-home.png'),
    fullPage: false
  });

  await page.goto(`${APP_URL}/lender`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(OUT_DIR, '02-lender-overview.png'),
    fullPage: false
  });

  await safeFill(page, 'input[placeholder="Enter target USDC"]', '1000');
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(OUT_DIR, '03-lender-onboarding-capital.png'),
    fullPage: false
  });

  await context.close();
  await browser.close();
}

async function captureVideo() {
  const videoTempDir = path.join(OUT_DIR, 'video-temp');
  await ensureDir(videoTempDir);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoTempDir, size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();

  await page.goto(`${APP_URL}/lender`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(700);
  await safeFill(page, 'input[placeholder="Enter target USDC"]', '1000');
  await page.waitForTimeout(800);
  await safeClick(page, { type: 'role', role: 'button', options: { name: /create smart wallet|connect wallet/i } });
  await page.waitForTimeout(1800);
  await safeClick(page, { type: 'role', role: 'button', options: { name: /continue to funding \+ deposit/i } });
  await page.waitForTimeout(2000);

  await context.close();
  await browser.close();

  const files = await fs.readdir(videoTempDir);
  const webm = files.find((file) => file.endsWith('.webm'));
  if (webm) {
    await fs.rename(
      path.join(videoTempDir, webm),
      path.join(OUT_DIR, 'lender-onboarding-demo.webm')
    );
  }
}

async function writeManifest() {
  const manifest = [
    '# Capture Bundle',
    '',
    `App URL: ${APP_URL}`,
    '',
    'Files:',
    '- 01-home.png',
    '- 02-lender-overview.png',
    '- 03-lender-onboarding-capital.png',
    '- lender-onboarding-demo.webm'
  ].join('\n');

  await fs.writeFile(path.join(OUT_DIR, 'README.md'), manifest, 'utf8');
}

async function main() {
  await ensureDir(OUT_DIR);
  await captureScreenshots();
  await captureVideo();
  await writeManifest();
  console.log(`Saved assets to: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
