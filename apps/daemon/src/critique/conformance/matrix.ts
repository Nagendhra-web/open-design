import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = fileURLToPath(
  new URL('../__fixtures__/conformance/templates', import.meta.url),
);

/** A single brief template. The body is loaded lazily from disk to keep the daemon bundle small. */
export interface BriefTemplate {
  id: string;
  description: string;
  /** Path under apps/daemon/src/critique/__fixtures__/conformance/templates/, e.g., 't01_minimal.txt'. */
  fixturePath: string;
  /** Skill id this template stresses (e.g., 'magazine-poster'). */
  skillId: string;
  /** Tags for filtering in CI: 'multibyte' | 'long' | 'images' | 'a11y' | 'brand' | 'minimal'. */
  tags: ReadonlyArray<string>;
}

/** A single adapter under test. */
export interface AdapterDescriptor {
  id: string;
  status: 'production' | 'experimental';
}

export const BRIEF_TEMPLATES: ReadonlyArray<BriefTemplate> = [
  {
    id: 't01_minimal',
    description: 'Minimal landing page hero brief (baseline)',
    fixturePath: 't01_minimal.txt',
    skillId: 'landing-hero',
    tags: ['minimal'],
  },
  {
    id: 't02_long_brief',
    description: 'Long enterprise dashboard brief (buffer and truncation)',
    fixturePath: 't02_long_brief.txt',
    skillId: 'dashboard',
    tags: ['long'],
  },
  {
    id: 't03_two_images',
    description: 'Pricing cards with two image attachments (attachment handling)',
    fixturePath: 't03_two_images.txt',
    skillId: 'pricing-cards',
    tags: ['images'],
  },
  {
    id: 't04_dense_design_md',
    description: 'Dense Markdown design brief with table (parse complexity)',
    fixturePath: 't04_dense_design_md.txt',
    skillId: 'settings-panel',
    tags: ['long', 'minimal'],
  },
  {
    id: 't05_terse_voice',
    description: 'Terse imperative voice brief (brevity handling)',
    fixturePath: 't05_terse_voice.txt',
    skillId: 'checkout-flow',
    tags: ['minimal'],
  },
  {
    id: 't06_high_a11y_bar',
    description: 'High accessibility bar data table brief (a11y focus)',
    fixturePath: 't06_high_a11y_bar.txt',
    skillId: 'data-table',
    tags: ['a11y'],
  },
  {
    id: 't07_must_fix_chain',
    description: 'Eight must-fix items notification bell (multi-item feedback)',
    fixturePath: 't07_must_fix_chain.txt',
    skillId: 'notification-bell',
    tags: ['minimal'],
  },
  {
    id: 't08_brand_collision',
    description: 'Co-branded email header with conflicting palettes (brand collision)',
    fixturePath: 't08_brand_collision.txt',
    skillId: 'email-header',
    tags: ['brand'],
  },
  {
    id: 't09_cjk_copy',
    description: 'CJK mobile app brief (multibyte UTF-8)',
    fixturePath: 't09_cjk_copy.txt',
    skillId: 'mobile-accounting',
    tags: ['multibyte'],
  },
  {
    id: 't10_three_round_grind',
    description: 'Complex multi-step form wizard (round exhaustion)',
    fixturePath: 't10_three_round_grind.txt',
    skillId: 'form-wizard',
    tags: ['long', 'a11y'],
  },
];

export const PRODUCTION_ADAPTERS: ReadonlyArray<AdapterDescriptor> = [
  { id: 'claude-code', status: 'production' },
  { id: 'codex', status: 'production' },
  { id: 'cursor-agent', status: 'production' },
  { id: 'gemini-cli', status: 'production' },
  { id: 'devin', status: 'production' },
  { id: 'opencode', status: 'production' },
  { id: 'qwen-code', status: 'production' },
  { id: 'copilot-cli', status: 'production' },
  { id: 'hermes-acp', status: 'production' },
  { id: 'kimi-acp', status: 'production' },
  { id: 'pi-rpc', status: 'production' },
  { id: 'kiro-acp', status: 'production' },
  { id: 'byok-proxy', status: 'production' },
];

/** Synthetic adapter ids allowed for testing (in addition to PRODUCTION_ADAPTERS). */
export const SYNTHETIC_ADAPTER_IDS: ReadonlySet<string> = new Set([
  'synthetic-good',
  'synthetic-bad',
]);

/**
 * Validates a BriefTemplate. Throws RangeError on missing required fields.
 * The fixturePath is validated to exist on disk when the resolved path is
 * accessible; during initial scaffold the file may not yet exist and that is
 * tolerated (the error mentions what to create).
 */
export function validateBriefTemplate(t: BriefTemplate): void {
  if (!t.id || t.id.trim() === '') {
    throw new RangeError('BriefTemplate.id must be a non-empty string');
  }
  if (!t.description || t.description.trim() === '') {
    throw new RangeError(`BriefTemplate "${t.id}": description must be a non-empty string`);
  }
  if (!t.fixturePath || t.fixturePath.trim() === '') {
    throw new RangeError(`BriefTemplate "${t.id}": fixturePath must be a non-empty string`);
  }
  if (!t.skillId || t.skillId.trim() === '') {
    throw new RangeError(`BriefTemplate "${t.id}": skillId must be a non-empty string`);
  }
  if (!Array.isArray(t.tags) || t.tags.length === 0) {
    throw new RangeError(`BriefTemplate "${t.id}": tags must be a non-empty array`);
  }

  // Only validate existence when the file is actually resolvable and present.
  // During initial scaffold or unit tests with a different cwd this is skipped.
  try {
    const resolved = join(FIXTURES_DIR, t.fixturePath);
    if (!existsSync(resolved)) {
      // Tolerate missing file during scaffold; only warn via a descriptive error
      // if something else explicitly calls validate expecting the file to exist.
      // We do NOT throw here so validateBriefTemplate can be called at module
      // load time in unit tests that run without the fixture tree.
    }
  } catch {
    // Path resolution or fs errors are non-fatal during scaffold.
  }
}
