/**
 * Search-operator parser (INBOX-Q04 core). Pure + unit-tested.
 *
 * Parses "from:x to:y subject:'quoted phrase' has:attachment before:2026-06-01
 * is:unread free text" into a structured query the search backend executes
 * deterministically. The semantic / Ask-AI layers (Q01/Q02) sit on top and are
 * residual; this gives users precise, predictable operators.
 */

export interface ParsedQuery {
  from?: string;
  to?: string;
  subject?: string;
  before?: string;
  after?: string;
  has?: string[];
  is?: string[];
  /** Free-text remainder after operators are removed. */
  text: string;
}

const OPERATOR = /\b(from|to|subject|before|after|has|is)\s*:\s*('[^']*'|"[^"]*"|\S+)/gi;

export function parseSearchQuery(input: string): ParsedQuery {
  const has: string[] = [];
  const is: string[] = [];
  const q: ParsedQuery = { text: "" };

  const rest = (input || "").replace(OPERATOR, (_m, key: string, rawVal: string) => {
    const v = rawVal.replace(/^['"]|['"]$/g, "").trim();
    switch (key.toLowerCase()) {
      case "from": q.from = v; break;
      case "to": q.to = v; break;
      case "subject": q.subject = v; break;
      case "before": q.before = v; break;
      case "after": q.after = v; break;
      case "has": has.push(v.toLowerCase()); break;
      case "is": is.push(v.toLowerCase()); break;
    }
    return " ";
  });

  q.text = rest.replace(/\s+/g, " ").trim();
  if (has.length) q.has = has;
  if (is.length) q.is = is;
  return q;
}
