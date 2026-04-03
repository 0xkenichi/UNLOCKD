// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { test, expect } from "@playwright/test";

test("@smoke app shell loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toContainText(/Borrow|Lender|Dashboard/i);
});
