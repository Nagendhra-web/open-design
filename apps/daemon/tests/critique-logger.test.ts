import { describe, expect, it } from 'vitest';
import {
  createCritiqueLogger,
  MemorySink,
} from '../src/critique/logger.js';

describe('CritiqueLogger', () => {
  it('emits one JSON line per call with required fields', () => {
    const sink = new MemorySink();
    const logger = createCritiqueLogger({ level: 'debug', sink });
    logger.info('run.start', 'started run', { runId: 'r1', adapter: 'plain' });
    expect(sink.records).toHaveLength(1);
    const r = sink.records[0]!;
    expect(r.level).toBe('info');
    expect(r.subsystem).toBe('critique');
    expect(r.event).toBe('run.start');
    expect(r.message).toBe('started run');
    expect(r.runId).toBe('r1');
    expect(r.adapter).toBe('plain');
    expect(typeof r.ts).toBe('string');
    expect(typeof r.seq).toBe('number');
    expect(() => JSON.parse(sink.lines[0]!)).not.toThrow();
  });

  it('respects the level filter', () => {
    const sink = new MemorySink();
    const logger = createCritiqueLogger({ level: 'warn', sink });
    logger.debug('a', 'a');
    logger.info('b', 'b');
    logger.warn('c', 'c');
    logger.error('d', 'd');
    expect(sink.records.map((r) => r.event)).toEqual(['c', 'd']);
  });

  it('withContext merges fields into every emitted record', () => {
    const sink = new MemorySink();
    const base = createCritiqueLogger({ level: 'debug', sink });
    const child = base.withContext({ runId: 'r1', projectId: 'p1' });
    child.info('e1', 'm1');
    child.info('e2', 'm2', { round: 3 });
    expect(sink.records[0]!.runId).toBe('r1');
    expect(sink.records[0]!.projectId).toBe('p1');
    expect(sink.records[1]!.round).toBe(3);
  });

  it('per-call ctx overrides withContext defaults', () => {
    const sink = new MemorySink();
    const logger = createCritiqueLogger({ level: 'debug', sink })
      .withContext({ runId: 'r-default' });
    logger.info('e', 'm', { runId: 'r-override' });
    expect(sink.records[0]!.runId).toBe('r-override');
  });

  it('handles non-serializable fields without throwing', () => {
    const sink = new MemorySink();
    const logger = createCritiqueLogger({ level: 'debug', sink });
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => logger.info('e', 'm', { cyclic })).not.toThrow();
    expect(sink.records).toHaveLength(1);
    expect(sink.lines[0]).toContain('[unserializable:object]');
  });

  it('seq is monotonically increasing within a process', () => {
    const sink = new MemorySink();
    const logger = createCritiqueLogger({ level: 'debug', sink });
    logger.info('a', '1');
    logger.info('b', '2');
    logger.info('c', '3');
    expect(sink.records[1]!.seq).toBeGreaterThan(sink.records[0]!.seq);
    expect(sink.records[2]!.seq).toBeGreaterThan(sink.records[1]!.seq);
  });

  it('uses ISO 8601 timestamps from the injected clock', () => {
    const sink = new MemorySink();
    const logger = createCritiqueLogger({
      level: 'debug',
      sink,
      now: () => Date.UTC(2026, 4, 4, 12, 0, 0),
    });
    logger.info('e', 'm');
    expect(sink.records[0]!.ts).toBe('2026-05-04T12:00:00.000Z');
  });
});
