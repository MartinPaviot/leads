// Agent service (spec 04, _specs/04-agent-service). The one governed entry for
// agent calls: scoped tools, schema repair-or-fail, metered model call, blocking
// eval gate, and an agent_run audit log. Provider-agnostic (model + tools
// injected) per RECONCILE.md decision A.
export { runAgent } from "./run-agent";
export {
  dbLogRun,
  dbFindRun,
  passthroughMeter,
  makeWorkspaceToolResolver,
  agentServiceDefaults,
} from "./default-deps";
export {
  CrossTenantToolError,
  type AgentResult,
  type RunAgentInput,
  type RunAgentDeps,
  type EvalRubric,
  type EvalOutcome,
  type ModelCallResult,
  type AgentRunRow,
} from "./types";
