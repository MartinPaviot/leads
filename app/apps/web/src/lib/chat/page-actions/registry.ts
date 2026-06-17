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

/** Test-only: clear the store between cases. Not part of the runtime contract. */
export function __resetPageActionsForTest(): void {
  store.clear();
}
