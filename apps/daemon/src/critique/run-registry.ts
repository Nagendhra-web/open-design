/**
 * In-process registry of in-flight critique runs. The daemon process is the
 * single owner of all critique state; the registry exists so the interrupt
 * endpoint can cascade an AbortController to the orchestrator that owns the
 * spawned CLI. The registry is intentionally NOT persisted: a daemon restart
 * mid-run is handled by reconcileStaleRuns on boot, not by recovering live
 * AbortControllers.
 *
 * @see specs/current/critique-theater.md § Failure modes (interrupt)
 */

/** Handle for a single in-flight critique run. */
export interface RunHandle {
  runId: string;
  projectId: string;
  abort: AbortController;
  startedAt: number;
}

/** Public surface of the in-process run registry. */
export interface RunRegistry {
  /**
   * Register a new in-flight handle. Throws if a handle with the same runId
   * is already registered (indicates a bug in the caller, not a user error).
   */
  register(handle: RunHandle): void;

  /**
   * Returns the handle if found; null if not registered or already torn down.
   */
  get(runId: string): RunHandle | null;

  /**
   * Signals the AbortController for the given runId.
   * Returns true if the runId was found and aborted; false otherwise.
   */
  interrupt(runId: string, reason?: string): boolean;

  /** Removes the entry for runId (called by the server after orchestrator settles). */
  unregister(runId: string): void;

  /**
   * Snapshot for diagnostics only. Returns a defensive copy so callers cannot
   * mutate the registry's internal state.
   */
  list(): RunHandle[];
}

/**
 * Creates an in-memory RunRegistry backed by a Map.
 * Node is single-threaded; no locking is needed.
 *
 * @see specs/current/critique-theater.md § interrupt endpoint (Task 6.1)
 */
export function createRunRegistry(): RunRegistry {
  const store = new Map<string, RunHandle>();

  return {
    register(handle: RunHandle): void {
      if (store.has(handle.runId)) {
        throw new Error(
          `RunRegistry: duplicate runId "${handle.runId}"; unregister before re-registering`,
        );
      }
      store.set(handle.runId, handle);
    },

    get(runId: string): RunHandle | null {
      return store.get(runId) ?? null;
    },

    interrupt(runId: string, reason?: string): boolean {
      const handle = store.get(runId);
      if (handle === undefined) return false;
      handle.abort.abort(reason);
      return true;
    },

    unregister(runId: string): void {
      store.delete(runId);
    },

    list(): RunHandle[] {
      return [...store.values()];
    },
  };
}
