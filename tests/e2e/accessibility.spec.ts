import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Accessibility & Reduced Motion', () => {
  test('passes axe-core WCAG audit with zero violations and supports keyboard focus', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('canvas, [data-testid="static-diorama-fallback"]', {
      state: 'visible',
      timeout: 15_000,
    });

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    // Keyboard tab reaches interactive controls with visible focus
    await page.keyboard.press('Tab');
    const firstFocusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocusedTag).toBe('A');

    const skipLink = page.getByRole('link', { name: /Skip to story/i });
    await expect(skipLink).toBeFocused();
  });

  test('honors prefers-reduced-motion: disables lightning and navigates chapters 1-4 cleanly', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await page.waitForSelector('canvas, [data-testid="static-diorama-fallback"]', {
      state: 'visible',
      timeout: 15_000,
    });

    // Navigate chapters via keyboard shortcuts 1..4
    await page.keyboard.press('3');
    const ch3Btn = page.getByRole('button', { name: /4 PM Florida Squall/i });
    await expect(ch3Btn).toHaveAttribute('aria-pressed', 'true');

    // Wait several animation frames during storm chapter and assert lightningFlash stays 0
    await page.waitForTimeout(400);
    const metrics = await page.evaluate(() => window.__SCENE_METRICS__);
    if (metrics) {
      expect(metrics.reducedMotion).toBe(true);
      expect(metrics.lightningFlash).toBe(0);
    }

    await page.keyboard.press('4');
    const ch4Btn = page.getByRole('button', { name: /City in Ink & Gold/i });
    await expect(ch4Btn).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('1');
    const ch1Btn = page.getByRole('button', { name: /First Light on Lake Eola/i });
    await expect(ch1Btn).toHaveAttribute('aria-pressed', 'true');
  });
});
