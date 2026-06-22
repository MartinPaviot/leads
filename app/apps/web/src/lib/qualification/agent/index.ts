// Fit qualification agent (spec 10, _specs/10-fit-qualification-agent). The
// agentic noise filter: qualifyFit inspects retrieved website evidence via the
// injected spec-04 runAgent, gated on cheap filters, cite-or-abstain, feeding the
// spec-09 partition. The verdict is agentic; the discipline around it is pure.
export {
  qualifyFit,
  verdictToFitInput,
  type AgentVerdict,
  type Citation,
  type QualifyAccount,
  type QualifyDeps,
  type RunAgentResultLike,
  type FitInput,
} from "./qualify";
