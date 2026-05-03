/**
 * Tests for POST /api/projects/:projectId/artifacts/:artifactId/critique/rerun
 *
 * Each test mounts the handler on a fresh express mini-app with an in-memory
 * SQLite database and a stubbed startCritiqueRun so the test suite never waits
 * for a real orchestrator to complete.
 *
 * @see specs/current/critique-theater.md § rerun endpoint (Task 6.2)
 */
import http from 'node:http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import {
  migrateCritique,
  insertCritiqueRun,
  getCritiqueRun,
} from '../src/critique/persistence.js';
import { handleCritiqueRerun, type RerunDeps } from '../src/critique/rerun-handler.js';
import { defaultCritiqueConfig } from '@open-design/contracts/critique';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Project 1', 0, 0);
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'Project 2', 0, 0);
  `);
  migrateCritique(db);
  return db;
}

const ARTIFACTS_DIR = '/tmp/od-test-artifacts';

function makeDeps(
  db: Database.Database,
  startCritiqueRun: RerunDeps['startCritiqueRun'] = vi.fn(),
): RerunDeps {
  const cfg = defaultCritiqueConfig();
  return {
    db,
    cfg,
    getProject: (id: string) => {
      const row = db
        .prepare('SELECT id FROM projects WHERE id = ?')
        .get(id) as { id: string } | undefined;
      return row ?? null;
    },
    artifactsDir: ARTIFACTS_DIR,
    startCritiqueRun,
  };
}

function startMiniServer(
  deps: RerunDeps,
): Promise<{ baseUrl: string; server: http.Server }> {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/projects/:projectId/artifacts/:artifactId/critique/rerun',
    handleCritiqueRerun(deps),
  );
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr !== 'object') {
        reject(new Error('could not bind'));
        return;
      }
      resolve({ baseUrl: `http://127.0.0.1:${addr.port}`, server });
    });
    server.on('error', reject);
  });
}

async function post(
  url: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : '{}',
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/projects/:projectId/artifacts/:artifactId/critique/rerun', () => {
  let db: Database.Database;
  let baseUrl: string;
  let server: http.Server;
  let startFn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = freshDb();
    startFn = vi.fn();
    const deps = makeDeps(db, startFn);
    ({ baseUrl, server } = await startMiniServer(deps));
  });

  afterEach(() => {
    db.close();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ---- 202: happy path -------------------------------------------------------

  it('returns 202 with a new runId for a valid project + artifact + prior run', async () => {
    insertCritiqueRun(db, {
      id: 'crun_orig',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/art1/artifact.html`,
    });

    const { status, json } = await post(
      `${baseUrl}/api/projects/p1/artifacts/art1/critique/rerun`,
    );

    expect(status).toBe(202);
    const body = json as Record<string, unknown>;
    expect(typeof body['newRunId']).toBe('string');
    expect((body['newRunId'] as string).startsWith('crun_')).toBe(true);
    expect(body['artifactDir']).toBe(`${ARTIFACTS_DIR}/art1`);
  });

  it('inserts a new critique_runs row with status running', async () => {
    insertCritiqueRun(db, {
      id: 'crun_orig2',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/art2/artifact.html`,
    });

    const { json } = await post(
      `${baseUrl}/api/projects/p1/artifacts/art2/critique/rerun`,
    );

    const body = json as Record<string, unknown>;
    const newRunId = body['newRunId'] as string;
    const newRow = getCritiqueRun(db, newRunId);
    expect(newRow).not.toBeNull();
    expect(newRow?.status).toBe('running');
    expect(newRow?.projectId).toBe('p1');
  });

  it('does not mutate the original critique_runs row', async () => {
    insertCritiqueRun(db, {
      id: 'crun_orig3',
      projectId: 'p1',
      status: 'below_threshold',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/art3/artifact.html`,
    });

    await post(`${baseUrl}/api/projects/p1/artifacts/art3/critique/rerun`);

    const orig = getCritiqueRun(db, 'crun_orig3');
    expect(orig?.status).toBe('below_threshold');
  });

  it('calls startCritiqueRun with the new runId and correct params', async () => {
    insertCritiqueRun(db, {
      id: 'crun_orig4',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/art4/artifact.html`,
      conversationId: null,
    });

    const { json } = await post(
      `${baseUrl}/api/projects/p1/artifacts/art4/critique/rerun`,
    );

    const body = json as Record<string, unknown>;
    expect(startFn).toHaveBeenCalledOnce();
    const callArg = startFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg['runId']).toBe(body['newRunId']);
    expect(callArg['projectId']).toBe('p1');
    expect(callArg['artifactId']).toBe('art4');
  });

  it('reuses the original conversationId', async () => {
    db.exec(`
      INSERT INTO conversations (id, project_id, created_at, updated_at)
      VALUES ('conv1', 'p1', 0, 0);
    `);
    insertCritiqueRun(db, {
      id: 'crun_conv',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/art5/artifact.html`,
      conversationId: 'conv1',
    });

    await post(`${baseUrl}/api/projects/p1/artifacts/art5/critique/rerun`);

    const callArg = startFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg['conversationId']).toBe('conv1');
  });

  // ---- 404: unknown project --------------------------------------------------

  it('returns 404 for unknown project', async () => {
    const { status } = await post(
      `${baseUrl}/api/projects/no-such-project/artifacts/art1/critique/rerun`,
    );
    expect(status).toBe(404);
  });

  // ---- 404: unknown artifact / no prior run ----------------------------------

  it('returns 404 for an artifact with no prior critique run', async () => {
    const { status } = await post(
      `${baseUrl}/api/projects/p1/artifacts/no-prior-run/critique/rerun`,
    );
    expect(status).toBe(404);
  });

  // ---- 400: malformed body ---------------------------------------------------

  it('returns 400 when overrideBrief is not a string', async () => {
    insertCritiqueRun(db, {
      id: 'crun_body1',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/artB/artifact.html`,
    });

    const { status } = await post(
      `${baseUrl}/api/projects/p1/artifacts/artB/critique/rerun`,
      { overrideBrief: 42 },
    );
    expect(status).toBe(400);
  });

  it('returns 400 when attachPriorArtifact is not a boolean', async () => {
    insertCritiqueRun(db, {
      id: 'crun_body2',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/artC/artifact.html`,
    });

    const { status } = await post(
      `${baseUrl}/api/projects/p1/artifacts/artC/critique/rerun`,
      { attachPriorArtifact: 'yes' },
    );
    expect(status).toBe(400);
  });

  it('accepts valid optional body fields without error', async () => {
    insertCritiqueRun(db, {
      id: 'crun_body3',
      projectId: 'p1',
      status: 'shipped',
      protocolVersion: 1,
      artifactPath: `${ARTIFACTS_DIR}/artD/artifact.html`,
    });

    const { status } = await post(
      `${baseUrl}/api/projects/p1/artifacts/artD/critique/rerun`,
      { overrideBrief: 'new brief', attachPriorArtifact: true },
    );
    expect(status).toBe(202);
  });

  // ---- no unhandled throws ---------------------------------------------------

  it('does not throw to the framework error handler on any error path', async () => {
    const { status } = await post(
      `${baseUrl}/api/projects/p1/artifacts/ghost/critique/rerun`,
    );
    expect(status).toBe(404);
  });
});
