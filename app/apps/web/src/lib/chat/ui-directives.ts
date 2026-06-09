/**
 * UI directives — the command layer that lets a chat tool result drive the
 * client UI (navigate to a record, open the email composer) instead of only
 * returning text.
 *
 * A tool's `execute` can attach a directive to its result by spreading one of
 * the builders below. The client (`useUiDirectives`) reads it off the
 * tool-call output and performs the action exactly once.
 *
 * This module is intentionally pure (no React, no server deps) so it is the
 * SINGLE source of truth shared by the server tools that EMIT directives and
 * the client hook that PARSES them — they can never drift.
 *
 * Contract: the directive rides on the tool result under `_uiDirective`. The
 * rest of the result stays human-readable so non-web clients (Slack, external
 * MCP) that ignore the directive still get a useful answer + a link.
 */

/** The key a directive rides under on a tool result object. */
export const UI_DIRECTIVE_KEY = "_uiDirective" as const;

/** Draft handed to the email composer. Mirrors EmailComposerDraft. */
export interface ComposeEmailDraft {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  contactId?: string;
  dealId?: string;
}

export type UiDirective =
  /** Navigate the SPA to an internal path (same-origin only). */
  | { kind: "navigate"; path: string; label?: string }
  /** Open the email composer pre-filled with a draft (does not send). */
  | { kind: "composeEmail"; draft: ComposeEmailDraft };

/* ------------------------------------------------------------------ */
/*  Server-side builders — spread into a tool result                   */
/* ------------------------------------------------------------------ */

/** `{ _uiDirective: { kind: "navigate", ... } }` — spread into a tool result. */
export function navigateDirective(path: string, label?: string) {
  return { [UI_DIRECTIVE_KEY]: { kind: "navigate", path, ...(label ? { label } : {}) } } as const;
}

/** `{ _uiDirective: { kind: "composeEmail", ... } }` — spread into a tool result. */
export function composeEmailDirective(draft: ComposeEmailDraft) {
  return { [UI_DIRECTIVE_KEY]: { kind: "composeEmail", draft } } as const;
}

/* ------------------------------------------------------------------ */
/*  Client-side parser — read a directive off a tool result            */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Is `path` a safe, same-origin internal route? Guards against open-redirect:
 * must start with a single "/", never "//" (protocol-relative), never contain
 * a scheme, and carry no whitespace. The client navigates with router.push, so
 * only internal paths are ever honoured.
 */
function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (/\s/.test(path)) return false;
  return true;
}

/**
 * Extract a validated directive from a tool result, or null if the result
 * carries none (or a malformed one). Defensive: a bad directive never throws,
 * it's simply ignored.
 */
export function parseUiDirective(result: unknown): UiDirective | null {
  if (!isRecord(result)) return null;
  const raw = result[UI_DIRECTIVE_KEY];
  if (!isRecord(raw)) return null;

  if (raw.kind === "navigate") {
    if (!isSafeInternalPath(raw.path)) return null;
    const label = asNonEmptyString(raw.label);
    return { kind: "navigate", path: raw.path, ...(label ? { label } : {}) };
  }

  if (raw.kind === "composeEmail") {
    if (!isRecord(raw.draft)) return null;
    const d = raw.draft;
    const subject = asNonEmptyString(d.subject);
    const body = asNonEmptyString(d.body);
    if (!subject || !body) return null;
    const draft: ComposeEmailDraft = {
      to: typeof d.to === "string" ? d.to : "",
      subject,
      body,
      ...(asNonEmptyString(d.cc) ? { cc: d.cc as string } : {}),
      ...(asNonEmptyString(d.contactId) ? { contactId: d.contactId as string } : {}),
      ...(asNonEmptyString(d.dealId) ? { dealId: d.dealId as string } : {}),
    };
    return { kind: "composeEmail", draft };
  }

  return null;
}
