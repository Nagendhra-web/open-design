/**
 * critique-sse: converts a Scenario into a real text/event-stream response body.
 *
 * Each CritiqueSseEvent becomes:
 *
 *   event: critique.run_started\n
 *   data: {"runId":"r1",...}\n
 *   \n
 *
 * The resulting string can be fed directly to route.fulfill({ body }).
 */

import type { CritiqueSseEvent, Scenario } from './critique-fixtures.js';

/**
 * Encodes a single SSE frame.
 * id is optional; if the event has one it is included.
 */
function encodeFrame(event: string, data: unknown, id?: string): string {
  const lines: string[] = [];
  if (id !== undefined && id.length > 0) {
    lines.push(`id: ${id}`);
  }
  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

/**
 * Converts every event in the scenario into an SSE body string.
 * The result is the complete response body for a text/event-stream endpoint.
 */
export function scenarioToSseBody(scenario: Scenario): string {
  if (scenario.events.length === 0) {
    throw new Error(`critique-sse: scenario "${scenario.name}" has no events`);
  }

  return scenario.events
    .map((e) => encodeFrame(e.event, e.data, e.id))
    .join('');
}
