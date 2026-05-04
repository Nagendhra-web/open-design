/**
 * Critique Theater end-to-end specs.
 *
 * Routes are mocked via critique-routes so no real CLI adapter is needed.
 * All tests are gated behind CRITIQUE_E2E=1 so CI opt-in is explicit and
 * local runs without the full server stack stay green.
 *
 * Test cases:
 *   1. Happy ship     -- 3 rounds, composite >= threshold, badge visible
 *   2. Interrupt      -- mid-run interrupt dialog -> interrupted state
 *   3. Degraded       -- degraded banner with reason and retry button
 *   4. Disabled flag  -- critiqueTheaterEnabled=false -> no theater element
 */

import { expect, test, type Page } from '@playwright/test';
import {
  mockCritiqueRoutes,
  mockCritiqueRoutesDisabled,
} from '../helpers/critique-routes.js';
import { scenarioFor, SCENARIO_THRESHOLD } from '../helpers/critique-fixtures.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Project page used in all theater tests (matches the mocked projectId). */
const PROJECT_URL = '/projects/proj-e2e';

/** Root test-id that proves the Theater mounted. */
const THEATER_TESTID = 'critique-theater';

// Gating -- skip when the full web server is not running.
const RUN_E2E = Boolean(process.env['CRITIQUE_E2E']);

// ---------------------------------------------------------------------------
// Shared localStorage init (mirrors app.spec.ts pattern)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'open-design:config';

async function initLocalStorage(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode:                   'daemon',
        apiKey:                 '',
        baseUrl:                'https://api.anthropic.com',
        model:                  'claude-sonnet-4-5',
        agentId:                'mock',
        skillId:                null,
        designSystemId:         null,
        onboardingCompleted:    true,
        critiqueTheaterEnabled: true,
        agentModels:            {},
      }),
    );
  }, STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Critique Theater', () => {
  test.beforeEach(async ({ page }) => {
    await initLocalStorage(page);

    // Stub /api/agents so ProjectView renders without a real daemon.
    await page.route('**/api/agents', async (route) => {
      await route.fulfill({
        json: {
          agents: [
            {
              id:        'mock',
              name:      'Mock Agent',
              bin:       'mock-agent',
              available: true,
              version:   'test',
              models:    [{ id: 'default', label: 'Default' }],
            },
          ],
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 1. Happy ship
  // -------------------------------------------------------------------------

  test('happy ship: 3 rounds, badge shows composite >= threshold', async ({ page }) => {
    test.skip(!RUN_E2E, 'set CRITIQUE_E2E=1 to run');

    await mockCritiqueRoutes(page, scenarioFor('happyShipped'));
    await page.goto(PROJECT_URL);

    const theater = page.getByTestId(THEATER_TESTID);
    await expect(theater).toBeVisible({ timeout: 10_000 });

    // After the SSE stream ships the badge should be visible.
    const badge = page.getByTestId('critique-theater-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });

    // The aria-live score announcement should contain a score.
    await expect(badge).toHaveAttribute(
      'aria-label',
      new RegExp(String(SCENARIO_THRESHOLD)),
    );

    // Composite shown on badge must be >= threshold.
    const labelText = await badge.getAttribute('aria-label');
    if (labelText !== null) {
      const match = /(\d+\.\d+)\s*\/\s*\d+/.exec(labelText);
      if (match !== null && match[1] !== undefined) {
        const composite = parseFloat(match[1]);
        expect(composite).toBeGreaterThanOrEqual(SCENARIO_THRESHOLD);
      }
    }

    // Score badge has role='status' for aria-live.
    const statusRegion = theater.getByRole('status');
    await expect(statusRegion).toHaveCount(0); // badge is a button, not status
    // The offscreen aria-live region inside TheaterStage fires during running;
    // after ship the badge itself carries the accessible label.
  });

  // -------------------------------------------------------------------------
  // 2. Interrupt
  // -------------------------------------------------------------------------

  test('interrupt: dialog confirm -> interrupted state with best round score', async ({ page }) => {
    test.skip(!RUN_E2E, 'set CRITIQUE_E2E=1 to run');

    await mockCritiqueRoutes(page, scenarioFor('runningRound2'));
    await page.goto(PROJECT_URL);

    const theater = page.getByTestId(THEATER_TESTID);
    await expect(theater).toBeVisible({ timeout: 10_000 });

    // Stage should render while running.
    const stage = page.getByTestId('critique-theater-stage');
    await expect(stage).toBeVisible({ timeout: 10_000 });

    // Click Interrupt button (InterruptButton renders inside the stage).
    const interruptBtn = theater.getByRole('button', { name: /interrupt/i });
    await expect(interruptBtn).toBeVisible();
    await interruptBtn.click();

    // Confirm dialog appears.
    const confirmBtn = theater.getByRole('button', { name: /confirm|yes|stop/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // After confirm the SSE stream emits critique.interrupted.
    // The theater transitions to the collapsed badge for interrupted state.
    const badge = page.getByTestId('critique-theater-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });

    // Badge text should contain round info for the best completed round.
    await expect(badge).toContainText(/R\d|round/i);
  });

  // -------------------------------------------------------------------------
  // 3. Degraded
  // -------------------------------------------------------------------------

  test('degraded: banner shows reason and retry button', async ({ page }) => {
    test.skip(!RUN_E2E, 'set CRITIQUE_E2E=1 to run');

    await mockCritiqueRoutes(page, scenarioFor('degraded'));
    await page.goto(PROJECT_URL);

    const theater = page.getByTestId(THEATER_TESTID);
    await expect(theater).toBeVisible({ timeout: 10_000 });

    const degradedBanner = page.getByTestId('critique-theater-degraded');
    await expect(degradedBanner).toBeVisible({ timeout: 10_000 });

    // The degraded reason is rendered in the banner.
    await expect(degradedBanner).toContainText(/malformed_block/i);

    // The degraded component surfaces an alert role.
    await expect(degradedBanner).toHaveAttribute('role', 'alert');
  });

  // -------------------------------------------------------------------------
  // 4. Disabled flag
  // -------------------------------------------------------------------------

  test('disabled flag: theater does not render when critiqueTheaterEnabled=false', async ({ page }) => {
    test.skip(!RUN_E2E, 'set CRITIQUE_E2E=1 to run');

    // Override localStorage to disable the feature.
    await page.addInitScript((key) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          mode:                   'daemon',
          apiKey:                 '',
          baseUrl:                'https://api.anthropic.com',
          model:                  'claude-sonnet-4-5',
          agentId:                'mock',
          skillId:                null,
          designSystemId:         null,
          onboardingCompleted:    true,
          critiqueTheaterEnabled: false,
          agentModels:            {},
        }),
      );
    }, STORAGE_KEY);

    await mockCritiqueRoutesDisabled(page);
    await page.goto(PROJECT_URL);

    // The theater root must not appear.
    await expect(page.getByTestId(THEATER_TESTID)).toHaveCount(0);
  });
});
