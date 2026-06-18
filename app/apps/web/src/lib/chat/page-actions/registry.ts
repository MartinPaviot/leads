"use client";

import { useEffect } from "react";
import { z } from "zod";
import type {
  PageAction,
  PageActionManifest,
  PageActionManifestEntry,
  PageActionResult,
} from "./types";

/**
 * Page Action Registry (CLE-03). A module-level store the globally-mounted
 * ChatDock reads at send time; pages mutate it on mount/unmount via the hook.
 * Contract surface (README §3.3) = the three exported functions + the types in
 * ./types. Everything else here is internal.
 */

/** Soft size budget for the serialized manifest (internal guard-rail). */
const MANIFEST_BYTE_BUDGET = 16 * 1024;

interface Registration {
  action: PageAction;
  owner: symbol;
}

const store = new Map<string, Registration>();

/** A Zod schema serialized to JSON Schema once (determinism + perf). */
const schemaCache = new WeakMap<z.ZodType, object>();

function toJsonSchema(schema: z.ZodType): object {
  const cached = schemaCache.get(schema);
  if (cached) return cached;
  // Zod 4 native serializer — deterministic JSON-Schema (draft 2020-12). No extra dep.
  const json = z.toJSONSchema(schema) as object;
  schemaCache.set(schema, json);
  return json;
}

function toManifestEntry(a: PageAction): PageActionManifestEntry {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    paramsJsonSchema: toJsonSchema(a.params),
    mutating: a.mutating,
    outbound: a.outbound ?? false,
    reversible: a.reversible ?? false,
    cost: a.cost ?? "free",
    confirm: a.confirm,
  };
}

/** Hook posted by each page; registers on mount, clears on unmount. */
export function useRegisterPageActions(actions: PageAction[]): void {
  useEffect(() => {
    const owner = Symbol("page-action-owner");
    for (const a of actions) {
      const existing = store.get(a.id);
      if (existing && existing.owner !== owner) {
        // E-2: collision between distinct owners — last-writer-wins, warn in dev.
        console.warn(`[page-actions] action id collision: "${a.id}" re-registered by a different owner`);
      }
      store.set(a.id, { action: a, owner }); // E-1: idempotent per id (Map replace)
    }
    return () => {
      // Only remove ids THIS effect owns, so an interleaved remount (HMR / route
      // swap) that already re-registered an id is not clobbered.
      for (const a of actions) {
        const cur = store.get(a.id);
        if (cur && cur.owner === owner) store.delete(a.id);
      }
    };
    // Re-run only when the set of action ids changes — a stable page passes a
    // stable list; key on ids so we don't re-register on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.map((a) => a.id).join("|")]);
}

/** Read by the ChatDock at send time (like surfaceRef). Serializable, no fns. */
export function getActionManifest(): PageActionManifest {
  const manifest = Array.from(store.values()).map((r) => toManifestEntry(r.action));
  // E-4: soft size budget — warn (do not truncate) so an over-declaring page is caught.
  const bytes = JSON.stringify(manifest).length;
  if (bytes > MANIFEST_BYTE_BUDGET) {
    console.warn(
      `[page-actions] manifest is ${bytes} bytes (budget ${MANIFEST_BYTE_BUDGET}); trim action descriptions/schemas.`,
    );
  }
  return manifest;
}

/** Validate params client-side against the registered schema, then run. Never throws. */
export async function runRegisteredAction(actionId: string, params: unknown): Promise<PageActionResult> {
  const reg = store.get(actionId);
  if (!reg) {
    // Unregistered id → graceful error result so the model can fall back.
    return {
      ok: false,
      summary: `No action "${actionId}" is available on this page.`,
      error: "action_not_registered",
    };
  }
  const parsed = reg.action.params.safeParse(params);
  if (!parsed.success) {
    // Bad params → error result BEFORE run; run is never called.
    const issue = parsed.error.issues[0];
    const where = issue?.path?.join(".") || "";
    return {
      ok: false,
      summary: `Invalid parameters for "${actionId}": ${issue?.message ?? "validation failed"}${where ? ` (${where})` : ""}.`,
      error: "invalid_params",
    };
  }
  try {
    return await reg.action.run(parsed.data);
  } catch (err) {
    return {
      ok: false,
      summary: `Action "${actionId}" failed to run.`,
      error: err instanceof Error ? err.message : "run_threw",
    };
  }
}

/**
 * CLE-11: read the static metadata of a registered action (mutating, outbound,
 * reversible) without running it. The audit seam uses `mutating` to decide
 * whether a PAR invocation is logged (reads are not audited — AC-2). Returns
 * null for an unregistered id.
 */
export function getRegisteredActionMeta(
  actionId: string,
): { mutating: boolean; outbound: boolean; reversible: boolean } | null {
  const reg = store.get(actionId);
  if (!reg) return null;
  return {
    mutating: reg.action.mutating,
    outbound: reg.action.outbound ?? false,
    reversible: reg.action.reversible ?? false,
  };
}

/** Test-only: clear the store between cases. Not part of the runtime contract. */
export function __resetPageActionsForTest(): void {
  store.clear();
}

/* ================================================================== */
/*  CLE-15 — Highlight registry (sibling to the action store, same     */
/*  file so a page registers actions AND a locator through one import). */
/*                                                                      */
/*  The decisive constraint: the SAME entity renders in different DOM   */
/*  nodes per view (a deal is a table <tr> in table mode but a board    */
/*  <div> in board mode), and there is no global data-entity-id today.  */
/*  So instead of a DOM scan, each page registers a LOCATOR fn that,    */
/*  given an entity id, returns the currently-mounted element for it.   */
/*  This mirrors how the action registry above already works.           */
/* ================================================================== */

/** What a directive / result names so the client can find an element to pulse. */
export interface HighlightAnchor {
  /** the row/card/field key, e.g. a deal id. */
  entityId: string;
  /** optional: a surface hint, e.g. "opportunities" — disambiguates overlapping ids. */
  scope?: string;
  /** optional: a sub-element key (e.g. "stage", "owner") for field-level pulse. */
  field?: string;
  /** optional: page opts in to move focus (default false — never steals focus). */
  focus?: boolean;
}

/** A page-supplied function: resolve an entity id to its live element, or null. */
export type EntityLocator = (anchor: HighlightAnchor) => HTMLElement | null;

/**
 * Escape a string for safe use inside a CSS attribute selector. Pages building a
 * `[data-cle-entity="<id>"]` query use this so an id with quotes/brackets cannot
 * break (or inject into) the selector. Prefers the native CSS.escape and falls
 * back to a minimal escape when it is unavailable (older jsdom). Never throws.
 */
export function cssEscape(value: string): string {
  const s = String(value);
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/["\\\]\[]/g, "\\$&");
}

/** Module-level locator store. Pages register on mount, clear on unmount. */
interface LocatorRegistration {
  locate: EntityLocator;
  owner: symbol;
}
const locators = new Map<string, LocatorRegistration>(); // keyed by scope

const DEFAULT_SCOPE = "__default__";
const HIGHLIGHT_MS = 1600; // bounded window
const MAX_HIGHLIGHTS_PER_CALL = 25; // cap — never strobe a 1000-row bulk

/**
 * Hook: a page registers HOW to locate its entities. Mirrors
 * useRegisterPageActions — register on mount, clear (only our own) on unmount.
 * A page passes a stable `locate` (useCallback) so we re-register only if it
 * changes.
 */
export function useRegisterEntityLocator(scope: string, locate: EntityLocator): void {
  useEffect(() => {
    const owner = Symbol("entity-locator-owner");
    locators.set(scope || DEFAULT_SCOPE, { locate, owner });
    return () => {
      const cur = locators.get(scope || DEFAULT_SCOPE);
      if (cur && cur.owner === owner) locators.delete(scope || DEFAULT_SCOPE); // only clear our own
    };
  }, [scope, locate]);
}

/** Resolve an element for an anchor, trying the scoped locator then the default. Never throws. */
export function locateEntity(anchor: HighlightAnchor): HTMLElement | null {
  try {
    if (anchor.scope) {
      const scoped = locators.get(anchor.scope);
      const el = scoped?.locate(anchor) ?? null;
      if (el) return el;
    }
    const def = locators.get(DEFAULT_SCOPE);
    return def?.locate(anchor) ?? null; // no locator / not found -> null
  } catch {
    return null; // a buggy page locator must never crash the highlight
  }
}

/**
 * SSR/jsdom-safe read of the reduced-motion preference. matchMedia is absent in
 * tests unless mocked -> treated as "no reduce" (the animated path) by default.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Pulse the element(s) for one or many anchors. Fire-and-forget; resolves
 * harmlessly. A highlight is best-effort decoration: it either decorates a real
 * element briefly and self-clears, or it does nothing — it never throws, never
 * blocks, never steals focus, never leaves residue.
 */
export function highlightEntity(anchors: HighlightAnchor | HighlightAnchor[]): void {
  const list = (Array.isArray(anchors) ? anchors : [anchors]).slice(0, MAX_HIGHLIGHTS_PER_CALL); // cap
  for (const anchor of list) {
    const el = locateEntity(anchor);
    if (!el) {
      // silent no-op — never an error log (not on screen / not registered / unmounted).
      if (typeof console !== "undefined") console.debug?.("[highlight] no element for", anchor.entityId);
      continue;
    }
    applyPulse(el, anchor.focus === true); // self-clears with an isConnected guard
  }
}

function applyPulse(el: HTMLElement, allowFocus: boolean): void {
  const reduced = prefersReducedMotion();
  // 1. Bring into view if off-screen. block:"nearest" -> minimal scroll, no
  //    jarring jump, no focus steal.
  if (typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  }
  if (allowFocus && typeof el.focus === "function") el.focus({ preventScroll: true });

  // 2. Apply emphasis. Reduced-motion -> static class (no transition); else the
  //    animated pulse. The preference is read ONCE here so the matching clear
  //    removes whatever was added (consistent within one highlight).
  const cls = reduced ? "cle-entity-highlight--static" : "cle-entity-highlight";
  el.classList.add(cls);

  // 3. Self-clear after the window, guarded so an unmounted node is left alone.
  window.setTimeout(() => {
    if (el.isConnected) el.classList.remove(cls);
    // detached -> nothing to clean; the class went away with the node.
  }, HIGHLIGHT_MS);
}

/** Test-only: clear the locator store between cases. Not part of the runtime contract. */
export function __resetEntityLocatorsForTest(): void {
  locators.clear();
}
