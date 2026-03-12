import { chromium } from '@playwright/test';

(async () => {
  console.log('Starting Playwright...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[Browser ERROR] ${msg.text()}`);
      errors.push(msg.text());
    } else if (msg.type() === 'warning') {
      console.warn(`[Browser WARNING] ${msg.text()}`);
    } else {
      console.log(`[Browser LOG] ${msg.text()}`);
    }
  });
  page.on('pageerror', error => {
    console.error(`[Browser UNCAUGHT EXCEPTION] ${error.stack || error.message}`);
    errors.push(error.message);
  });

  console.log('Navigating to http://localhost:4178 ...');
  try {
    await page.goto('http://localhost:4178', { waitUntil: 'networkidle', timeout: 10000 });
  } catch (e) {
    console.error('Navigation error:', e);
  }
  
  await page.screenshot({ path: 'preview-screenshot.png' });
  console.log('Screenshot saved to preview-screenshot.png');
  
  console.log(`Found ${errors.length} errors.`);
  
  await browser.close();
})();
