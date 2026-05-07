/**
 * Pure resume-policy helpers (P0-3 task 3.5).
 *
 * The wizard mounts → fetches state → must decide which phase to
 * show. The decision rules :
 *  - First mount : jump to `state.currentPhase` (server's source of
 *    truth ; respects what the user has already done).
 *  - Subsequent refreshes (e.g. after a phase submit) : keep the
 *    user where they explicitly navigated, don't snap back.
 *  - Completed wizard (state.completedAt set) : phase 7 stays
 *    visible so the user can review the final summary.
 *  - Out-of-range phases (server says phase=99 due to a bug) :
 *    clamp to [1, 7].
 *
 * Tested exhaustively without React.
 */

const MIN_PHASE = 1;
const MAX_PHASE = 7;

export interface ResumeStateInput {
  /** Server-reported current phase (1-7). */
  currentPhase: number;
  /** Server-reported completed phases (subset of [1..7]). */
  completedPhases: ReadonlyArray<number>;
  /** Set when the user has finalised onboarding. */
  completedAt: string | null;
}

export interface ResumeOpts {
  /** What phase the wizard is currently showing in local state. */
  currentlyActive: number;
  /** True only on the very first state load. */
  isFirstLoad: boolean;
}

/**
 * Decide which phase to show after a state load.
 *
 * Returns the resolved phase + whether the wizard should "snap" to
 * it (true on first load, false otherwise so the user's manual nav
 * isn't overridden).
 */
export function resolveResumePhase(
  state: ResumeStateInput,
  opts: ResumeOpts,
): { phase: number; snap: boolean } {
  const target = clampPhase(
    state.completedAt
      ? MAX_PHASE
      : state.currentPhase,
  );

  if (opts.isFirstLoad) {
    return { phase: target, snap: true };
  }
  return {
    phase: clampPhase(opts.currentlyActive),
    snap: false,
  };
}

/**
 * Decide whether the user is allowed to jump to a given phase from
 * the stepper. Rules :
 *  - You can always re-visit a completed phase.
 *  - You can visit your current phase.
 *  - You cannot jump ahead of currentPhase.
 */
export function canNavigateToPhase(
  state: ResumeStateInput,
  targetPhase: number,
): boolean {
  if (targetPhase < MIN_PHASE || targetPhase > MAX_PHASE) return false;
  if (state.completedPhases.includes(targetPhase)) return true;
  return targetPhase <= state.currentPhase;
}

function clampPhase(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return MIN_PHASE;
  return Math.max(MIN_PHASE, Math.min(MAX_PHASE, Math.floor(n)));
}

/**
 * Decide whether the wizard's "Finalise" button should be eligible
 * to fire. The button itself is rendered conditionally ; this helper
 * encapsulates the full predicate so tests can pin the contract.
 */
export function canFinalize(state: ResumeStateInput, allHardPassed: boolean): boolean {
  if (state.completedAt) return false; // already done — button hidden
  return state.completedPhases.includes(MAX_PHASE) && allHardPassed;
}
