/**
 * useCritiqueWiring — thin adapter consumed by ProjectView.
 *
 * Returns the three values ProjectView needs to render TheaterContainer:
 *   enabled     — read from AppConfig.critiqueTheaterEnabled (default false).
 *   onInterrupt — POSTs to /api/projects/:projectId/critique/:runId/interrupt.
 *   onRerun     — POSTs to /api/projects/:projectId/artifacts/:artifactId/critique/rerun.
 *
 * Errors are swallowed (non-fatal UI callbacks); callers do not need
 * try/catch at the call site.
 */

import { useCallback } from 'react';
import type { AppConfig } from '../../../types.js';

export interface UseCritiqueWiringResult {
  enabled: boolean;
  onInterrupt: (runId: string) => void;
  onRerun: (artifactId: string) => void;
}

export function useCritiqueWiring(
  projectId: string,
  config: AppConfig,
): UseCritiqueWiringResult {
  if (!projectId) {
    throw new Error('useCritiqueWiring: projectId is required');
  }

  const enabled = config.critiqueTheaterEnabled ?? false;

  const onInterrupt = useCallback(
    (runId: string) => {
      if (!runId) return;
      void fetch(
        `/api/projects/${encodeURIComponent(projectId)}/critique/${encodeURIComponent(runId)}/interrupt`,
        { method: 'POST' },
      ).catch(() => {
        // Non-fatal — the UI already shows the interrupted state via SSE.
      });
    },
    [projectId],
  );

  const onRerun = useCallback(
    (artifactId: string) => {
      if (!artifactId) return;
      void fetch(
        `/api/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/critique/rerun`,
        { method: 'POST' },
      ).catch(() => {
        // Non-fatal — re-run is a best-effort trigger.
      });
    },
    [projectId],
  );

  return { enabled, onInterrupt, onRerun };
}
