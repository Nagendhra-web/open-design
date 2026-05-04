/**
 * Critique Theater accessibility self-audit.
 *
 * Runs axe-playwright against the Theater root for each rendered phase,
 * enforcing WCAG 2.1 AA. Any AA violation fails the test so the panel
 * the a11y-panelist would reject is caught in CI, not at review time.
 *
 * Gated behind CRITIQUE_E2E=1.
 */

import { expect, test } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';
import { mockCritiqueRoutes } from '../helpers/critique-routes.js';
import { scenarioFor } from '../helpers/critique-fixtures.js';
import type { ScenarioName } from '../helpers/critique-fixtures.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_URL = '/projects/proj-e2e';
const THEATER_TESTID = 'critique-theater';
const STORAGE_KEY = 'open-design:config';

const A11Y_SCENARIOS: ReadonlyArray<ScenarioName> = [
  'happyShipped',
  'runningRound2',
  'degraded',
  'interrupted',
];

const RUN_E2E = Boolean(process.env['CRITIQUE_E2E']);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Critique Theater a11y (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
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
          critiqueTheaterEnabled: true,
          agentModels:            {},
        }),
      );
    }, STORAGE_KEY);

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

  for (const scenarioName of A11Y_SCENARIOS) {
    test(`a11y ${scenarioName}`, async ({ page }) => {
      test.skip(!RUN_E2E, 'set CRITIQUE_E2E=1 to run');

      await mockCritiqueRoutes(page, scenarioFor(scenarioName));
      await page.goto(PROJECT_URL);

      await page.waitForSelector(`[data-testid="${THEATER_TESTID}"]`, { timeout: 10_000 });

      await injectAxe(page);

      await checkA11y(
        page,
        `[data-testid="${THEATER_TESTID}"]`,
        {
          detailedReport: true,
          detailedReportOptions: { html: true },
          axeOptions: {
            runOnly: {
              type:   'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
            },
          },
        },
      );

      // Extra assertion: the theater root itself must be reachable.
      await expect(page.getByTestId(THEATER_TESTID)).toBeVisible();
    });
  }
});
