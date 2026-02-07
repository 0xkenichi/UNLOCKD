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

test('chain prompt appears when not connected', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Network Switch' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Switch to Base', exact: true })
  ).toBeVisible();
});
