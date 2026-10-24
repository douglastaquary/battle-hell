import { expect, test } from '@playwright/test';

test('shotgun kill drops a soul crystal', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await page.locator('#weapon-confirm').click();

  const hooks = await page.evaluateHandle(() => window.__THREE_GAME_TEST_HOOKS__);
  const applied = await hooks.evaluate(async (h) => {
    if (!h || typeof h.setState !== 'function') throw new Error('missing hooks');
    return h.setState('kill-drop');
  });
  expect(applied).toEqual({ state: 'kill-drop' });

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return { enemies: d?.enemies ?? -1, pickups: d?.pickups ?? -1 };
      }),
    )
    .toEqual({ enemies: 0, pickups: 1 });
});
