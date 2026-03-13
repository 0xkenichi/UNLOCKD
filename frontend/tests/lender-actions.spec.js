// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

test('lender approve action is logged with blocked reason when disconnected', async ({ page }) => {
  await page.goto('/lender');

  await expect(page.getByRole('heading', { name: 'Lender Pools' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Action Log' })).toBeVisible();

  // Fill deposit amount so the button becomes enabled
  await page.getByLabel('Deposit amount (USDC)').fill('100');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  const logPanel = page.getByTestId('lender-action-log');
  await expect(logPanel.getByText('Approve')).toBeVisible();
  await expect(logPanel.getByText('blocked')).toBeVisible();
  await expect(logPanel.getByText('Connect wallet first.')).toBeVisible();
});
