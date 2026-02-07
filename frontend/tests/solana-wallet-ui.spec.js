import { test, expect } from '@playwright/test';

test('solana wallet adapter button appears in onboarding', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('crdt-onboarding-seen');
  });
  await page.goto('/', { waitUntil: 'networkidle' });

  const nextButton = page.getByRole('button', { name: 'Next' });
  await nextButton.click();

  const solanaTab = page.getByRole('button', { name: 'Solana' });
  await solanaTab.click();

  const walletButton = page.getByRole('button', {
    name: /select wallet|connect wallet/i
  });
  await expect(walletButton).toBeVisible();
});
