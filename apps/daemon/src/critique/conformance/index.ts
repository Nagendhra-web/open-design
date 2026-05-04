export type { BriefTemplate, AdapterDescriptor } from './matrix.js';
export {
  BRIEF_TEMPLATES,
  PRODUCTION_ADAPTERS,
  SYNTHETIC_ADAPTER_IDS,
  validateBriefTemplate,
} from './matrix.js';

export type { DegradedReason, DegradedMark, AdapterRegistryConfig, AdapterRegistry } from './registry.js';
export { createAdapterRegistry } from './registry.js';

export { syntheticGoodStdout, syntheticBadStdout } from './synthetic.js';
export type { SyntheticOpts } from './synthetic.js';

export type {
  ConformanceRunInput,
  ConformanceVerdict,
  ConformanceRunResult,
  ConformanceMatrixInput,
  AdapterPassCriteria,
  AdapterReport,
} from './runner.js';
export { DEFAULT_PASS_CRITERIA, runOnce, runMatrix } from './runner.js';
