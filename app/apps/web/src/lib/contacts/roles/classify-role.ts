/**
 * Spec 16 — buying-role classification. Each contact resolves to exactly one of
 * decision-maker / champion / user via a TRANSPARENT, overridable rule table
 * over seniority / department / title. Ambiguous titles fall back to the spec-04
 * governed agent (injected, not imported — `lib/agent` lives on the parked
 * spec-04 branch); a low-confidence or ungrounded agent answer becomes
 * `needs-review` (never a guess). A user override wins and is stable across
 * re-runs.
 *
 * Blast radius: contacts/roles/* only. No copy, no steering, no schema (the
 * override + role_class persist in `contact.properties`, the caller's job).
 */

import { norm } from "@/lib/icp/criteria-engine";
import { DECISION_MAKER_TIERS } from "@/lib/contacts/seniority";

export type RoleClass = "decision-maker" | "champion" | "user";
/** Terminal classification, including the "couldn't decide safely" state. */
export type RoleClassOrReview = RoleClass | "needs-review";

export interface RoleContact {
  title?: string | null;
  seniority?: string | null;
  department?: string | null;
}

export interface RoleClassification {
  role_class: RoleClassOrReview;
  source: "rule" | "agent" | "override";
  rationale?: string;
}

/** One row of the inspectable rule table. First match (top to bottom) wins. */
export interface RoleRule {
  id: string;
  role_class: RoleClass;
  /** Human-readable, shown in the UI alongside the override control. */
  label: string;
  match: (c: { title: string; seniority: string; department: string }) => boolean;
}

const includesAny = (haystack: string, needles: string[]) => needles.some((n) => haystack.includes(n));

const CHAMPION_TIERS = ["head", "director", "manager"];
const USER_TIERS = ["senior", "entry", "intern"];

/**
 * The transparent rule table (AC1). Ordered, first-match-wins. Seniority is the
 * primary axis (closed Apollo enum); title keywords catch cases where seniority
 * is missing but the title is decisive; department never promotes on its own but
 * can disambiguate. Exported so the UI can render and the user can override.
 */
export const ROLE_RULES: RoleRule[] = [
  {
    id: "title-founder",
    role_class: "decision-maker",
    // Needles are in normalized form (norm strips accents + maps hyphens/&).
    label: "Founder / owner / chief in the title",
    match: (c) => includesAny(c.title, ["founder", "owner", "ceo", "cto", "cfo", "coo", "cro", "cmo", "chief", "president", "managing director", "directeur general", "gerant"]),
  },
  {
    id: "seniority-decision-maker",
    role_class: "decision-maker",
    label: "Top-tier seniority (owner/founder/c_suite/partner/vp/head/director)",
    match: (c) => (DECISION_MAKER_TIERS as readonly string[]).includes(c.seniority) && !CHAMPION_TIERS.includes(c.seniority),
  },
  {
    id: "title-head-of",
    role_class: "champion",
    label: "Head of / lead in the title",
    match: (c) => includesAny(c.title, ["head of", "vp of", "vice president", "lead", "responsable", "manager"]),
  },
  {
    id: "seniority-champion",
    role_class: "champion",
    label: "Mid-management seniority (head/director/manager)",
    match: (c) => CHAMPION_TIERS.includes(c.seniority),
  },
  {
    id: "seniority-user",
    role_class: "user",
    label: "Individual-contributor seniority (senior/entry/intern)",
    match: (c) => USER_TIERS.includes(c.seniority),
  },
];

/** AC1 deterministic pass. Returns null when no rule matches (→ ambiguous → agent). */
export function classifyByRules(contact: RoleContact): { role_class: RoleClass; rule: RoleRule } | null {
  // Seniority is a CLOSED Apollo enum key (e.g. "c_suite") — lowercase/trim only,
  // never norm() (which would map the underscore to a space and break the match).
  // Title/department are free text → norm (accents, hyphens, ampersands).
  const c = {
    title: norm(contact.title ?? ""),
    seniority: (contact.seniority ?? "").trim().toLowerCase(),
    department: norm(contact.department ?? ""),
  };
  for (const rule of ROLE_RULES) {
    if (rule.match(c)) return { role_class: rule.role_class, rule };
  }
  return null;
}

// ── Agent fallback (spec 04, injected) ──

export interface AgentRoleResult {
  /** spec-04 eval gate. */
  evalPassed: boolean;
  value?: { role_class: string; rationale: string; confidence: number };
  reason?: string;
}

export type RunRoleAgent = (input: {
  kind: "role-classification";
  contact: RoleContact;
}) => Promise<AgentRoleResult>;

export interface RoleClassifyDeps {
  /** spec-04 governed agent for ambiguous titles. Absent → ambiguous becomes needs-review. */
  runAgent?: RunRoleAgent;
  /** AC3 — a user override that wins and persists across re-runs. */
  override?: RoleClass | null;
  /** AC2 — confidence floor below which an agent answer is needs-review. */
  minConfidence?: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.6;
const VALID: ReadonlySet<string> = new Set<RoleClass>(["decision-maker", "champion", "user"]);

/**
 * AC4 grounding guard: the rationale must reference the contact's title or a
 * seniority token. Deterministic, so a stub model is testable in CI — an
 * ungrounded ("valid enum, empty reasoning") answer is rejected to needs-review.
 */
function rationaleGrounded(rationale: string, contact: RoleContact): boolean {
  const r = norm(rationale);
  if (!r) return false;
  const title = norm(contact.title ?? "");
  const seniority = norm(contact.seniority ?? "");
  const titleTokens = title.split(/\s+/).filter((w) => w.length >= 3);
  if (titleTokens.some((w) => r.includes(w))) return true;
  if (seniority && r.includes(seniority.replace(/_/g, " "))) return true;
  return false;
}

/**
 * Classify a contact's buying role. Override → rule table → agent → needs-review.
 * Async because the ambiguous path consults the injected spec-04 agent.
 */
export async function classifyRole(contact: RoleContact, deps: RoleClassifyDeps = {}): Promise<RoleClassification> {
  // AC3 — an override wins outright and is idempotent across re-runs.
  if (deps.override && VALID.has(deps.override)) {
    return { role_class: deps.override, source: "override" };
  }

  // AC1 — transparent rule table.
  const ruled = classifyByRules(contact);
  if (ruled) {
    return { role_class: ruled.role_class, source: "rule", rationale: ruled.rule.label };
  }

  // AC2 — ambiguous → governed agent fallback.
  if (!deps.runAgent) return { role_class: "needs-review", source: "rule", rationale: "ambiguous; no agent available" };

  const floor = deps.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  let result: AgentRoleResult;
  try {
    result = await deps.runAgent({ kind: "role-classification", contact });
  } catch {
    return { role_class: "needs-review", source: "agent", rationale: "agent error" };
  }

  const v = result.value;
  // AC2/AC4 — accept only a passed eval with a valid enum, sufficient confidence,
  // and a rationale grounded in the title/seniority; anything else → needs-review.
  if (result.evalPassed && v && VALID.has(v.role_class) && v.confidence >= floor && rationaleGrounded(v.rationale, contact)) {
    return { role_class: v.role_class as RoleClass, source: "agent", rationale: v.rationale };
  }
  return { role_class: "needs-review", source: "agent", rationale: v?.rationale ?? result.reason ?? "low confidence" };
}
