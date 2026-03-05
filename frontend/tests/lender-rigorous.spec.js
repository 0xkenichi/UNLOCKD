// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

test('lender page renders core action controls', async ({ page }) => {
  await page.goto('/lender');
  await expect(page.getByRole('heading', { name: 'Lender Pools' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deposit Liquidity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toBeVisible();
});

test('deposit and withdraw start disabled in disconnected state', async ({ page }) => {
  await page.goto('/lender');
  await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toBeDisabled();
});

test('approve click writes blocked action log entry when disconnected', async ({ page }) => {
  await page.goto('/lender');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();

  const logPanel = page.getByTestId('lender-action-log');
  await expect(logPanel.getByText('Approve')).toBeVisible();
  await expect(logPanel.getByText('blocked')).toBeVisible();
  await expect(logPanel.getByText('Connect wallet first.')).toBeVisible();
});

test('action log panel starts empty and then increments after action', async ({ page }) => {
  await page.goto('/lender');
  const logPanel = page.getByTestId('lender-action-log');
  await expect(logPanel.getByText('No actions yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(logPanel.getByText('1 events')).toBeVisible();
});
