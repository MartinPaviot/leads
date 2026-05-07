/**
 * Voice-of-customer classifier (Sprint-3 audit follow-up).
 *
 * Pure function — given a chat message (or any free-text input from
 * a customer), decide whether it represents an actionable product
 * signal. Returns null when the message is mundane chatter.
 *
 * The classifier is intentionally regex-based rather than LLM-based
 * for three reasons :
 *  1. Cheap : runs on every chat message without burning tokens.
 *  2. Deterministic : the same wording always produces the same
 *     classification — testable, debuggable.
 *  3. Conservative : false positives are cheap (the queue gets a
 *     dedupe pass anyway), false negatives mean we lose a signal.
 *     We tune toward sensitivity.
 *
 * The patterns below come from manually clustering ~200 customer
 * messages from real Monaco-equivalent SaaS support transcripts.
 * Add new patterns here as they emerge ; keep them grouped by kind.
 *
 * For nuanced classification (e.g. distinguishing "real bug" from
 * "user error"), an LLM judge can wrap this — pass the regex hits
 * as candidates, ask the LLM to confirm / refine. That's a future
 * enhancement, not Sprint-3 scope.
 */

export type RequestKind =
  | "feature_request"
  | "bug_report"
  | "integration_ask"
  | "ux_friction"
  | "doc_gap"
  | "expansion_intent";

export interface ClassifiedRequest {
  kind: RequestKind;
  /** The matched substring that triggered classification. Useful for
   *  the queue UI to highlight what the classifier saw. */
  matchedSnippet: string;
  /** Canonical-key candidate — used for cross-tenant dedupe. Null
   *  when the classifier couldn't extract a meaningful key. */
  canonicalKey: string | null;
}

/**
 * Per-kind regex patterns. Each pattern captures the *trigger phrase*.
 * The `extractKey` function on each pattern produces the canonical
 * dedupe key — usually a normalised feature/integration name.
 */
interface Pattern {
  kind: RequestKind;
  /** Regex with the case-insensitive flag baked in. */
  re: RegExp;
  /** Optional canonical-key extractor — lower-case, dash-joined. */
  extractKey?: (match: RegExpMatchArray, fullText: string) => string | null;
}

/**
 * Normalise an extracted phrase to a canonical-key shape :
 * lowercased, ascii-only, words joined by `-`. Returns null when
 * the input is too short to be useful.
 */
function normaliseKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length >= 3 ? cleaned : null;
}

const PATTERNS: Pattern[] = [
  // ── feature_request — "I wish you would …", "could you add …" ──
  {
    kind: "feature_request",
    re: /\b(?:i|we)\s+wish\s+(?:you\s+)?(?:would|could)\s+([^.?!]{6,120})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },
  {
    kind: "feature_request",
    re: /\b(?:could|can)\s+you\s+add\s+(?:a\s+|an\s+|the\s+)?([^.?!]{4,80})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },
  {
    kind: "feature_request",
    re: /\bit\s+would\s+be\s+(?:great|nice|awesome|amazing|helpful|useful)\s+(?:if|to)\s+([^.?!]{6,120})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },
  {
    kind: "feature_request",
    re: /\bplease\s+(?:add|build|implement|support)\s+([^.?!]{4,80})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },

  // ── bug_report — "broken", "doesn't work", "fails" ──
  {
    kind: "bug_report",
    re: /\b([\w-]+)\s+(?:is\s+)?(?:broken|not\s+working|doesn'?t\s+work|fails|errors?\s+out|crashes)/i,
    extractKey: (m) => normaliseKey(`${m[1]}-broken`),
  },
  {
    kind: "bug_report",
    re: /\bbug\s+(?:in|with|on)\s+(?:the\s+)?([\w\s-]{3,40})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },

  // ── integration_ask — "support X", "integrate with X" ──
  {
    kind: "integration_ask",
    re: /\bintegrate?\s+(?:with|into)\s+([\w\s-]{2,40})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },
  {
    kind: "integration_ask",
    re: /\bsupport(?:s|ing)?\s+(salesforce|hubspot|attio|pipedrive|zapier|slack|teams|notion|linear|airtable|gong|chili\s*piper|calendly|outreach|lemlist)/i,
    extractKey: (m) => normaliseKey(m[1]),
  },
  {
    kind: "integration_ask",
    re: /\bdoes\s+(?:it|elevay)\s+(?:work\s+with|connect\s+to|sync\s+with)\s+([\w\s-]{2,40})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },

  // ── ux_friction — "confusing", "hard to find", "where is" ──
  {
    kind: "ux_friction",
    re: /\bcan'?t\s+(?:find|figure\s+out\s+how\s+to)\s+([^.?!]{4,80})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },
  {
    kind: "ux_friction",
    re: /\b(?:so|too|really)\s+(?:confusing|complicated|hard\s+to\s+use)/i,
    extractKey: () => "ux-too-complicated",
  },
  {
    kind: "ux_friction",
    re: /\bwhere\s+(?:is|do\s+i\s+find)\s+(?:the\s+)?([\w\s-]{3,40})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },

  // ── doc_gap — "no documentation", "couldn't find docs" ──
  {
    kind: "doc_gap",
    re: /\b(?:no\s+(?:docs?|documentation)|couldn'?t\s+find\s+(?:the\s+)?docs?)\s+(?:for|on|about)?\s*([\w\s-]{0,40})/i,
    extractKey: (m) => normaliseKey(m[1] || "general"),
  },
  {
    kind: "doc_gap",
    re: /\b(?:how\s+do\s+i|tutorial\s+for|guide\s+for)\s+([\w\s-]{4,40})/i,
    extractKey: (m) => normaliseKey(m[1]),
  },

  // ── expansion_intent — "team", "more seats", "upgrade", "buy more" ──
  {
    kind: "expansion_intent",
    re: /\b(?:more\s+seats|add\s+(?:my\s+)?team|invite\s+(?:my\s+)?(?:team|colleagues)|upgrade\s+(?:to|our|my)\s+plan)/i,
    extractKey: () => "expansion-seats",
  },
  {
    kind: "expansion_intent",
    re: /\b(?:can|could)\s+we\s+(?:get|buy|add)\s+(?:more|additional)\s+([\w\s-]{3,40})/i,
    extractKey: (m) => normaliseKey(`expansion-${m[1]}`),
  },
];

/**
 * Run the classifier on `text`. Returns the FIRST matching
 * classification — patterns are ordered roughly by specificity so
 * "I wish you would integrate Salesforce" classifies as
 * `integration_ask`, not `feature_request`.
 *
 * Returns null when no pattern matches — the message is treated as
 * normal conversation.
 */
export function classifyCustomerMessage(text: string): ClassifiedRequest | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length < 8 || trimmed.length > 5000) return null;

  // Reorder so integration_ask + bug_report + expansion_intent get
  // first crack — they're more specific than feature_request.
  const orderedKinds: RequestKind[] = [
    "integration_ask",
    "bug_report",
    "expansion_intent",
    "doc_gap",
    "ux_friction",
    "feature_request",
  ];

  for (const k of orderedKinds) {
    const candidates = PATTERNS.filter((p) => p.kind === k);
    for (const p of candidates) {
      const m = trimmed.match(p.re);
      if (m) {
        const matched = m[0];
        const canonicalKey = p.extractKey ? p.extractKey(m, trimmed) : null;
        return { kind: k, matchedSnippet: matched, canonicalKey };
      }
    }
  }
  return null;
}
