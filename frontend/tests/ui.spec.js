import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

test('landing CTA routes to dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'VESTRA PROTOCOL', exact: true })
  ).toBeVisible();
  await page.getByTestId('landing-cta').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('.immersive-core-card')).toBeVisible();
});

test('tab bar navigation reaches borrow flow', async ({ page }) => {
  await page.goto('/dashboard');
  await page
    .locator('.immersive-module-card', { hasText: 'Borrow' })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Borrow', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Borrow Actions', exact: true })
  ).toBeVisible();
});

test('borrow page shows collateral source Manual and Import from Sablier v2', async ({ page }) => {
  await page.goto('/borrow');
  await expect(page.getByText('Collateral source')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manual' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import from Sablier v2' })).toBeVisible();
});

test('import Sablier v2 shows lockup stream and wrapper fields', async ({ page }) => {
  await page.goto('/borrow');
  await page.getByRole('button', { name: 'Import from Sablier v2' }).click();
  await expect(page.getByLabel('Lockup contract')).toBeVisible();
  await expect(page.getByLabel('Stream ID')).toBeVisible();
  await expect(page.getByLabel('Wrapper address')).toBeVisible();
});
