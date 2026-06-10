/**
 * Prospect brief — pure core (no IO imports, hermetic for vitest).
 *
 * The Call Mode fiche shows a quick pre-call brief: who the prospect is
 * (career background) and what the company says about itself on its own
 * website. This module holds the deterministic parts: HTML→text extraction,
 * the career timeline built from Apollo employment history, freshness, and
 * the fail-closed validation of the LLM's two sentences (empty over
 * invented — an ungrounded claim repeated on a live call is worse than
 * silence). IO (db, Apollo, site fetch, LLM) lives in prospect-brief.ts.
 */

// ── Shared types (server cache + API payload + client card) ─────

export interface CareerEntry {
  title: string | null;
  org: string | null;
  startYear: number | null;
  endYear: number | null;
  current: boolean;
}

export interface PersonBriefData {
  /** 1-2 LLM sentences, French, grounded — null when not derivable. */
  background: string | null;
  headline: string | null;
  career: CareerEntry[];
  linkedinUrl: string | null;
  /** Where the career data came from: Apollo match vs CRM-only fields. */
  source: "apollo" | "crm";
  generatedAt: string;
}

export interface CompanyWebBriefData {
  /** 2-3 LLM sentences, French, grounded in the site text — null if not. */
  summary: string | null;
  /** The site's own meta description — deterministic fallback, verbatim. */
  metaDescription: string | null;
  url: string | null;
  generatedAt: string;
}

export interface ProspectBriefPayload {
  person: PersonBriefData | null;
  company: CompanyWebBriefData | null;
}

export const BRIEF_TTL_DAYS = 30;

/** Fresh = generatedAt parses and is younger than ttlDays. */
export function isFresh(
  generatedAt: string | null | undefined,
  ttlDays: number = BRIEF_TTL_DAYS,
  nowMs: number = Date.now(),
): boolean {
  if (!generatedAt) return false;
  const t = new Date(generatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t < ttlDays * 86_400_000;
}

// ── Website text extraction ──────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  agrave: "à", acirc: "â", ccedil: "ç",
  ocirc: "ô", ouml: "ö", icirc: "î", iuml: "ï",
  ugrave: "ù", ucirc: "û", uuml: "ü",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
  hellip: "…", ndash: "–", mdash: "—", middot: "·",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function matchMetaContent(html: string, nameOrProp: string): string | null {
  // Both attribute orders, name= or property= (og:*). The content value can
  // contain the OTHER quote char (content="L'insertion…"), so the close
  // quote must be matched to the open quote via a backreference — a naive
  // [^"'] class truncates at the first apostrophe ("L").
  const re1 = new RegExp(
    `<meta\\b[^>]*\\b(?:name|property)\\s*=\\s*["']${nameOrProp}["'][^>]*\\bcontent\\s*=\\s*(["'])((?:(?!\\1)[\\s\\S])*)\\1`,
    "i",
  );
  const re2 = new RegExp(
    `<meta\\b[^>]*\\bcontent\\s*=\\s*(["'])((?:(?!\\1)[\\s\\S])*)\\1[^>]*\\b(?:name|property)\\s*=\\s*["']${nameOrProp}["']`,
    "i",
  );
  const m = html.match(re1) ?? html.match(re2);
  const v = m ? collapse(decodeEntities(m[2])) : "";
  return v.length > 0 ? v : null;
}

export interface ExtractedSiteText {
  title: string | null;
  metaDescription: string | null;
  /** Visible body text, entities decoded, whitespace collapsed, capped. */
  text: string;
}

/**
 * Strip a homepage's HTML down to what a human reads: <title>, the meta
 * description (name= or og:), and the visible body text with scripts,
 * styles, svg, comments and tags removed. Capped so the LLM prompt stays
 * bounded regardless of page size.
 */
export function extractWebsiteText(html: string, maxChars = 6000): ExtractedSiteText {
  const src = html ?? "";

  const titleMatch = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? collapse(decodeEntities(titleMatch[1])) || null : null;

  const metaDescription =
    matchMetaContent(src, "description") ?? matchMetaContent(src, "og:description");

  // Body only when the page has one — head content is noise for the summary.
  const bodyMatch = src.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : src;

  body = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    // Block-level boundaries become spaces so words don't glue together.
    .replace(/<[^>]+>/g, " ");

  const text = collapse(decodeEntities(body)).slice(0, maxChars).trim();

  return { title, metaDescription, text };
}

// ── Career timeline (deterministic — Apollo employment_history) ─

interface RawEmployment {
  organization_name?: string | null;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  current?: boolean | null;
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const m = String(date).match(/(\d{4})/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  return y >= 1900 && y <= 2100 ? y : null;
}

/**
 * Normalise Apollo employment history into a display-ready timeline:
 * current roles first (most recent start first), then past roles by end
 * year. Entries with neither title nor org are dropped; exact duplicates
 * (title+org+startYear) deduped; capped.
 */
export function buildCareerTimeline(
  history: ReadonlyArray<RawEmployment> | null | undefined,
  max = 5,
): CareerEntry[] {
  const entries: CareerEntry[] = [];
  const seen = new Set<string>();

  for (const raw of history ?? []) {
    const title = (raw.title ?? "").trim() || null;
    const org = (raw.organization_name ?? "").trim() || null;
    if (!title && !org) continue;

    const startYear = yearOf(raw.start_date);
    const endYear = yearOf(raw.end_date);
    // Apollo sets `current` explicitly; when absent, an entry without an
    // end date reads as ongoing.
    const current = raw.current === true || (raw.current == null && !raw.end_date);

    const key = `${title ?? ""}|${org ?? ""}|${startYear ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({ title, org, startYear, endYear, current });
  }

  entries.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    const aRank = (a.current ? a.startYear : a.endYear ?? a.startYear) ?? -1;
    const bRank = (b.current ? b.startYear : b.endYear ?? b.startYear) ?? -1;
    return bRank - aRank;
  });

  return entries.slice(0, max);
}

/** "2021–auj. — DG, Acme" / "2016–2021 — Dir. commercial, Beta SA". */
export function careerEntryLabel(e: CareerEntry): string {
  const role = [e.title, e.org].filter(Boolean).join(", ");
  let years = "";
  if (e.current) {
    years = e.startYear != null ? `${e.startYear}–auj.` : "En poste";
  } else if (e.startYear != null || e.endYear != null) {
    years = `${e.startYear ?? "?"}–${e.endYear ?? "?"}`;
  }
  return years ? `${years} — ${role}` : role;
}

// ── LLM output validation (fail-closed) ─────────────────────────

const REFUSAL_RE =
  /^(je suis désol|désol|sorry|i can(?:no|')t|i cannot|je ne peux|en tant qu'ia|as an ai|données insuffisantes|information insuffisante|insufficient)/i;

/** Trim/collapse, drop refusal/apology boilerplate, hard length cap. */
export function sanitizeLlmText(s: string | null | undefined, maxChars = 600): string {
  const v = collapse(s ?? "");
  if (!v) return "";
  if (REFUSAL_RE.test(v)) return "";
  return v.length > maxChars ? `${v.slice(0, maxChars).trimEnd()}…` : v;
}

export interface BriefTextInputsMeta {
  /** Career entries + headline + CRM title — anything person-grounding. */
  hasPersonInputs: boolean;
  /** Length of the extracted site text the LLM actually saw. */
  siteTextChars: number;
}

/** Site text below this is too thin to ground a company summary on. */
export const MIN_SITE_TEXT_CHARS = 200;

/**
 * Groundedness gate: an LLM sentence survives only when there was real
 * input behind it. No person data → no background; site text under the
 * threshold → no summary. Returns nulls (not empty strings) for the cache.
 */
export function validateBriefTexts(
  raw: { personBackground?: string | null; companySummary?: string | null },
  meta: BriefTextInputsMeta,
): { background: string | null; summary: string | null } {
  const background = meta.hasPersonInputs ? sanitizeLlmText(raw.personBackground) : "";
  const summary =
    meta.siteTextChars >= MIN_SITE_TEXT_CHARS ? sanitizeLlmText(raw.companySummary) : "";
  return {
    background: background.length > 0 ? background : null,
    summary: summary.length > 0 ? summary : null,
  };
}

// ── LinkedIn links (no scraping — deep links into the rep's browser) ─

/**
 * The "recent posts" answer without a LinkedIn integration: deep-link to
 * the profile's activity feed (person) or posts page (company). Returns
 * null for anything that isn't a recognisable LinkedIn profile URL.
 */
export function recentActivityUrl(linkedinUrl: string | null | undefined): string | null {
  const raw = (linkedinUrl ?? "").trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const path = u.pathname.replace(/\/+$/, "");
  if (/^\/in\/[^/]+/i.test(path)) {
    const base = path.match(/^\/in\/[^/]+/i)![0];
    return `https://www.linkedin.com${base}/recent-activity/all/`;
  }
  if (/^\/company\/[^/]+/i.test(path)) {
    const base = path.match(/^\/company\/[^/]+/i)![0];
    return `https://www.linkedin.com${base}/posts/`;
  }
  return null;
}

/** Canonical profile URL for the "Profil" link (normalised https). */
export function profileUrl(linkedinUrl: string | null | undefined): string | null {
  const raw = (linkedinUrl ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
