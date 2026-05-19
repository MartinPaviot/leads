/**
 * Factory for the coachingTap passed to openBridge. Wraps the
 * classifier with the practical guards we want at runtime:
 *   - keyword prefilter (avoids ~70% of LLM round-trips)
 *   - per-call debounce so we don't re-classify the same beat
 *   - per-call "don't repeat the same objection within N seconds"
 *
 * Stateless from the outside — the factory closes over per-call
 * mutable state so a single tap can be reused across calls only if
 * the call ids are different (they are; the bridge passes callId
 * through). To stay simple we keep state keyed by callId in a Map.
 */

import {
  classifyObjection,
  type CoachingCard,
  type ClassifierDeps,
} from "./coaching-classifier";
import { looksLikeObjection } from "./coaching-playbook";
import type { CoachingCardPersisted, TranscriptChunk } from "./deepgram-bridge";

export interface TapOptions {
  /** Min interval between two LLM calls for the same call (ms). */
  debounceMs?: number;
  /** Suppress a same-class card if one fired in the last N ms. */
  sameClassSuppressMs?: number;
  /** Clock injection for tests. */
  now?: () => number;
}

interface CallState {
  lastClassifyAt: number;
  lastClassByTs: Map<string, number>;
}

export function createCoachingTap(
  classifierDeps: ClassifierDeps,
  options: TapOptions = {},
) {
  const debounceMs = options.debounceMs ?? 5_000;
  const sameClassSuppressMs = options.sameClassSuppressMs ?? 60_000;
  const now = options.now ?? (() => Date.now());
  const states = new Map<string, CallState>();

  return async function tap(args: {
    callId: string;
    chunk: TranscriptChunk;
    recentAgentText: string;
  }): Promise<CoachingCardPersisted | null> {
    const text = args.chunk.text;
    if (!looksLikeObjection(text)) return null;

    const state =
      states.get(args.callId) ??
      ({
        lastClassifyAt: Number.NEGATIVE_INFINITY,
        lastClassByTs: new Map(),
      } as CallState);
    states.set(args.callId, state);

    const t = now();
    if (t - state.lastClassifyAt < debounceMs) return null;
    state.lastClassifyAt = t;

    const card: CoachingCard | null = await classifyObjection(
      {
        prospectWindow: text,
        agentContext: args.recentAgentText,
      },
      classifierDeps,
    );
    if (!card) return null;

    const prevAt = state.lastClassByTs.get(card.objectionClass);
    if (prevAt !== undefined && t - prevAt < sameClassSuppressMs) {
      return null;
    }
    state.lastClassByTs.set(card.objectionClass, t);

    return {
      ts: card.ts,
      objectionClass: card.objectionClass,
      label: card.label,
      prospectQuote: card.prospectQuote,
      suggestedResponses: card.suggestedResponses,
    };
  };
}
