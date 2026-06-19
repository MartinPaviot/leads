/**
 * "Fill it up for me!" derive pipeline — pure helpers (B2 R5).
 *
 * buildDerivePrompt: the instruction text that asks the model to extract HOW the
 * user writes (style only) from their recent 1:1 sent mail.
 *
 * sanitizeDerivedStyle: the DETERMINISTIC no-PII / no-hallucination floor (R5.5,
 * C1 gate R7.2). A derived prompt must contain ONLY style directives — never an
 * email, URL, domain, phone, dollar amount, a proper noun echoed from the source
 * mail, or a verbatim source phrase. Safety-biased: when in doubt, REJECT (a
 * rejected proposal just leaves the live prompt unchanged; a leaked name does not).
 * No LLM, no DB, no clock.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL_RE = /https?:\/\//i;
const DOMAIN_RE = /\b[a-z0-9-]{2,}\.(?:com|net|org|io|ai|co|dev|app|xyz|me|gov|edu|biz|info|us|uk|fr|de)\b/i;
const CURRENCY_RE = /[$£€]\s?\d/;
const LONG_NUMBER_RE = /\b\d{4,}\b/; // amounts / years / zips / ids — NOT 1-3 digit style figures ("3-6 lines")
const PHONE_RE = /\b\d{3}[-.\s]\d{3}[-.\s]?\d{0,4}\b/;

// Capitalized style/structural words that legitimately open a directive line and
// must NOT be treated as proper nouns echoed from source mail.
const STYLE_STOPWORDS: ReadonlySet<string> = new Set([
  "Default", "Keep", "Use", "Avoid", "Prefer", "Write", "Sign", "The", "When", "If", "Always",
  "Never", "About", "Match", "Lead", "Tone", "Style", "Be", "Stay", "Start", "End", "Open",
  "Close", "Make", "Skip", "Drop", "Lean", "Favor", "Mirror", "Respond", "Reply", "Greet",
  "Address", "And", "But", "Or", "For", "With", "Your", "Their", "This", "That", "They",
  "Short", "Long", "Friendly", "Direct", "Warm", "Formal", "Casual", "Concise", "Plain",
  "One", "Two", "Three", "Bullet", "Bullets", "Sentence", "Sentences", "Line", "Lines",
  "Paragraph", "Paragraphs", "Hi", "Hey", "Hello", "Best", "Thanks", "Cheers", "Regards",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Proper-noun candidates in `text`: capitalized words (len >= 3) not in the style stoplist. */
function properNouns(text: string): string[] {
  const out = new Set<string>();
  for (const m of (text || "").matchAll(/\b[A-Z][a-zA-Z]{2,}\b/g)) {
    const w = m[0];
    if (!STYLE_STOPWORDS.has(w)) out.add(w);
  }
  return [...out];
}

function normalizeWords(text: string): string[] {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

/** True when `text` reproduces a window of >= 6 consecutive words from `source`. */
function sharesLongPhrase(source: string, text: string): boolean {
  const src = normalizeWords(source);
  const hay = " " + normalizeWords(text).join(" ") + " ";
  const W = 6;
  if (src.length < W) return false;
  for (let i = 0; i + W <= src.length; i++) {
    const window = src.slice(i, i + W).join(" ");
    if (hay.includes(" " + window + " ")) return true;
  }
  return false;
}

export interface SanitizeResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Validate a derived style prompt is PII-free and not echoing source content.
 * `sourceBodies` (the sent mail it was derived from) powers the proper-noun and
 * verbatim-phrase echo checks. Returns ok=false + cited reasons on any leak.
 */
export function sanitizeDerivedStyle(text: string, sourceBodies: string[] = []): SanitizeResult {
  const reasons: string[] = [];
  const t = text || "";

  if (EMAIL_RE.test(t)) reasons.push("contains an email address");
  if (URL_RE.test(t)) reasons.push("contains a URL");
  if (DOMAIN_RE.test(t)) reasons.push("contains a domain");
  if (CURRENCY_RE.test(t)) reasons.push("contains a currency amount");
  if (PHONE_RE.test(t)) reasons.push("contains a phone-like number");
  else if (LONG_NUMBER_RE.test(t)) reasons.push("contains a long number (amount/date/id)");

  const sourceText = sourceBodies.join("\n");
  const sourceNouns = new Set(properNouns(sourceText));
  for (const noun of properNouns(t)) {
    if (sourceNouns.has(noun)) {
      reasons.push(`echoes a name/entity from source: ${noun}`);
      break;
    }
  }

  if (sourceBodies.some((b) => sharesLongPhrase(b, t))) reasons.push("quotes source content");

  return { ok: reasons.length === 0, reasons };
}

/**
 * Strip quoted reply history so the derive learns the USER's own words, not the
 * counterparty's (which would also raise the PII-echo risk). Cuts at the first
 * "On … wrote:" / "-----Original Message-----" header and drops ">"-quoted lines.
 */
export function stripQuotedReply(body: string): string {
  const out: string[] = [];
  for (const line of (body || "").split("\n")) {
    if (/^\s*On .+wrote:\s*$/i.test(line)) break;
    if (/^\s*-+\s*original message\s*-+/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * The instruction text for the derive model call (R5.1). Pure — the Inngest fn
 * wraps it in tracedGenerateObject with a style-only schema. Caps the corpus so
 * a long mailbox can't blow the prompt budget.
 */
export function buildDerivePrompt(sentBodies: string[]): string {
  const corpus = sentBodies
    .map((b, i) => `--- message ${i + 1} ---\n${(b || "").trim()}`)
    .join("\n\n")
    .slice(0, 12000);

  return `You are analyzing a user's past 1:1 sent emails to capture HOW they write — their voice — as a short set of STYLE directives a drafting assistant can follow.

Output ONLY style / tone / length / phrasing rules. You MUST NOT:
- mention any person, company, product, place, or other proper noun
- include any email address, URL, domain, phone number, or dollar amount
- quote or paraphrase the content or subject of any specific message
- describe WHAT the user talks about — only HOW they write

Good directives describe: sentence length, formality, warmth, greeting and sign-off habits, use of bullet points, directness, hedging, punctuation, paragraph length.

Return 4-7 concise one-line bullet directives, no preamble, no names.

The user's recent sent emails:
${corpus}`;
}
