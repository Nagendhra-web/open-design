/**
 * Critique Theater visual regression specs.
 *
 * Captures screenshots at 375 / 768 / 1280 px widths for 4 named scenarios.
 * First run creates the baseline PNGs in the Playwright snapshot directory.
 * Subsequent runs diff against those baselines.
 *
 * Gated behind CRITIQUE_E2E=1 -- CI opts in; local runs without the server stay green.
 */

import { expect, test } from '@playwright/test';
import { mockCritiqueRoutes } from '../helpers/critique-routes.js';
import { scenarioFor } from '../helpers/critique-fixtures.js';
import type { ScenarioName } from '../helpers/critique-fixtures.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_URL = '/projects/proj-e2e';
const THEATER_TESTID = 'critique-theater';
const STORAGE_KEY = 'open-design:config';

const VIEWPORTS = [
  { name: 'mobile',  width: 375, height: 800  },
  { name: 'tablet',  width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const VISUAL_SCENARIOS: ReadonlyArray<ScenarioName> = [
  'happyShipped',
  'runningRound2',
  'degraded',
  'interrupted',
];

const RUN_E2E = Boolean(process.env['CRITIQUE_E2E']);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  for (const scenarioName of VISUAL_SCENARIOS) {
    test(`visual ${viewport.name} ${scenarioName}`, async ({ page }) => {
      test.skip(!RUN_E2E, 'set CRITIQUE_E2E=1 to run');

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

      // Stub agents so ProjectView renders.
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

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockCritiqueRoutes(page, scenarioFor(scenarioName));
      await page.goto(PROJECT_URL);

      // Wait for the theater root to appear before snapping.
      await page.waitForSelector(`[data-testid="${THEATER_TESTID}"]`, { timeout: 10_000 });

      // Mask any time-varying chrome to keep snapshots deterministic.
      const masks = [page.getByTestId('runtime-timestamp')];

      await expect(page).toHaveScreenshot(`${scenarioName}-${viewport.name}.png`, {
        mask:       masks,
        animations: 'disabled',
        timeout:    5_000,
      });
    });
  }
}
