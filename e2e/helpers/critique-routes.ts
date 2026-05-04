/**
 * critique-routes: Playwright route handlers that mock the Critique Theater
 * backend endpoints so specs run deterministically without a real CLI adapter.
 *
 * Intercepts:
 *   GET  /api/projects/:id/events          -> SSE body from scenario
 *   POST /api/projects/:id/critique/:runId/interrupt  -> 202 envelope
 *   POST /api/projects/:id/artifacts/:aid/critique/rerun -> 202 envelope
 *   GET  /api/config                        -> critiqueTheaterEnabled: true
 *
 * Usage:
 *   await mockCritiqueRoutes(page, scenarioFor('happyShipped'));
 *   await page.goto('/projects/proj-e2e');
 */

import type { Page } from '@playwright/test';
import type { Scenario } from './critique-fixtures.js';
import { scenarioToSseBody } from './critique-sse.js';

const SSE_HEADERS: Record<string, string> = {
  'content-type':  'text/event-stream',
  'cache-control': 'no-cache',
  connection:      'keep-alive',
};

const JSON_202 = JSON.stringify({ ok: true });

/**
 * Registers all Critique Theater route mocks on the given Playwright page.
 * Must be called before page.goto().
 */
export async function mockCritiqueRoutes(page: Page, scenario: Scenario): Promise<void> {
  if (!page) {
    throw new Error('mockCritiqueRoutes: page is required');
  }
  if (!scenario) {
    throw new Error('mockCritiqueRoutes: scenario is required');
  }

  const sseBody = scenarioToSseBody(scenario);

  // 1. Project SSE event bus (EventSource endpoint used by useCritiqueStream)
  await page.route('**/api/projects/*/events', async (route) => {
    await route.fulfill({
      status:  200,
      headers: SSE_HEADERS,
      body:    sseBody,
    });
  });

  // 2. Interrupt POST
  await page.route('**/api/projects/*/critique/*/interrupt', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status:      202,
        contentType: 'application/json',
        body:        JSON_202,
      });
    } else {
      await route.continue();
    }
  });

  // 3. Rerun POST
  await page.route('**/api/projects/*/artifacts/*/critique/rerun', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status:      202,
        contentType: 'application/json',
        body:        JSON_202,
      });
    } else {
      await route.continue();
    }
  });

  // 4. App config -- return critiqueTheaterEnabled: true so TheaterContainer mounts
  await page.route('**/api/config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({
          config: {
            onboardingCompleted:     true,
            critiqueTheaterEnabled:  true,
            agentId:                 'mock',
            agentModels:             {},
            skillId:                 null,
            designSystemId:          null,
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Variant that explicitly sets critiqueTheaterEnabled to false.
 * Used to verify the "disabled flag" path.
 */
export async function mockCritiqueRoutesDisabled(page: Page): Promise<void> {
  if (!page) {
    throw new Error('mockCritiqueRoutesDisabled: page is required');
  }

  await page.route('**/api/config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({
          config: {
            onboardingCompleted:     true,
            critiqueTheaterEnabled:  false,
            agentId:                 'mock',
            agentModels:             {},
            skillId:                 null,
            designSystemId:          null,
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}
