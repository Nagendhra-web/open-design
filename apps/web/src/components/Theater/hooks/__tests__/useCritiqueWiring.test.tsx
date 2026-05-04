// @vitest-environment jsdom
/**
 * Tests for useCritiqueWiring.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../../../types.js';
import { useCritiqueWiring } from '../useCritiqueWiring.js';

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'api',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: null,
    skillId: null,
    designSystemId: null,
    ...overrides,
  };
}

describe('useCritiqueWiring', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enabled defaults to false when critiqueTheaterEnabled is undefined', () => {
    const { result } = renderHook(() =>
      useCritiqueWiring('proj-1', baseConfig()),
    );
    expect(result.current.enabled).toBe(false);
  });

  it('enabled is true when critiqueTheaterEnabled is true', () => {
    const { result } = renderHook(() =>
      useCritiqueWiring('proj-1', baseConfig({ critiqueTheaterEnabled: true })),
    );
    expect(result.current.enabled).toBe(true);
  });

  it('onInterrupt POSTs to the correct endpoint', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() =>
      useCritiqueWiring('proj-1', baseConfig()),
    );

    result.current.onInterrupt('run-abc');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/critique/run-abc/interrupt',
      { method: 'POST' },
    );
  });

  it('onRerun POSTs to the correct endpoint', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() =>
      useCritiqueWiring('proj-1', baseConfig()),
    );

    result.current.onRerun('art-xyz');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/artifacts/art-xyz/critique/rerun',
      { method: 'POST' },
    );
  });

  it('onInterrupt is a no-op when runId is empty', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() =>
      useCritiqueWiring('proj-1', baseConfig()),
    );

    result.current.onInterrupt('');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('onRerun is a no-op when artifactId is empty', () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() =>
      useCritiqueWiring('proj-1', baseConfig()),
    );

    result.current.onRerun('');

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
