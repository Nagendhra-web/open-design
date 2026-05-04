import { describe, it, expect } from 'vitest';
import {
  BRIEF_TEMPLATES,
  PRODUCTION_ADAPTERS,
  validateBriefTemplate,
  type BriefTemplate,
} from '../src/critique/conformance/matrix.js';

describe('BRIEF_TEMPLATES', () => {
  it('has exactly 10 entries', () => {
    expect(BRIEF_TEMPLATES).toHaveLength(10);
  });

  it('all ids are unique', () => {
    const ids = BRIEF_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('each template has a non-empty description', () => {
    for (const t of BRIEF_TEMPLATES) {
      expect(t.description.trim()).not.toBe('');
    }
  });

  it('each template has a non-empty fixturePath', () => {
    for (const t of BRIEF_TEMPLATES) {
      expect(t.fixturePath.trim()).not.toBe('');
    }
  });

  it('each template has a non-empty skillId', () => {
    for (const t of BRIEF_TEMPLATES) {
      expect(t.skillId.trim()).not.toBe('');
    }
  });

  it('each template has a non-empty tags array', () => {
    for (const t of BRIEF_TEMPLATES) {
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it('ids follow the tNN_slug pattern', () => {
    for (const t of BRIEF_TEMPLATES) {
      expect(t.id).toMatch(/^t\d{2}_/);
    }
  });

  it('fixturePaths end in .txt', () => {
    for (const t of BRIEF_TEMPLATES) {
      expect(t.fixturePath).toMatch(/\.txt$/);
    }
  });
});

describe('PRODUCTION_ADAPTERS', () => {
  const EXPECTED_IDS = [
    'claude-code',
    'codex',
    'cursor-agent',
    'gemini-cli',
    'devin',
    'opencode',
    'qwen-code',
    'copilot-cli',
    'hermes-acp',
    'kimi-acp',
    'pi-rpc',
    'kiro-acp',
    'byok-proxy',
  ];

  it('has exactly 13 entries', () => {
    expect(PRODUCTION_ADAPTERS).toHaveLength(13);
  });

  it('contains all expected ids in the right order', () => {
    expect(PRODUCTION_ADAPTERS.map((a) => a.id)).toEqual(EXPECTED_IDS);
  });

  it('all adapters have status production', () => {
    for (const a of PRODUCTION_ADAPTERS) {
      expect(a.status).toBe('production');
    }
  });
});

describe('validateBriefTemplate', () => {
  const valid: BriefTemplate = {
    id: 'tXX_test',
    description: 'A test template',
    fixturePath: 'tXX_test.txt',
    skillId: 'test-skill',
    tags: ['minimal'],
  };

  it('accepts a valid template without throwing', () => {
    expect(() => validateBriefTemplate(valid)).not.toThrow();
  });

  it('throws RangeError when id is empty', () => {
    expect(() =>
      validateBriefTemplate({ ...valid, id: '' }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when id is whitespace-only', () => {
    expect(() =>
      validateBriefTemplate({ ...valid, id: '   ' }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when description is empty', () => {
    expect(() =>
      validateBriefTemplate({ ...valid, description: '' }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when fixturePath is empty', () => {
    expect(() =>
      validateBriefTemplate({ ...valid, fixturePath: '' }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when skillId is empty', () => {
    expect(() =>
      validateBriefTemplate({ ...valid, skillId: '' }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when tags is an empty array', () => {
    expect(() =>
      validateBriefTemplate({ ...valid, tags: [] }),
    ).toThrow(RangeError);
  });

  it('all built-in BRIEF_TEMPLATES pass validateBriefTemplate', () => {
    for (const t of BRIEF_TEMPLATES) {
      expect(() => validateBriefTemplate(t)).not.toThrow();
    }
  });
});
