/**
 * Q10 — pre-send spam-trigger heuristics for outbound campaign drafts.
 *
 * Pure, no I/O — runs synchronously on subject + body so the review UI
 * can colour-code each draft inline without a server round-trip. The
 * goal is *intent* (warn the user before they damage their domain
 * reputation), NOT bayesian classification — that's a different beast
 * and lives downstream in the deliverability provider.
 *
 * Each rule returns a `code` so the UI can render an actionable hint
 * ("Fix CAPS", "Trim links") rather than a wall of text. Scores are
 * additive and capped at 100.
 *
 * The thresholds are tuned to the GTM-email norm (short, plain-text-ish
 * with one CTA), not transactional or marketing-blast style — those
 * patterns would (correctly) trip several rules.
 */

export interface SpamWarning {
  code:
    | "all-caps-words"
    | "excessive-exclamations"
    | "spammy-phrases"
    | "too-many-links"
    | "too-short"
    | "too-long"
    | "missing-personalisation"
    | "missing-unsubscribe"
    | "subject-all-caps"
    | "subject-excessive-punct";
  message: string;
  /** 0–25 contribution to the total score. */
  weight: number;
}

export interface SpamCheckResult {
  /** Total severity, 0 = clean, 100 = throw it away. */
  score: number;
  /** Bucketed for UI styling. */
  severity: "clean" | "low" | "medium" | "high";
  warnings: SpamWarning[];
}

/**
 * Phrases that show up in classic spam corpora and almost never in a
 * legitimate sales email. Kept short on purpose — a long list creates
 * false positives the user learns to ignore. Match is whole-word,
 * case-insensitive.
 */
const SPAMMY_PHRASES = [
  "guaranteed",
  "act now",
  "limited time",
  "free money",
  "make money fast",
  "no obligation",
  "risk free",
  "100% free",
  "click here now",
  "winner",
  "congratulations you",
  "viagra",
  "cheapest",
  "cash bonus",
  "earn extra cash",
  "make $",
];

/**
 * Variables a personalised cold email almost always uses. If none of
 * these appear in the body OR the subject, the draft is mass-blasty
 * and worth flagging.
 */
const PERSONALISATION_TOKENS = [
  /\{\{?\s*(first[\s_-]?name|firstname|name|company|account)\s*\}?\}/i,
  // Bracketed placeholders ("[First Name]") are also common in CRMs.
  /\[\s*(first[\s_-]?name|firstname|name|company|account)\s*\]/i,
];

const UNSUBSCRIBE_TOKENS = [
  /\{\{?\s*unsubscribe[_-]?(url|link)\s*\}?\}/i,
  /unsubscribe/i,
  /opt[\s-]?out/i,
];

function countAllCapsWords(text: string): number {
  // Words of 4+ chars that are entirely uppercase letters. 4 is the
  // sweet spot — under that we hit acronyms like "AI", "B2B", "USA"
  // that aren't spam signals.
  const matches = text.match(/\b[A-Z]{4,}\b/g);
  return matches ? matches.length : 0;
}

function countLinks(body: string): number {
  // Match raw URLs + anchor tags + markdown links. We over-count
  // intentionally — the heuristic is "too many", not "exact count".
  const urls = body.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  const anchors = body.match(/<a\s[^>]*href=/gi) ?? [];
  const markdown = body.match(/\]\([^)]+\)/g) ?? [];
  return urls.length + anchors.length + markdown.length;
}

export function checkSpamSignals(
  subject: string,
  body: string
): SpamCheckResult {
  const warnings: SpamWarning[] = [];
  const subj = (subject || "").trim();
  const bod = (body || "").trim();
  const bodLower = bod.toLowerCase();

  // ── Subject-level rules ───────────────────────────────────────
  if (subj.length > 0) {
    const subjCapsCount = countAllCapsWords(subj);
    if (subjCapsCount >= 1) {
      warnings.push({
        code: "subject-all-caps",
        message: `Subject has ${subjCapsCount} ALL-CAPS word${subjCapsCount === 1 ? "" : "s"} — many filters treat this as shouting.`,
        weight: 20,
      });
    }
    // Three or more punctuation chars in a row in the subject is
    // a near-perfect spam tell ("URGENT!!!", "FREE???").
    if (/[!?]{2,}/.test(subj)) {
      warnings.push({
        code: "subject-excessive-punct",
        message: "Subject has repeated ! or ? — Gmail penalises this.",
        weight: 15,
      });
    }
  }

  // ── Body length rules ────────────────────────────────────────
  if (bod.length > 0 && bod.length < 30) {
    warnings.push({
      code: "too-short",
      message: "Body is < 30 characters — likely a tracking-only ping, hurts engagement metrics.",
      weight: 10,
    });
  }
  if (bod.length > 4000) {
    warnings.push({
      code: "too-long",
      message: "Body is > 4 000 characters — most providers cap usable plain text below this.",
      weight: 10,
    });
  }

  // ── Body content rules ───────────────────────────────────────
  const bodyCapsCount = countAllCapsWords(bod);
  if (bodyCapsCount >= 3) {
    warnings.push({
      code: "all-caps-words",
      message: `Body has ${bodyCapsCount} ALL-CAPS words — keep emphasis under 2 to avoid the shouting flag.`,
      weight: 15,
    });
  }

  const exclamationCount = (bod.match(/!/g) || []).length;
  if (exclamationCount >= 3) {
    warnings.push({
      code: "excessive-exclamations",
      message: `Body has ${exclamationCount} exclamation marks — 0–1 is the norm for cold outbound.`,
      weight: 15,
    });
  }

  const phraseHits = SPAMMY_PHRASES.filter((p) => {
    const re = new RegExp(`\\b${p.replace(/\$/g, "\\$").replace(/\s+/g, "\\s+")}\\b`, "i");
    return re.test(bod) || re.test(subj);
  });
  if (phraseHits.length > 0) {
    warnings.push({
      code: "spammy-phrases",
      message: `Contains classic spam phrase${phraseHits.length === 1 ? "" : "s"}: ${phraseHits.slice(0, 3).map((p) => `"${p}"`).join(", ")}.`,
      weight: Math.min(25, 10 + phraseHits.length * 5),
    });
  }

  const linkCount = countLinks(bod);
  if (linkCount >= 3) {
    warnings.push({
      code: "too-many-links",
      message: `Body has ${linkCount} links — 1 is ideal, 2 acceptable. Spam filters distrust 3+.`,
      weight: 15,
    });
  }

  // Personalisation token absent across both subject and body.
  const hasPersonalisation =
    PERSONALISATION_TOKENS.some((re) => re.test(subj) || re.test(bod));
  if (!hasPersonalisation && bod.length > 0) {
    warnings.push({
      code: "missing-personalisation",
      message: "No personalisation tokens detected — mass-blast pattern. Add at least {{first_name}} or {{company}}.",
      weight: 10,
    });
  }

  // Unsubscribe / opt-out copy or token. Required by CAN-SPAM and
  // mandatory for the new Gmail/Yahoo bulk-sender requirements.
  const hasUnsub = UNSUBSCRIBE_TOKENS.some((re) => re.test(bodLower));
  if (!hasUnsub && bod.length > 0) {
    warnings.push({
      code: "missing-unsubscribe",
      message: "No unsubscribe link or {{unsubscribe_url}} token — CAN-SPAM and Gmail bulk-sender rules require one.",
      weight: 20,
    });
  }

  const score = Math.min(100, warnings.reduce((a, w) => a + w.weight, 0));
  const severity: SpamCheckResult["severity"] =
    score === 0 ? "clean" : score < 20 ? "low" : score < 50 ? "medium" : "high";

  return { score, severity, warnings };
}
