/**
 * Fit qualification agent (spec 10). qualifyFit decides fit attributes a database
 * field cannot answer (e.g. "is actually SaaS") by inspecting retrieved website
 * evidence via the agent-service (spec 04, injected). Deterministic discipline
 * around the agentic verdict: gate on cheap filters (AC2), eval-fail → needs-review
 * (AC5), cite-or-abstain (AC3); the verdict feeds the spec-09 partition (AC4).
 */

export interface Citation {
  url: string;
  quote: string;
}

export interface AgentVerdict {
  verdict: "pass" | "fail" | "needs-review";
  evidence: Citation[];
  confidence: number;
  reason?: string;
}

export interface QualifyAccount {
  id: string;
  domain: string | null;
  /** True only after the cheap deterministic filters passed (spec 08/09). */
  passedCheapFilters: boolean;
}

/** Shape of spec-04 runAgent's result (injected). It meters + eval-gates internally. */
export interface RunAgentResultLike {
  evalPassed: boolean;
  value?: AgentVerdict;
  reason?: string;
}

export interface QualifyDeps {
  tenantId: string;
  runAgent(args: { tenantId: string; kind: string; requestId: string; input: unknown }): Promise<RunAgentResultLike>;
}

export interface FitInput {
  operable: boolean;
  matched: boolean;
  exclude: boolean;
}

const needsReview = (reason: string, confidence = 0): AgentVerdict => ({ verdict: "needs-review", evidence: [], confidence, reason });

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export async function qualifyFit(account: QualifyAccount, question: string, deps: QualifyDeps): Promise<AgentVerdict> {
  // AC2 — cost discipline: never run the agent on an un-filtered account.
  if (!account.passedCheapFilters) return needsReview("not cheaply-filtered: agent not run");
  if (!account.domain) return needsReview("no website to inspect");

  // AC1/AC4/AC5 — the governed call meters + runs the eval gate (spec 02/04).
  const res = await deps.runAgent({
    tenantId: deps.tenantId,
    kind: "fit-qualification",
    requestId: `qualify:${account.id}:${slug(question)}`,
    input: { domain: account.domain, question },
  });

  // AC5 — a failed eval is a needs-review, never a usable verdict.
  if (!res.evalPassed || !res.value) return needsReview(res.reason ?? "eval failed");

  const v = res.value;
  // AC3 — cite-or-abstain: a pass/fail must be grounded in fetched evidence.
  if (v.verdict !== "needs-review" && v.evidence.length === 0) return needsReview("verdict not grounded in cited evidence", v.confidence);

  return v;
}

/** AC4 — map the verdict to a deterministic fit-criterion input for spec-09. */
export function verdictToFitInput(v: AgentVerdict): FitInput {
  return {
    operable: v.verdict !== "needs-review",
    matched: v.verdict === "pass",
    exclude: v.verdict === "fail",
  };
}
