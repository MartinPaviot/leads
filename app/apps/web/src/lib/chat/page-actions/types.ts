import type { z } from "zod";

/**
 * Page Action Registry types (CLE-03). README §3.2 / §3.3 — verbatim field
 * names, optionality, and ordering. A page DECLARES the actions it offers; the
 * chat gets a stable, dynamic surface that mirrors the current page. Parity by
 * construction: anything a human can do on the page becomes invocable, running
 * the page's OWN handler.
 */

/**
 * A serializable undo descriptor. A closure cannot survive page unmount or be
 * persisted to tool_call_events, so reversible actions return a descriptor
 * instead (README §3.2 as amended by §3.8, consumed by CLE-11):
 *  - reinvoke: re-run a registered action with inverse params on the live page.
 *  - server:   a snapshot the server-side undo can restore without the client.
 */
export type UndoDescriptor =
  | { kind: "reinvoke"; actionId: string; params: Record<string, unknown> }
  | { kind: "server"; snapshot: unknown };

export interface PageAction<P = unknown> {
  id: string; // namespaced by page: "<surface>.<verb>"
  title: string; // human label (FR/EN per UI locale)
  description: string; // for the LLM — when/why to use it
  params: z.ZodType<P>; // validated CLIENT-side (run) AND SERVER-side (manifest)
  run: (params: P) => Promise<PageActionResult>; // reuses the page's EXISTING handler
  mutating: boolean; // does it change persistent state?
  outbound?: boolean; // triggers an external send (mail, call, invite)?
  reversible?: boolean; // is a programmatic undo possible?
  cost?: "free" | "credits" | "money";
  confirm: "never" | "risky" | "always"; // default confirmation policy
  surfaces?: string[]; // optional: restrict to certain surfaces
}

export interface PageActionResult {
  ok: boolean;
  summary: string; // 1 sentence, re-injected to the LLM
  data?: unknown; // optional structured payload
  error?: string;
  undo?: (() => Promise<void>) | UndoDescriptor; // if reversible (closure or descriptor)
}

/** Manifest entry: a serialized PageAction WITHOUT the functions (README §3.3). */
export interface PageActionManifestEntry {
  id: string;
  title: string;
  description: string;
  paramsJsonSchema: object; // zod → JSON Schema (deterministic)
  mutating: boolean;
  outbound: boolean;
  reversible: boolean;
  cost: "free" | "credits" | "money";
  confirm: "never" | "risky" | "always";
}

export type PageActionManifest = PageActionManifestEntry[];
