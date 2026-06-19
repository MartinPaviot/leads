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

/**
 * CLE-15: what a `navigate` directive (or a PageActionResult) names so the
 * client can find an element to pulse. The runtime highlight registry lives in
 * the "use client" module `lib/chat/page-actions/registry.ts`; this is a PURE
 * re-export of the same shape so the server builder and the client parser share
 * the type without a client-side import. Kept structurally in sync with the
 * registry's `HighlightAnchor`.
 */
export interface HighlightAnchor {
  entityId: string; // the row/card/field key, e.g. a deal id
  scope?: string; // optional surface hint, e.g. "opportunities"
  field?: string; // optional sub-element key, e.g. "stage"
  focus?: boolean; // optional: page opts in to move focus (default false)
}

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
  /**
   * Navigate the SPA to an internal path (same-origin only). CLE-15 adds an
   * OPTIONAL `highlight` anchor: when set, the client pulses the matching
   * element after the route settles. Absent ⇒ today's exact behaviour.
   */
  | { kind: "navigate"; path: string; label?: string; highlight?: HighlightAnchor }
  /** Open the email composer pre-filled with a draft (does not send). */
  | { kind: "composeEmail"; draft: ComposeEmailDraft }
  /** Run a registered Page Action on the live page (CLE-03). */
  | {
      kind: "invokeAction";
      invocationId: string; // uuid — correlates request <-> result
      actionId: string; // e.g. "opportunities.moveStage"
      params: Record<string, unknown>;
      requireConfirm: boolean; // computed server-side via decideAction (CLE-04/CLE-10)
      /**
       * CLE-11: set ONLY when this invocation is the INVERSE of an undo (a
       * page_action reversal, design §3.3). The client echoes it back to the
       * audit seam so a failed inverse (page gone → action_not_registered)
       * re-opens the original event (E-3). Absent on every forward action.
       */
      reconcileEventId?: string;
    };

/**
 * The `invokeAction` arm of {@link UiDirective}, named for precise typing in the
 * CLE-05 confirm controller + card. Derived from the union, not a new contract
 * (README §3.1 untouched).
 */
export type InvokeActionDirective = Extract<UiDirective, { kind: "invokeAction" }>;

/* ------------------------------------------------------------------ */
/*  Server-side builders — spread into a tool result                   */
/* ------------------------------------------------------------------ */

/**
 * `{ _uiDirective: { kind: "navigate", ... } }` — spread into a tool result.
 * CLE-15: the optional 3rd arg attaches a highlight anchor so the client pulses
 * the target after navigating. A highlight with no usable entityId is dropped
 * (the navigate is still emitted).
 */
export function navigateDirective(path: string, label?: string, highlight?: HighlightAnchor) {
  const anchor = highlight ? normalizeAnchor(highlight) : null;
  return {
    [UI_DIRECTIVE_KEY]: {
      kind: "navigate",
      path,
      ...(label ? { label } : {}),
      ...(anchor ? { highlight: anchor } : {}),
    },
  } as const;
}

/** `{ _uiDirective: { kind: "composeEmail", ... } }` — spread into a tool result. */
export function composeEmailDirective(draft: ComposeEmailDraft) {
  return { [UI_DIRECTIVE_KEY]: { kind: "composeEmail", draft } } as const;
}

/**
 * `{ _uiDirective: { kind: "invokeAction", ... } }` — spread into a tool result.
 * The server caller (CLE-04 invokePageAction) decides the invocationId once
 * (crypto.randomUUID) so it threads through to the result envelope, and the
 * requireConfirm flag from decideAction.
 */
export function invokeActionDirective(
  invocationId: string,
  actionId: string,
  params: Record<string, unknown>,
  requireConfirm: boolean,
  reconcileEventId?: string,
) {
  return {
    [UI_DIRECTIVE_KEY]: {
      kind: "invokeAction",
      invocationId,
      actionId,
      params,
      requireConfirm,
      ...(reconcileEventId ? { reconcileEventId } : {}),
    },
  } as const;
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
 * CLE-15: structurally validate a `highlight` value, stripping unknown keys.
 * Requires a non-empty string `entityId`; accepts optional string `scope`/
 * `field` and a boolean `focus`. Returns a clean anchor or `null` — NEVER
 * throws, so a malformed highlight only drops itself and never invalidates the
 * navigate it rides on. Shared by the builder (normalizeAnchor) and the parser.
 */
function parseHighlightAnchor(v: unknown): HighlightAnchor | null {
  if (!isRecord(v)) return null;
  const entityId = asNonEmptyString(v.entityId);
  if (!entityId) return null; // entityId is the only required field
  const scope = asNonEmptyString(v.scope);
  const field = asNonEmptyString(v.field);
  return {
    entityId,
    ...(scope ? { scope } : {}),
    ...(field ? { field } : {}),
    ...(v.focus === true ? { focus: true } : {}),
  };
}

/** Builder-side normalization: same validation, used before emitting. */
function normalizeAnchor(anchor: HighlightAnchor): HighlightAnchor | null {
  return parseHighlightAnchor(anchor);
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
    // CLE-15: validate the optional highlight; a malformed one is dropped but
    // the navigate is kept (never throws, never invalidates the navigation).
    const highlight = parseHighlightAnchor(raw.highlight);
    return {
      kind: "navigate",
      path: raw.path,
      ...(label ? { label } : {}),
      ...(highlight ? { highlight } : {}),
    };
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

  if (raw.kind === "invokeAction") {
    // Structural validation only. The real safety gate is the registry: the
    // only actionIds that ever run are those a mounted page registered.
    const invocationId = asNonEmptyString(raw.invocationId);
    const actionId = asNonEmptyString(raw.actionId);
    if (!invocationId || !actionId) return null;
    if (!isRecord(raw.params)) return null;
    if (typeof raw.requireConfirm !== "boolean") return null;
    const reconcileEventId = asNonEmptyString(raw.reconcileEventId);
    return {
      kind: "invokeAction",
      invocationId,
      actionId,
      params: raw.params as Record<string, unknown>,
      requireConfirm: raw.requireConfirm,
      ...(reconcileEventId ? { reconcileEventId } : {}),
    };
  }

  return null;
}
