// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { test, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specsDir = path.join(__dirname, 'specs');

const readSpecs = () => {
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .map((file) => {
      const contents = fs.readFileSync(path.join(specsDir, file), 'utf8');
      const data = yaml.load(contents) || {};
      return { file, ...data };
    });
};

const locatorFromTarget = (page, target) => {
  if (target.role) {
    return page.getByRole(target.role, {
      name: target.name,
      exact: target.exact
    });
  }
  if (target.label) {
    return page.getByLabel(target.label, { exact: target.exact });
  }
  if (target.placeholder) {
    return page.getByPlaceholder(target.placeholder, { exact: target.exact });
  }
  if (target.text) {
    return page.getByText(target.text, { exact: target.exact });
  }
  if (target.testId) {
    return page.getByTestId(target.testId);
  }
  if (target.selector) {
    return page.locator(target.selector);
  }
  throw new Error(`Unsupported locator target: ${JSON.stringify(target)}`);
};

const runStep = async (page, step) => {
  if (step.goto) {
    const url = typeof step.goto === 'string' ? step.goto : step.goto.url;
    await page.goto(url);
    return;
  }
  if (step.click) {
    const target = typeof step.click === 'string' ? { text: step.click } : step.click;
    await locatorFromTarget(page, target).click();
    return;
  }
  if (step.fill) {
    const target = step.fill;
    if (!target || target.value === undefined) {
      throw new Error('fill step requires a value');
    }
    const locator = locatorFromTarget(page, target).first();
    await locator.waitFor({ state: 'visible' });
    await expect(locator).toBeVisible();
    await expect(locator).toBeEditable();
    await locator.fill(String(target.value), { force: true });
    return;
  }
  if (step.expectRole) {
    const target = step.expectRole;
    const locator = locatorFromTarget(page, target).first();
    await expect(locator).toBeVisible({ timeout: 15000 });
    return;
  }
  if (step.expectText) {
    const target = typeof step.expectText === 'string'
      ? { text: step.expectText }
      : step.expectText;
    const locator = locatorFromTarget(page, target).first();
    await expect(locator).toBeVisible({ timeout: 15000 });
    return;
  }
  if (step.expectVisible) {
    const target = step.expectVisible;
    const locator = locatorFromTarget(page, target).first();
    await expect(locator).toBeVisible({ timeout: 15000 });
    return;
  }
  if (step.expectDisabled) {
    const target = step.expectDisabled;
    await expect(locatorFromTarget(page, target)).toBeDisabled();
    return;
  }
  if (step.expectEnabled) {
    const target = step.expectEnabled;
    await expect(locatorFromTarget(page, target)).toBeEnabled();
    return;
  }
  if (step.expectValue) {
    const target = step.expectValue;
    if (!target || target.value === undefined) {
      throw new Error('expectValue step requires a value');
    }
    await expect(locatorFromTarget(page, target)).toHaveValue(String(target.value));
    return;
  }
  if (step.waitFor) {
    const ms = typeof step.waitFor === 'number' ? step.waitFor : step.waitFor.ms;
    await page.waitForTimeout(ms || 0);
    return;
  }
  throw new Error(`Unsupported step: ${JSON.stringify(step)}`);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
  });
});

const specs = readSpecs();

for (const spec of specs) {
  const title = spec.name || spec.title || spec.file;
  test(title, async ({ page }) => {
    for (const step of spec.steps || []) {
      await runStep(page, step);
    }
  });
}
