import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getLatestCritiqueRunByArtifact, insertCritiqueRun } from './persistence.js';
import type { CritiqueConfig } from '@open-design/contracts/critique';

/** HTTP status codes used by the rerun endpoint. */
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_ACCEPTED = 202;

/** Prefix used for rerun IDs. */
const CRUN_PREFIX = 'crun_';

/**
 * Generates a new critique run ID with the standard prefix and 8 random hex chars.
 * Format: crun_<8 hex chars>
 */
function generateRunId(): string {
  return `${CRUN_PREFIX}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export interface RerunDeps {
  db: Database.Database;
  cfg: CritiqueConfig;
  /** Looks up a project by id; returns the project row or null. */
  getProject: (id: string) => unknown | null;
  /** Resolved absolute path to the artifacts directory. */
  artifactsDir: string;
  /**
   * Starts the orchestrator in the background for the new run.
   * Injected so tests can stub it out without waiting for a real spawn.
   */
  startCritiqueRun: (params: StartCritiqueRunParams) => void;
}

export interface StartCritiqueRunParams {
  runId: string;
  projectId: string;
  artifactId: string;
  artifactDir: string;
  conversationId: string | null;
  cfg: CritiqueConfig;
}

/**
 * POST /api/projects/:projectId/artifacts/:artifactId/critique/rerun
 *
 * Looks up the most recent critique run for the artifact, creates a new
 * 'running' row, fires the orchestrator in the background, and responds 202
 * immediately so the caller never blocks on run completion.
 *
 * @see specs/current/critique-theater.md § rerun endpoint (Task 6.2)
 */
export function handleCritiqueRerun(deps: RerunDeps): (req: Request, res: Response) => void {
  return function critiqueRerunHandler(req: Request, res: Response): void {
    const projectId =
      typeof req.params['projectId'] === 'string'
        ? req.params['projectId'].trim()
        : '';
    const artifactId =
      typeof req.params['artifactId'] === 'string'
        ? req.params['artifactId'].trim()
        : '';

    if (!projectId || !artifactId) {
      res
        .status(HTTP_BAD_REQUEST)
        .json({ error: { code: 'BAD_REQUEST', message: 'projectId and artifactId are required' } });
      return;
    }

    // Validate optional body fields.
    const body: unknown = req.body ?? {};
    if (body !== null && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if ('overrideBrief' in b && typeof b['overrideBrief'] !== 'string') {
        res
          .status(HTTP_BAD_REQUEST)
          .json({ error: { code: 'BAD_REQUEST', message: 'overrideBrief must be a string' } });
        return;
      }
      if ('attachPriorArtifact' in b && typeof b['attachPriorArtifact'] !== 'boolean') {
        res
          .status(HTTP_BAD_REQUEST)
          .json({ error: { code: 'BAD_REQUEST', message: 'attachPriorArtifact must be a boolean' } });
        return;
      }
    }

    const { db, cfg, getProject, artifactsDir, startCritiqueRun } = deps;

    // Validate project exists.
    const project = getProject(projectId);
    if (project === null || project === undefined) {
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'project not found' } });
      return;
    }

    // Look up the most recent run for this artifact.
    const priorRun = getLatestCritiqueRunByArtifact(db, projectId, artifactId);
    if (priorRun === null) {
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'no prior critique run found for this artifact' } });
      return;
    }

    const newRunId = generateRunId();
    const artifactDir = `${artifactsDir}/${artifactId}`;

    // Insert the new run row with status 'running' before firing the background task
    // so the row is always visible to callers by the time the 202 lands.
    insertCritiqueRun(db, {
      id: newRunId,
      projectId,
      conversationId: priorRun.conversationId ?? null,
      artifactPath: null,
      status: 'running',
      protocolVersion: cfg.protocolVersion,
    });

    // Fire-and-forget: the orchestrator owns the run lifecycle from here.
    startCritiqueRun({
      runId: newRunId,
      projectId,
      artifactId,
      artifactDir,
      conversationId: priorRun.conversationId ?? null,
      cfg,
    });

    res.status(HTTP_ACCEPTED).json({
      newRunId,
      artifactDir,
    });
  };
}
