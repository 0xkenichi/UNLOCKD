// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

test('fund wallet card shows funding rows', async ({ page }) => {
  await page.goto('/borrow');
  await expect(page.getByRole('heading', { name: 'Fund Wallet' })).toBeVisible();
  await expect(page.getByText('Gas', { exact: true })).toBeVisible();
  await expect(page.getByText('USDC', { exact: true })).toBeVisible();
});

test('network picker appears when not connected', async ({ page }) => {
  await page.goto('/dashboard');
  const networkCard = page.locator('.immersive-network-card');
  await expect(networkCard).toBeVisible();
  await expect(page.getByText('Connected: --')).toBeVisible();
  await networkCard.click();
  
  // Subagent confirmed the RainbowKit modal appears, use standard dialog selector
  await expect(page.locator('div[role="dialog"]')).toBeVisible({ timeout: 10000 });
});
