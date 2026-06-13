/**
 * Deterministic inference helpers for CRM auto-fill.
 *
 * These are pattern-based, no-LLM transformations that fill CRM fields from
 * data we already have (email headers, domains, titles). Cheap, fast,
 * predictable.
 *
 * Used as a first layer before expensive LLM extraction or paid API calls.
 *
 * Coverage (cf. _research/SOURCES_ANALYSIS.md §6.3 Module 3):
 *   - field 5  — title freshness check vs Apollo
 *   - field 7  — department from title/signature
 *   - field 8  — linkedinUrl guess + validate
 *   - field 19 — company.linkedinUrl guess
 *   - field 48 — decision-maker flag from seniority keywords
 */

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "hotmail.co.uk",
  "live.com",
  "live.fr",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.de",
  "gmx.fr",
  "mail.ru",
  "yandex.ru",
  "yandex.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "laposte.net",
  "sfr.fr",
  "bbox.fr",
  "neuf.fr",
  "qq.com",
  "163.com",
  "126.com",
]);

export function isFreeEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase().trim());
}

// ─── Name / email header parsing ──────────────────────────────

/**
 * Parse an RFC 5322-ish From header: `"John Smith" <john@acme.com>`.
 * Returns normalized first/last/email/domain.
 */
export function parseFromHeader(header: string): {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  domain: string | null;
} {
  if (!header) return { firstName: null, lastName: null, email: null, domain: null };

  const emailMatch = header.match(/<([^>]+)>/);
  const email = (emailMatch ? emailMatch[1] : header).trim().toLowerCase();

  const nameRaw = emailMatch ? header.slice(0, header.indexOf("<")).trim() : "";
  const name = nameRaw.replace(/^["']|["']$/g, "").trim();

  let firstName: string | null = null;
  let lastName: string | null = null;
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      firstName = parts[0];
    } else if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
  }

  const domain = email.includes("@") ? email.split("@")[1] || null : null;

  return {
    firstName,
    lastName,
    email: email.includes("@") ? email : null,
    domain,
  };
}

// ─── Email pattern inference per domain ───────────────────────

export type EmailPattern =
  | "first.last"
  | "firstlast"
  | "first"
  | "f.last"
  | "flast"
  | "first_last"
  | "last.first"
  | "unknown";

/**
 * Given known (firstName, email) pairs for a domain, detect the pattern used.
 * Returns `unknown` if no consistent pattern found across ≥ 2 samples.
 */
export function detectPatternFromSamples(
  samples: Array<{ firstName: string; lastName: string; localPart: string }>,
): EmailPattern {
  if (samples.length === 0) return "unknown";

  const matches: Record<EmailPattern, number> = {
    "first.last": 0,
    firstlast: 0,
    first: 0,
    "f.last": 0,
    flast: 0,
    first_last: 0,
    "last.first": 0,
    unknown: 0,
  };

  for (const s of samples) {
    const f = s.firstName.toLowerCase();
    const l = s.lastName.toLowerCase();
    const fi = f[0] || "";
    const local = s.localPart.toLowerCase();

    if (!f || !l || !local) continue;

    if (local === `${f}.${l}`) matches["first.last"]++;
    else if (local === `${f}${l}`) matches.firstlast++;
    else if (local === f) matches.first++;
    else if (local === `${fi}.${l}`) matches["f.last"]++;
    else if (local === `${fi}${l}`) matches.flast++;
    else if (local === `${f}_${l}`) matches.first_last++;
    else if (local === `${l}.${f}`) matches["last.first"]++;
  }

  let best: EmailPattern = "unknown";
  let bestCount = 0;
  for (const [pat, count] of Object.entries(matches) as [EmailPattern, number][]) {
    if (count > bestCount && pat !== "unknown") {
      bestCount = count;
      best = pat;
    }
  }
  // Require at least 2 samples agreeing, OR 1 sample if only 1 exists
  if (samples.length === 1 && bestCount === 1) return best;
  return bestCount >= 2 ? best : "unknown";
}

export function applyEmailPattern(
  pattern: EmailPattern,
  firstName: string,
  lastName: string,
  domain: string,
): string | null {
  if (pattern === "unknown") return null;
  const f = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const l = lastName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!f || !l) return null;
  const fi = f[0];

  const local =
    pattern === "first.last"
      ? `${f}.${l}`
      : pattern === "firstlast"
      ? `${f}${l}`
      : pattern === "first"
      ? f
      : pattern === "f.last"
      ? `${fi}.${l}`
      : pattern === "flast"
      ? `${fi}${l}`
      : pattern === "first_last"
      ? `${f}_${l}`
      : pattern === "last.first"
      ? `${l}.${f}`
      : null;

  return local ? `${local}@${domain}` : null;
}

// ─── Title → department + seniority ───────────────────────────

const DEPARTMENT_KEYWORDS: Array<{ dept: string; patterns: RegExp[] }> = [
  { dept: "Engineering", patterns: [/\b(engineer|developer|développeu|programmer|swe|sre|devops|tech lead|architect|cto|vp eng|head of eng)/i] },
  { dept: "Product", patterns: [/\b(product manager|product owner|cpo|vp product|head of product|product lead|\bpm\b)/i] },
  { dept: "Design", patterns: [/\b(designer|\bux\b|\bui\b|design lead|head of design|cdo)/i] },
  { dept: "Sales", patterns: [/\b(sales|account executive|\bae\b|sdr|bdr|cro|vp sales|head of sales|commercial|business development|directeur commercial)/i] },
  { dept: "Marketing", patterns: [/\b(marketing|cmo|vp marketing|head of marketing|growth|demand gen|content marketing)/i] },
  { dept: "Customer Success", patterns: [/\b(customer success|cs manager|csm|\bcx\b|support lead|head of cs)/i] },
  { dept: "Operations", patterns: [/\b(operations|\bops\b|coo|vp ops|chief of staff)/i] },
  { dept: "Finance", patterns: [/\b(finance|cfo|controller|accounting|fp&a|financial)/i] },
  { dept: "HR / People", patterns: [/\b(people|\bhr\b|chro|recruit|talent)/i] },
  { dept: "Legal", patterns: [/\b(legal|counsel|general counsel|\bgc\b)/i] },
  { dept: "Data", patterns: [/\b(data scientist|data engineer|analytics|ml engineer|chief data|head of data)/i] },
  { dept: "Executive", patterns: [/\b(ceo|president|founder|co[-\s]?founder|managing director|\bmd\b|owner)/i] },
];

export function inferDepartmentFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  for (const { dept, patterns } of DEPARTMENT_KEYWORDS) {
    if (patterns.some((p) => p.test(title))) return dept;
  }
  return null;
}

export type Seniority =
  | "c_level"
  | "vp"
  | "director"
  | "manager"
  | "senior"
  | "ic"
  | "founder"
  | "unknown";

export function inferSeniorityFromTitle(title: string | null | undefined): Seniority {
  if (!title) return "unknown";
  const t = title.toLowerCase();

  if (/\b(founder|co[-\s]?founder|owner)\b/.test(t)) return "founder";
  if (/\b(ceo|cto|cfo|coo|cmo|cpo|cro|cdo|chro|cso|chief [a-z]+ officer|president)\b/.test(t)) return "c_level";
  if (/\bvp\b|vice president|svp|evp/.test(t)) return "vp";
  if (/\bdirector\b|head of\b|lead of\b/.test(t)) return "director";
  if (/\bmanager\b|team lead\b|tech lead\b|principal\b|staff\b/.test(t)) return "manager";
  if (/\bsenior\b|\bsr\.?\b|lead\b/.test(t)) return "senior";
  return "ic";
}

export function isDecisionMaker(seniority: Seniority): boolean {
  return seniority === "c_level" || seniority === "founder" || seniority === "vp";
}

// ─── LinkedIn URL guess (person + company) ────────────────────

/**
 * Guess a LinkedIn personal URL. Deterministic: `linkedin.com/in/{first-last}`.
 * Caller should HEAD-request to validate before persisting as source of truth.
 */
export function guessLinkedInPersonUrl(
  firstName: string | null,
  lastName: string | null,
): string | null {
  if (!firstName || !lastName) return null;
  const slug = `${firstName}-${lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug || slug === "-") return null;
  return `https://www.linkedin.com/in/${slug}`;
}

/**
 * Guess a LinkedIn company URL from a domain. `acme.com` → `linkedin.com/company/acme`.
 * The slug is never a perfect match for the canonical LinkedIn handle, so
 * callers should treat this as a best-effort guess until validated.
 */
export function guessLinkedInCompanyUrl(domain: string | null): string | null {
  if (!domain) return null;
  const bare = domain
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")[0];
  if (!bare || bare.length < 2) return null;
  return `https://www.linkedin.com/company/${bare}`;
}

// ─── Signature block parsing ──────────────────────────────────

/**
 * Extract a likely title from an email signature block. Looks at the last
 * 10 non-empty lines and picks the first one that matches a title pattern.
 */
export function extractTitleFromSignature(body: string | null | undefined): string | null {
  if (!body) return null;
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-15);

  const titleHint = /(ceo|cto|cfo|coo|cmo|cpo|cro|founder|president|director|manager|engineer|designer|marketing|sales|operations|head of|vp\b|chief\b|owner|lead\b)/i;

  for (const line of lines) {
    if (line.length > 120) continue;
    if (line.includes("@") || line.includes("http")) continue;
    if (titleHint.test(line)) return line;
  }
  return null;
}
