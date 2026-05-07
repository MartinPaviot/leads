/**
 * AI-UI primitives barrel.
 *
 * Sprint-2 (audit) — single import point for every surface that
 * renders AI-produced content. The rule : no AI surface invents its
 * own confidence chip / loading spinner / citation chip / fallback
 * message. They all import from here.
 *
 * If you find yourself writing inline JSX that reproduces what one
 * of these primitives does, stop and import instead. If a primitive
 * doesn't fit, add it here rather than forking — the audit's whole
 * point was that ad-hoc forks rot the design system over time.
 */

export {
  ConfidenceState,
  isVisibleAtDefault,
  type ConfidenceLevel,
  type ConfidenceStateProps,
} from "./confidence-state";

export { AIThinking, type AIThinkingProps } from "./ai-thinking";
export { UndoToast, type UndoToastProps } from "./undo-toast";
export {
  HallucinationFallback,
  type HallucinationFallbackProps,
} from "./hallucination-fallback";
export {
  SourceLink,
  type SourceKind,
  type SourceLinkProps,
} from "./source-link";
export { CitedClaim, type CitedClaimProps, type CitedClaimSource } from "./cited-claim";
