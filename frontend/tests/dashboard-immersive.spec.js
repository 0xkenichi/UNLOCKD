// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

test('immersive dashboard exposes network switch from network card', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.locator('.immersive-core-card')).toBeVisible();
  const networkCard = page.locator('.immersive-network-card');
  await expect(networkCard).toBeVisible();
  
  await networkCard.click();
  
  // Based on subagent verification, div[role="dialog"] is the most reliable selector for the RainbowKit modal
  await expect(page.locator('div[role="dialog"]')).toBeVisible({ timeout: 10000 });
});

test('triggered module opens immersive transition', async ({ page }) => {
  await page.goto('/dashboard');
  
  // Use data-guide-id for reliable targeting
  const target = page.locator('[data-guide-id="dashboard-open-borrow"]');
  await expect(target).toBeVisible();
  
  // Click to trigger the transition reliably in E2E
  await target.click();

  await expect(page.locator('.immersive-focus-layer')).toBeVisible({ timeout: 15000 });
  // Expect 'Borrow' title as confirmed by actual E2E received value
  await expect(page.locator('.immersive-focus-title')).toContainText('Borrow');
});
