/**
 * Auto-archive placement decision (INBOX-T10). Pure + unit-tested.
 *
 * Precedence, safety-first: a Never-Archive entry always keeps mail visible; a
 * live thread (we have outbound) is never auto-archived; then an Always-Archive
 * entry or a matched archive rule files it away. Reuses the existing computed
 * reopen (a genuine reply resurfaces an archived thread) — not modelled here.
 * Forward-only is a property of WHEN this runs (new inbound only), not of this
 * decision.
 */

export interface ArchiveInput {
  senderEmail: string;
  /** User Always-Archive list (addresses or domains, lowercased). */
  alwaysArchive: string[];
  /** User Never-Archive list — overrides everything (safety). */
  neverArchive: string[];
  /** An archive-action filter (INBOX-T02) matched this conversation. */
  ruleMatched: boolean;
  ruleName?: string;
  /** We have outbound in this thread → a real conversation, never auto-archive. */
  hasOutbound: boolean;
}

export interface ArchiveDecision {
  archived: boolean;
  why: string;
}

function listMatches(list: string[], email: string): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  const at = e.lastIndexOf("@");
  const domain = at >= 0 ? e.slice(at + 1) : e;
  return list.some((raw) => {
    const entry = raw.trim().toLowerCase();
    return entry === e || entry === domain || e.endsWith("@" + entry);
  });
}

export function archiveDecision(i: ArchiveInput): ArchiveDecision {
  if (listMatches(i.neverArchive, i.senderEmail)) {
    return { archived: false, why: "on your Never-Archive list" };
  }
  if (i.hasOutbound) {
    return { archived: false, why: "" }; // live thread — keep in attention
  }
  if (listMatches(i.alwaysArchive, i.senderEmail)) {
    return { archived: true, why: "on your Always-Archive list" };
  }
  if (i.ruleMatched) {
    return { archived: true, why: `auto-archived: ${i.ruleName ?? "rule"}` };
  }
  return { archived: false, why: "" };
}
