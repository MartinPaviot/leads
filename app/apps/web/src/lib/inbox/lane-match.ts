/**
 * Smart-lane / Split-Inbox matcher (INBOX-T01). Pure + unit-tested.
 *
 * A lane is a saved query over conversation fields (from / to / cc / subject /
 * mailbox) combined with AND/OR, optionally OR'd with an attached AI label
 * (INBOX-T02). This evaluates membership over the already-scoped Conversation
 * set at read time — it never widens visibility. The clause matcher is exported
 * so INBOX-T02 filters reuse the exact same semantics.
 */

export type ClauseField = "from" | "to" | "cc" | "subject" | "mailbox";
export type ClauseOp = "contains" | "is" | "domain";

export interface Clause {
  field: ClauseField;
  op: ClauseOp;
  value: string;
  negate?: boolean;
}

export interface MatchCandidate {
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  mailbox?: string | null;
  /** AI labels carried by the conversation (INBOX-T02). */
  labelIds?: string[];
}

export interface LaneDefinition {
  clauses: Clause[];
  join: "and" | "or";
  /** Conversations carrying any of these labels also belong to the lane. */
  aiLabelIds?: string[];
}

function fieldValue(c: MatchCandidate, field: ClauseField): string {
  switch (field) {
    case "from": return c.from ?? "";
    case "to": return c.to ?? "";
    case "cc": return c.cc ?? "";
    case "subject": return c.subject ?? "";
    case "mailbox": return c.mailbox ?? "";
  }
}

export function clauseMatches(c: MatchCandidate, clause: Clause): boolean {
  const v = fieldValue(c, clause.field).toLowerCase();
  const val = clause.value.trim().toLowerCase();
  let hit: boolean;
  if (clause.op === "is") {
    hit = v === val;
  } else if (clause.op === "domain") {
    const at = v.lastIndexOf("@");
    const domain = at >= 0 ? v.slice(at + 1) : v;
    hit = domain === val || v.endsWith("@" + val);
  } else {
    hit = val.length > 0 && v.includes(val);
  }
  return clause.negate ? !hit : hit;
}

export function clausesMatch(c: MatchCandidate, clauses: Clause[], join: "and" | "or"): boolean {
  if (clauses.length === 0) return false;
  return join === "and"
    ? clauses.every((cl) => clauseMatches(c, cl))
    : clauses.some((cl) => clauseMatches(c, cl));
}

export function laneMatches(c: MatchCandidate, def: LaneDefinition): boolean {
  const hasClauses = def.clauses.length > 0;
  const hasLabels = (def.aiLabelIds?.length ?? 0) > 0;
  if (!hasClauses && !hasLabels) return false; // empty definition matches nothing
  const byClause = hasClauses ? clausesMatch(c, def.clauses, def.join) : false;
  const byLabel = hasLabels ? (c.labelIds ?? []).some((l) => def.aiLabelIds!.includes(l)) : false;
  return byClause || byLabel;
}

/** Filter a list to a lane, extracting the MatchCandidate from each item. Generic
 *  so the conversations route can keep the full Conversation while matching on its
 *  from/subject/mailbox/labels. */
export function filterByLane<T>(
  items: T[],
  def: LaneDefinition,
  toCandidate: (item: T) => MatchCandidate,
): T[] {
  return items.filter((item) => laneMatches(toCandidate(item), def));
}
