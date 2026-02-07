import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

test('landing CTA routes to dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-title')).toBeVisible();
  await page.getByTestId('landing-cta').click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('tab bar navigation reaches borrow flow', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByTestId('tab-borrow').click();
  await expect(
    page.getByRole('heading', { name: 'Borrow', exact: true })
  ).toBeVisible();
  await expect(page.getByText('Borrow Actions')).toBeVisible();
});
