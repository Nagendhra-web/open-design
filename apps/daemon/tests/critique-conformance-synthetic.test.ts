import { describe, it, expect } from 'vitest';
import {
  syntheticGoodStdout,
  syntheticBadStdout,
} from '../src/critique/conformance/synthetic.js';
import { parseCritiqueStream } from '../src/critique/parser.js';
import { MalformedBlockError } from '../src/critique/errors.js';
import { defaultCritiqueConfig } from '@open-design/contracts/critique';

const cfg = defaultCritiqueConfig();

async function collectChunks(gen: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

async function concat(gen: AsyncIterable<string>): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of gen) {
    parts.push(chunk);
  }
  return parts.join('');
}

describe('syntheticGoodStdout', () => {
  it('yields at least one chunk', async () => {
    const chunks = await collectChunks(syntheticGoodStdout());
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('concatenated output is parseable and results in a shipped run', async () => {
    const events: string[] = [];
    let shipEvent: { type: string; composite: number } | null = null;

    for await (const event of parseCritiqueStream(syntheticGoodStdout(), {
      runId: 'test-good',
      adapter: 'synthetic-good',
      parserMaxBlockBytes: cfg.parserMaxBlockBytes,
    })) {
      events.push(event.type);
      if (event.type === 'ship') {
        shipEvent = { type: event.type, composite: event.composite };
      }
    }

    expect(events).toContain('run_started');
    expect(events).toContain('ship');
    expect(shipEvent).not.toBeNull();
    expect(shipEvent!.composite).toBeGreaterThanOrEqual(8);
  });

  it('default chunk size is 64 bytes (chunks are <= 64 chars)', async () => {
    const chunks = await collectChunks(syntheticGoodStdout());
    for (const chunk of chunks.slice(0, -1)) {
      // All chunks except possibly the last must be exactly chunkSize.
      expect(chunk.length).toBeLessThanOrEqual(64);
    }
  });

  it('custom chunkSize is honoured', async () => {
    const chunks = await collectChunks(syntheticGoodStdout({ chunkSize: 10 }));
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
  });

  it('content is identical regardless of chunk size', async () => {
    const full1 = await concat(syntheticGoodStdout({ chunkSize: 1 }));
    const full64 = await concat(syntheticGoodStdout({ chunkSize: 64 }));
    const full512 = await concat(syntheticGoodStdout({ chunkSize: 512 }));
    expect(full1).toBe(full64);
    expect(full64).toBe(full512);
  });

  it('parsed run_started event has protocolVersion 1', async () => {
    for await (const event of parseCritiqueStream(syntheticGoodStdout(), {
      runId: 'pv-test',
      adapter: 'synthetic-good',
      parserMaxBlockBytes: cfg.parserMaxBlockBytes,
    })) {
      if (event.type === 'run_started') {
        expect(event.protocolVersion).toBe(1);
        break;
      }
    }
  });

  it('parsed run produces exactly 3 round_end events', async () => {
    let roundEndCount = 0;
    for await (const event of parseCritiqueStream(syntheticGoodStdout(), {
      runId: 'rounds-test',
      adapter: 'synthetic-good',
      parserMaxBlockBytes: cfg.parserMaxBlockBytes,
    })) {
      if (event.type === 'round_end') roundEndCount++;
    }
    expect(roundEndCount).toBe(3);
  });
});

describe('syntheticBadStdout', () => {
  it('yields at least one chunk', async () => {
    const chunks = await collectChunks(syntheticBadStdout());
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('parseCritiqueStream raises MalformedBlockError for the bad stream', async () => {
    await expect(async () => {
      for await (const _event of parseCritiqueStream(syntheticBadStdout(), {
        runId: 'test-bad',
        adapter: 'synthetic-bad',
        parserMaxBlockBytes: cfg.parserMaxBlockBytes,
      })) {
        // consume events until error
      }
    }).rejects.toThrow(MalformedBlockError);
  });

  it('custom chunkSize is honoured', async () => {
    const chunks = await collectChunks(syntheticBadStdout({ chunkSize: 32 }));
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBeLessThanOrEqual(32);
    }
  });

  it('content is identical regardless of chunk size', async () => {
    const full1 = await concat(syntheticBadStdout({ chunkSize: 1 }));
    const full128 = await concat(syntheticBadStdout({ chunkSize: 128 }));
    expect(full1).toBe(full128);
  });
});
