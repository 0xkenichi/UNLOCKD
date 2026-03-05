// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { test, expect } from '@playwright/test';

test('solana wallet adapter button appears in onboarding', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('crdt-onboarding-seen');
  });
  await page.goto('/', { waitUntil: 'networkidle' });

  const nextButton = page.getByRole('button', { name: 'Next' });
  await nextButton.dispatchEvent('click');
  await expect(page.getByText('Connect & choose chain')).toBeVisible();

  const solanaTab = page.getByRole('button', { name: 'Solana' });
  await solanaTab.click();

  const walletButton = page.getByRole('button', {
    name: /select wallet|connect.*wallet/i
  });
  await expect(walletButton).toBeVisible();
});
