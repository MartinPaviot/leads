/**
 * NL-to-ICP draft generation (spec 11, AC2/AC3/AC5). Takes a natural-language
 * description, generates a draft ICP via the injected spec-04 runAgent (kind
 * nl-to-icp, the ICP schema, the operable-field catalog as the constraint, the
 * validator as the eval rubric), marks non-operable criteria, and returns a
 * DRAFT — never active. An eval-fail yields no draft (AC5).
 */
import type { IcpCriterionSnapshot } from "../store/version";

export type IsOperable = (fieldKey: string) => boolean;

/** Mark each criterion operable (AC3) + collect a warning per non-operable one. */
export function markOperability(
  criteria: IcpCriterionSnapshot[],
  isOperable: IsOperable,
): { criteria: IcpCriterionSnapshot[]; warnings: string[] } {
  const warnings: string[] = [];
  const out = criteria.map((c) => {
    const operable = isOperable(c.fieldKey);
    if (!operable) warnings.push(`Criterion "${c.fieldKey}" is non-operable and will not affect scoring`);
    return { ...c, operable };
  });
  return { criteria: out, warnings };
}

export interface NlIcpAgentResult {
  evalPassed: boolean;
  value?: { name?: string; criteria: IcpCriterionSnapshot[] };
  reason?: string;
}

export interface NlToIcpDeps {
  tenantId: string;
  runAgent(args: { tenantId: string; kind: string; requestId: string; input: unknown }): Promise<NlIcpAgentResult>;
  isOperable: IsOperable;
}

export interface DraftIcp {
  name: string;
  criteria: IcpCriterionSnapshot[];
  status: "draft";
  warnings: string[];
}

export type NlToIcpOutcome = { ok: true; draft: DraftIcp } | { ok: false; reason: string };

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export async function createIcpFromDescription(text: string, deps: NlToIcpDeps): Promise<NlToIcpOutcome> {
  const res = await deps.runAgent({
    tenantId: deps.tenantId,
    kind: "nl-to-icp",
    requestId: `nl-icp:${slug(text)}`,
    input: { description: text },
  });
  // AC5 — the agent's eval (operable-only, valid schema) must pass before a draft is shown.
  if (!res.evalPassed || !res.value) return { ok: false, reason: res.reason ?? "eval failed" };

  const { criteria, warnings } = markOperability(res.value.criteria, deps.isOperable);
  // AC2 — returned as a DRAFT for review; never active here.
  return { ok: true, draft: { name: res.value.name ?? "Draft ICP", criteria, status: "draft", warnings } };
}
