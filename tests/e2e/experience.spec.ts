import { expect, test } from '@playwright/test';

test.describe('Orlando in Ink & Light — WebGL Experience', () => {
  test('renders diorama within draw call/program budgets and supports scroll, [E] Explore orbit, and [L] Live toggle', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(/Orlando in Ink & Light/i);

    // Wait for post-paint canvas mount and GLB diorama load
    await page.waitForSelector('canvas', { state: 'visible', timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const m = window.__SCENE_METRICS__;
        return Boolean(m && m.drawCalls > 0 && m.triangles > 1000);
      },
      undefined,
      { timeout: 15_000 }
    );

    const initialMetrics = await page.evaluate(() => window.__SCENE_METRICS__);
    expect(initialMetrics).toBeDefined();
    expect(initialMetrics!.drawCalls).toBeGreaterThan(0);
    expect(initialMetrics!.drawCalls).toBeLessThanOrEqual(12);
    expect(initialMetrics!.programs).toBeGreaterThan(0);
    expect(initialMetrics!.programs).toBeLessThanOrEqual(8);
    expect(initialMetrics!.triangles).toBeGreaterThan(1000);
    expect(initialMetrics!.triangles).toBeLessThanOrEqual(45_000);
    expect(initialMetrics!.activeChapter).toBe('dawn');

    // Scroll progression through chapters 02 -> 03 -> 04
    await page.evaluate(() => {
      const target = document.querySelector('[data-chapter-id="storm"]');
      target?.scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(450);
    await page.waitForFunction(
      () => {
        const m = window.__SCENE_METRICS__;
        return Boolean(m && m.activeChapter === 'storm' && m.cameraJumpDelta < 0.25);
      },
      undefined,
      { timeout: 10_000 }
    );

    // Also test smooth [E] Explore handoff from storm/night chapter
    await page.keyboard.press('e');
    await page.waitForFunction(
      () => window.__SCENE_METRICS__?.mode === 'explore',
      undefined,
      { timeout: 5_000 }
    );

    const enterExploreMetrics = await page.evaluate(() => window.__SCENE_METRICS__);
    expect(enterExploreMetrics!.cameraJumpDelta).toBeLessThan(0.5);

    // Keyboard-only orbit and zoom in Explore mode
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('+');
    await page.waitForTimeout(150);

    // Toggle [E] back to Scroll mode cleanly with smooth handoff
    await page.keyboard.press('e');
    await page.waitForFunction(
      () => window.__SCENE_METRICS__?.mode === 'scroll',
      undefined,
      { timeout: 5_000 }
    );
    const exitExploreMetrics = await page.evaluate(() => window.__SCENE_METRICS__);
    expect(exitExploreMetrics!.cameraJumpDelta).toBeLessThan(0.5);

    // Toggle [L] Live Orlando mode
    await page.route('**/api/orlando-weather', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tempF: 79,
          conditionLabel: 'Partly cloudy',
          stormIntensity: 0.1,
          timeOfDay: 0.42,
          localTimeLabel: '4:15 PM EDT',
          fallback: false,
        }),
      });
    });

    await page.keyboard.press('l');
    await page.waitForFunction(
      () => window.__SCENE_METRICS__?.mode === 'live',
      undefined,
      { timeout: 5_000 }
    );
    await expect(page.getByTestId('live-weather-badge')).toContainText('79°F');

    await page.keyboard.press('l');
    await page.waitForFunction(
      () => window.__SCENE_METRICS__?.mode === 'scroll',
      undefined,
      { timeout: 5_000 }
    );

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
