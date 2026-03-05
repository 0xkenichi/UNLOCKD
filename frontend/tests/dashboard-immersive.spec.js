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

  const picker = page.locator('.immersive-network-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Sepolia', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: /Base Sepolia/i })).toBeVisible();
});

test('hover dwell triggers module auto-open transition', async ({ page }) => {
  await page.goto('/dashboard');
  const borrowCard = page.locator('.immersive-module-card', { hasText: 'Borrow' }).first();

  await expect(borrowCard).toBeVisible();
  await borrowCard.hover();
  await page.waitForTimeout(1100);

  await expect(page.locator('.immersive-focus-layer')).toBeVisible();
  await expect(page.locator('.immersive-focus-title')).toContainText('Borrow');
});
