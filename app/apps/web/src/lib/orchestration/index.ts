// Orchestration + approval gates (spec 03, _specs/03-orchestration-and-gates).
// defineModule wraps Inngest with house defaults; runGate persists an approval
// gate and durably blocks a run until decided; workflow_run carries the run's
// current_module + state.
export {
  resolveGate,
  runGate,
  InMemoryOrchestrationStore,
  type OrchestrationStore,
  type GateDecisionInput,
  type GateDecisionType,
  type GateResolution,
  type GateRecord,
  type RunState,
  type RunGateDeps,
  type RunGateParams,
  type GateStep,
} from "./gate";
export { dbOrchestrationStore, DbOrchestrationStore } from "./db-store";
export {
  defineModule,
  moduleOptions,
  moduleIdempotencyKey,
  failModule,
  PermanentError,
  type ModuleConfig,
} from "./module";
