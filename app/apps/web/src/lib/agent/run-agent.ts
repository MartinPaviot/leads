/**
 * runAgent — the one governed entry point for agent calls (spec 04). Scopes
 * tools to the workspace (AC1/AC5), meters the model call (AC2), validates the
 * output against the Zod schema with one repair attempt then fail (AC1), runs
 * the kind's eval rubric as a BLOCKING gate (AC4), and logs an agent_run row
 * (AC3). A failed eval or unrepairable output is a returned non-result, never an
 * exception, so callers branch on `evalPassed`. No external mutation here, so
 * it's safe to retry; idempotent on requestId.
 */
import type { ZodType } from "zod";
import type {
  AgentResult,
  EvalOutcome,
  ModelCallResult,
  RunAgentDeps,
  RunAgentInput,
  MeterOpLike,
} from "./types";

function tryParse<T>(schema: ZodType<T>, text: string): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "output is not valid JSON" };
  }
  const r = schema.safeParse(json);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

export async function runAgent<T>(
  deps: RunAgentDeps,
  args: RunAgentInput<T>,
  now: () => number = () => Date.now(),
): Promise<AgentResult<T>> {
  if (!args.tenantId || typeof args.tenantId !== "string") {
    throw new Error("runAgent: missing workspace (tenantId) — no ambient/cross-tenant calls (AC5)");
  }

  // Idempotency: a prior run for this requestId returns its stored outcome.
  const prior = await deps.findRun(args.tenantId, args.requestId);
  if (prior) {
    const tokens = (prior.inputTokens ?? 0) + (prior.outputTokens ?? 0);
    if (prior.evalPassed) {
      return { evalPassed: true, value: prior.output as T, tokens, latencyMs: prior.latencyMs, requestId: args.requestId };
    }
    return { evalPassed: false, reason: prior.evalReason ?? "prior run failed", tokens, latencyMs: prior.latencyMs, requestId: args.requestId };
  }

  const start = now();

  // 1. Scope tools (AC1-tools / AC5) — throws CrossTenantToolError on an out-of-scope tool.
  const scoped = deps.resolveTools(args.tenantId, args.tools);

  // 2 + 3. Metered model call (AC2) + schema validate, with ONE repair attempt (AC1).
  const op: MeterOpLike = { workspace: args.tenantId, kind: args.kind, provider: "anthropic", amount: 1, ref: args.requestId };
  let parsed: T | null = null;
  let last: ModelCallResult | null = null;
  let inTok = 0;
  let outTok = 0;
  let repairHint: string | undefined;

  for (let attempt = 0; attempt < 2 && parsed === null; attempt++) {
    const res = await deps.meter(op, () =>
      deps.callModel({ kind: args.kind, prompt: args.input, tools: scoped.tools, attempt, repairHint }),
    );
    last = res;
    inTok += res.inputTokens;
    outTok += res.outputTokens;
    const candidate = tryParse(args.schema, res.rawText);
    if (candidate.ok) parsed = candidate.value;
    else repairHint = candidate.error; // feed the error into one repair re-prompt
  }

  const latencyMs = now() - start;
  const tokens = inTok + outTok;
  const toolsCalled = last?.toolsCalled ?? [];

  // Unrepairable output -> non-result (AC1 repair-or-fail).
  if (parsed === null) {
    const reason = `output failed schema validation after repair: ${repairHint ?? "invalid"}`;
    await deps.logRun({
      tenantId: args.tenantId, kind: args.kind, requestId: args.requestId, input: args.input, toolsCalled,
      output: last?.rawText ?? null, inputTokens: inTok, outputTokens: outTok, latencyMs,
      evalPassed: false, evalReason: reason, evalScore: null,
    });
    return { evalPassed: false, reason, tokens, latencyMs, requestId: args.requestId };
  }

  // 4. Eval gate (AC4) — runs BEFORE returning; a fail is never a usable result.
  let evalOutcome: EvalOutcome | null = null;
  if (args.evalRubric) evalOutcome = await deps.runEval(args.evalRubric, args.input, parsed);
  const evalPassed = evalOutcome ? evalOutcome.passed : true;

  // 5. Log the run (AC3) — always, pass or fail.
  await deps.logRun({
    tenantId: args.tenantId, kind: args.kind, requestId: args.requestId, input: args.input, toolsCalled,
    output: parsed, inputTokens: inTok, outputTokens: outTok, latencyMs,
    evalPassed, evalReason: evalOutcome?.reason ?? null, evalScore: evalOutcome?.score ?? null,
  });

  if (!evalPassed) {
    return { evalPassed: false, reason: evalOutcome?.reason ?? "eval failed", tokens, latencyMs, requestId: args.requestId };
  }
  return { evalPassed: true, value: parsed, tokens, latencyMs, requestId: args.requestId };
}
