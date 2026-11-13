import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Graceful Degradation & Fallbacks', () => {
  test('renders StaticDioramaFallback when WebGL2 is unavailable with zero pageerrors', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto('/');

    const fallback = page.getByTestId('static-diorama-fallback');
    await expect(fallback).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('canvas')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: /Orlando in Ink & Light/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /4 PM Florida Squall/i })).toBeVisible();

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('recovers cleanly to StaticDioramaFallback on runtime webglcontextlost', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => Boolean(window.__SCENE_METRICS__), undefined, {
      timeout: 15_000,
    });

    await page.evaluate(() => {
      const el = document.querySelector('canvas');
      if (!el) throw new Error('Canvas missing before webglcontextlost');
      const evt = new Event('webglcontextlost', { cancelable: true });
      el.dispatchEvent(evt);
    });

    await expect(page.getByTestId('static-diorama-fallback')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('Live Orlando mode degrades gracefully when /api/orlando-weather returns 500 or aborts', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.route('**/api/orlando-weather', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Upstream timeout' }),
      });
    });

    await page.goto('/');
    await page.waitForSelector('canvas, [data-testid="static-diorama-fallback"]', {
      state: 'visible',
      timeout: 15_000,
    });

    await page.keyboard.press('l');
    const badge = page.getByTestId('live-weather-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toContainText(/Offline sky/i);
    expect(pageErrors).toEqual([]);
  });
});
