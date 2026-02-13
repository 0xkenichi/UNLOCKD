import { test, expect } from '@playwright/test';

test.describe('Identity page sanity', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('crdt-onboarding-seen', 'true');
    });
  });

  test('identity page renders and has expected elements', async ({ page }) => {
    await page.goto('/identity', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    // 1. Section title
    await expect(page.getByRole('heading', { name: 'Attestations and stamps' })).toBeVisible();

    // 2. Summary pill: either "No attestations yet" or "attestation"
    const attestPill = page.locator('.pill').filter({
      hasText: /No attestations yet|attestation/
    });
    await expect(attestPill.first()).toBeVisible();

    // 3. Stamps counted pill
    await expect(page.getByText('Stamps counted:', { exact: false })).toBeVisible();

    // 4. Open Gitcoin Passport link
    await expect(page.getByRole('link', { name: 'Open Gitcoin Passport' })).toBeVisible();

    // 5. Verify now button
    const verifyNowBtn = page.getByRole('button', { name: 'Verify now' });
    await expect(verifyNowBtn).toBeVisible();

    // 6. Verification checklist section
    await expect(page.getByRole('heading', { name: 'Verification checklist' })).toBeVisible();

    // 7. Verify with Gitcoin Passport button
    await expect(page.getByRole('button', { name: 'Verify with Gitcoin Passport' })).toBeVisible();

    // Click Verify now and confirm scroll to checklist
    const checklist = page.locator('#identity-checklist');
    await verifyNowBtn.click();
    await page.waitForTimeout(800);
    await expect(checklist).toBeInViewport();
  });
});
