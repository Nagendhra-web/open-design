import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HAPPY_PATH = fileURLToPath(
  new URL('../__fixtures__/v1/happy-3-rounds.txt', import.meta.url),
);
const MALFORMED_PATH = fileURLToPath(
  new URL('../__fixtures__/v1/malformed-unbalanced.txt', import.meta.url),
);

export interface SyntheticOpts {
  runId?: string | undefined;
  chunkSize?: number | undefined;
}

const DEFAULT_CHUNK_SIZE = 64;

/**
 * Emit a sequence of strings that, when concatenated, form a canonical
 * CRITIQUE_RUN that ships at round 3. Sources happy-3-rounds.txt.
 */
export async function* syntheticGoodStdout(
  opts?: SyntheticOpts,
): AsyncGenerator<string> {
  const content = readFileSync(HAPPY_PATH, 'utf8');
  yield* chunkString(content, opts?.chunkSize ?? DEFAULT_CHUNK_SIZE);
}

/**
 * Emit a malformed CRITIQUE_RUN missing one closing PANELIST tag in round 2.
 * Sources malformed-unbalanced.txt.
 */
export async function* syntheticBadStdout(
  opts?: SyntheticOpts,
): AsyncGenerator<string> {
  const content = readFileSync(MALFORMED_PATH, 'utf8');
  yield* chunkString(content, opts?.chunkSize ?? DEFAULT_CHUNK_SIZE);
}

async function* chunkString(s: string, chunkSize: number): AsyncGenerator<string> {
  if (chunkSize < 1) {
    throw new RangeError(`chunkSize must be >= 1, got ${chunkSize}`);
  }
  let offset = 0;
  while (offset < s.length) {
    yield s.slice(offset, offset + chunkSize);
    offset += chunkSize;
  }
}
