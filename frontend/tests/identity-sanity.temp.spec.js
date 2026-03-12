// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
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

    // 5. Verify now button -> Sync Gitcoin Passport Score
    const verifyNowBtn = page.getByRole('button', { name: 'Sync Gitcoin Passport Score' });
    await expect(verifyNowBtn).toBeVisible();

    // Click verify button and confirm disabled when disconnected
    await expect(verifyNowBtn).toBeDisabled();
  });
});
