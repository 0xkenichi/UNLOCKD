#!/usr/bin/env node
/**
 * Export Vestra Moonshots deck to PDF.
 * Run from project root: node scripts/export-deck-pdf.js
 * Requires: npm install -D playwright (or use frontend's @playwright/test)
 */
const path = require('path');
const fs = require('fs');

async function main() {
  let chromium;
  const frontendPwt = path.join(__dirname, '../frontend/node_modules/@playwright/test');
  try {
    chromium = require(frontendPwt).chromium;
  } catch (e1) {
    try {
      chromium = require('@playwright/test').chromium;
    } catch (e2) {
      console.error('Playwright not found. Run: cd frontend && npm install');
      process.exit(1);
    }
  }

  const htmlPath = path.resolve(__dirname, '../docs/deck/vestra-moonshots-deck.html');
  const pdfPath = path.resolve(__dirname, '../docs/deck/vestra-moonshots-deck.pdf');

  if (!fs.existsSync(htmlPath)) {
    console.error('Deck HTML not found at:', htmlPath);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    format: 'A4',
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
  });
  await browser.close();

  const stats = fs.statSync(pdfPath);
  console.log('PDF saved:', pdfPath);
  console.log('Size:', (stats.size / 1024).toFixed(1), 'KB');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
