/**
 * Deterministic tech-stack matcher. Given normalized page signals, returns the
 * tools detected — each with the EXACT signature that proved it (so the rep can
 * cite it) and a confidence by evidence strength. Never guesses: a tool appears
 * only when a real signature matched. Pure, unit-tested, no I/O.
 */

import { FINGERPRINTS, type Fingerprint, type TechCategory } from "./fingerprints";

export interface PageSignals {
  /** Hosts of every <script src> on the page, lowercased. */
  scriptHosts: string[];
  /** Raw HTML body (may be truncated by the fetcher). */
  html: string;
  /** Response headers, names lowercased. */
  headers: Record<string, string>;
  /** Set-Cookie names. */
  cookies: string[];
  /** <meta name="generator"> content, or null. */
  metaGenerator: string | null;
}

export type EvidenceKind = "meta" | "header" | "script" | "cookie" | "html";

export interface DetectedTool {
  id: string;
  name: string;
  category: TechCategory;
  replaceable: boolean;
  /** 0..1 — by how strong the proving signature is. */
  confidence: number;
  evidence: { kind: EvidenceKind; value: string };
}

// Confidence by evidence strength: an authoritative generator/header/script
// host is near-certain; an HTML marker or cookie is softer.
const CONFIDENCE: Record<EvidenceKind, number> = {
  meta: 0.95,
  header: 0.9,
  script: 0.9,
  cookie: 0.75,
  html: 0.7,
};

/** First (highest-confidence) signature that proves this fingerprint, or null. */
function match(fp: Fingerprint, s: PageSignals): { kind: EvidenceKind; value: string } | null {
  if (fp.metaGenerator && s.metaGenerator && fp.metaGenerator.test(s.metaGenerator)) {
    return { kind: "meta", value: s.metaGenerator };
  }
  if (fp.headerMatch) {
    for (const h of fp.headerMatch) {
      const v = s.headers[h.name.toLowerCase()];
      if (v != null && h.pattern.test(v)) return { kind: "header", value: `${h.name}: ${v}` };
    }
  }
  if (fp.scriptHosts) {
    for (const host of s.scriptHosts) {
      const hit = fp.scriptHosts.find((needle) => host.includes(needle));
      if (hit) return { kind: "script", value: host };
    }
  }
  if (fp.cookies) {
    for (const name of s.cookies) {
      if (fp.cookies.some((re) => re.test(name))) return { kind: "cookie", value: name };
    }
  }
  if (fp.htmlPatterns && s.html) {
    for (const re of fp.htmlPatterns) {
      const m = s.html.match(re);
      if (m) return { kind: "html", value: m[0].slice(0, 60) };
    }
  }
  return null;
}

/**
 * Detect every tool whose signature is present. One entry per fingerprint
 * (the strongest evidence wins). Sorted: replaceable first (the trigger we
 * care about), then by confidence, then by name.
 */
export function detectFromSignals(
  signals: PageSignals,
  catalog: Fingerprint[] = FINGERPRINTS,
): DetectedTool[] {
  const out: DetectedTool[] = [];
  for (const fp of catalog) {
    const ev = match(fp, signals);
    if (!ev) continue;
    out.push({
      id: fp.id,
      name: fp.name,
      category: fp.category,
      replaceable: fp.replaceable,
      confidence: CONFIDENCE[ev.kind],
      evidence: ev,
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.replaceable) - Number(a.replaceable) ||
      b.confidence - a.confidence ||
      a.name.localeCompare(b.name),
  );
}
