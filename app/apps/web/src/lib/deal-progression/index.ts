/**
 * Autonomous Deal Progression Engine — public API.
 *
 * Consumers should import from this barrel:
 *   import { evaluateDealProgression, executeProgression } from "@/lib/deal-progression";
 */

export {
  evaluateDealProgression,
  executeProgression,
  evaluateTenantDeals,
  PROGRESSION_RULES,
  FLAG_RULES,
  type ProgressionResult,
  type ExecutionResult,
  type BatchResult,
  type ProgressionRule,
  type FlagRule,
} from "./engine";

export {
  detectAllSignals,
  detectFirstMeetingScheduled,
  detectMeetingCompletedPositive,
  detectDemoCompletedWithFollowUp,
  detectProposalSent,
  detectPositiveReplyToProposal,
  detectContractOrVerbalYes,
  detectStalledNoActivity,
  detectAtRiskNegative,
  detectMultiplePositiveInteractions,
  detectChampionEngagement,
  type Signal,
  type SignalType,
  type ActivityRecord,
} from "./signals";
