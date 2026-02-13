import { test, expect } from "@playwright/test";

test("@smoke app shell loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toContainText(/Borrow|Lender|Dashboard/i);
});
