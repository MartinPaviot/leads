/**
 * Pick, from a detected tech-stack (Apollo names and/or tech-detect names),
 * the tools that are actually REPLACEABLE proprietary SaaS — the Pilae lever —
 * by matching against the fingerprint catalog's `replaceable` flags. Catalog-
 * driven (no parallel hardcoded list): adding a fingerprint updates this too.
 *
 * Matching is bidirectional containment on a normalized form so provider
 * spellings line up ("Microsoft Office 365" ↔ catalog "Microsoft 365",
 * "WordPress.org" ↔ "WordPress"). Analytics/CDN/infra (replaceable:false) and
 * unknown junk ("AI", "Mobile Friendly") never qualify. Pure; input order
 * preserved; deduped.
 */

import { FINGERPRINTS } from "./fingerprints";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "");
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 2),
  );
}

interface CatalogEntry {
  key: string;
  toks: Set<string>;
  replaceable: boolean;
}

const CATALOG: CatalogEntry[] = FINGERPRINTS.flatMap((fp) => [
  { key: norm(fp.name), toks: tokens(fp.name), replaceable: fp.replaceable },
  { key: norm(fp.id), toks: tokens(fp.id), replaceable: fp.replaceable },
]).filter((e) => e.key.length >= 3);

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0) return false;
  for (const w of a) if (!b.has(w)) return false;
  return true;
}

/**
 * True when the stack entry matches a catalog tool flagged replaceable.
 * Primary match: the catalog tool's tokens are a subset of the name's tokens
 * ("Microsoft 365" ⊆ "Microsoft Office 365" — containment alone misses it
 * because "office" sits in the middle). Secondary: normalized containment
 * either way ("wordpressorg" ⊇ "wordpress").
 */
export function isReplaceableTool(name: string): boolean {
  const n = norm(name);
  if (n.length < 3) return false;
  const nToks = tokens(name);
  for (const e of CATALOG) {
    if (isSubset(e.toks, nToks) || n.includes(e.key) || e.key.includes(n)) return e.replaceable;
  }
  return false;
}

/** The replaceable subset of a detected stack — input order, deduped. */
export function pickReplaceableTools(stack: ReadonlyArray<string> | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of stack ?? []) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    const k = norm(v);
    if (seen.has(k)) continue;
    seen.add(k);
    if (isReplaceableTool(v)) out.push(v);
  }
  return out;
}
