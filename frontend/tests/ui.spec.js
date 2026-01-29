import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

test('landing CTA routes to dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'VESTRA' })).toBeVisible();
  await page.getByRole('button', { name: 'Launch App (Testnet)' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('tab bar navigation reaches borrow flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Borrow' }).click();
  await expect(page.getByRole('heading', { name: 'Borrow' })).toBeVisible();
  await expect(page.getByText('Borrow Actions')).toBeVisible();
});
