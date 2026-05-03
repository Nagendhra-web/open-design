/**
 * Public barrel for the Critique Theater module (Phase 7: state + hooks).
 * UI components are Phase 8 and live in a separate barrel entry.
 *
 * @see specs/current/critique-theater.md § UI surface
 */

export {
  initialState,
  reduce,
  type CritiqueState,
  type RoundState,
  type PanelistRoundState,
} from './state/reducer.js';

export {
  selectActiveRound,
  selectLatestComposite,
  selectOpenMustFix,
  isTerminal,
  selectRoleScores,
} from './state/selectors.js';

export { useCritiqueStream } from './hooks/useCritiqueStream.js';
export type { UseCritiqueStreamOptions } from './hooks/useCritiqueStream.js';

export {
  useCritiqueReplay,
  REPLAY_SPEEDS,
  type ReplaySpeed,
  type FetchTranscript,
  type UseCritiqueReplayOptions,
} from './hooks/useCritiqueReplay.js';
