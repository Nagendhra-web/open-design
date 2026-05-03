import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { getCritiqueRun, type CritiqueRunStatus } from './persistence.js';
import type { RunRegistry } from './run-registry.js';

/** HTTP status codes used by the interrupt endpoint. */
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_ACCEPTED = 202;

/**
 * POST /api/projects/:projectId/critique/:runId/interrupt
 *
 * Validates the run exists, belongs to the URL project, and is in 'running'
 * status, then signals the registered AbortController so the orchestrator
 * can flush best-so-far state and emit critique.interrupted.
 *
 * @see specs/current/critique-theater.md § interrupt endpoint (Task 6.1)
 */
export function handleCritiqueInterrupt(
  db: Database.Database,
  registry: RunRegistry,
): (req: Request, res: Response) => void {
  return function critiqueInterruptHandler(req: Request, res: Response): void {
    const projectId =
      typeof req.params['projectId'] === 'string'
        ? req.params['projectId'].trim()
        : '';
    const runId =
      typeof req.params['runId'] === 'string'
        ? req.params['runId'].trim()
        : '';

    if (!projectId || !runId) {
      res
        .status(HTTP_BAD_REQUEST)
        .json({ error: { code: 'BAD_REQUEST', message: 'projectId and runId are required' } });
      return;
    }

    const row = getCritiqueRun(db, runId);

    if (row === null || row.projectId !== projectId) {
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'critique run not found' } });
      return;
    }

    // row.status is typed as CritiqueRunStatus (terminal values); the DB also
    // stores 'running' for in-flight rows. Cast to the full set for this check.
    const liveStatus = row.status as CritiqueRunStatus | 'running';
    if (liveStatus !== 'running') {
      res
        .status(HTTP_CONFLICT)
        .json({
          error: {
            code: 'CONFLICT',
            message: `run is already in terminal status: ${row.status}`,
            currentStatus: row.status,
          },
        });
      return;
    }

    registry.interrupt(runId, 'user_requested');

    res.status(HTTP_ACCEPTED).json({
      runId,
      accepted: true,
      prevStatus: 'running',
    });
  };
}
