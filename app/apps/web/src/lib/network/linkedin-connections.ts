/**
 * LinkedIn `Connections.csv` parser — the founder's exported network as
 * structured, dedup'd connection rows ready to become contacts.
 *
 * Why a dedicated parser (not the generic /api/import path): LinkedIn's export
 * has three quirks the generic header:true importer would choke on:
 *   1. A "Notes:" preamble — the first 2-3 lines are a human-readable notice,
 *      then a BLANK line, and only THEN the real header row. Fed straight to a
 *      header parser, every column maps to the notice text.
 *   2. A UTF-8 BOM on the first byte (Windows/Excel exports).
 *   3. An empty `Email Address` on most rows (LinkedIn redacts the email unless
 *      the connection opted in) — the row is still useful: the profile URL is
 *      the handle we score + enrich on.
 *
 * Pure (string in, structured out), no I/O, no `@/` imports — unit-tested.
 * CSV field parsing is delegated to PapaParse (already the importer's engine)
 * so quoting/escaping stays the battle-tested path, not hand-rolled.
 */
import Papa from "papaparse";

export interface LinkedInConnection {
  firstName: string;
  lastName: string;
  fullName: string;
  /** Canonical `https://www.linkedin.com/in/<slug>` (lowercased) or null. */
  linkedinUrl: string | null;
  /** Lowercased, or null when LinkedIn redacted it. */
  email: string | null;
  company: string | null;
  /** Job title at the connection's current company. */
  position: string | null;
  /** ISO `yyyy-mm-dd` when parseable, else null. */
  connectedOn: string | null;
  /** The raw "Connected On" cell, kept verbatim for audit. */
  connectedOnRaw: string | null;
}

export interface ParseLinkedInResult {
  connections: LinkedInConnection[];
  /** Data rows seen after the header, before dedup/skip. */
  totalRows: number;
  /** Rows dropped as in-file duplicates (same person twice). */
  duplicates: number;
  /** Rows with no usable identity (no name, or no url AND no email). */
  skipped: number;
  /** False when no LinkedIn-shaped header row could be located. */
  headerFound: boolean;
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Strip a leading UTF-8 BOM if present. */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Canonicalize a LinkedIn profile URL to a dedup-stable form, or null. */
export function normalizeLinkedInUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  if (s === "") return null;
  // Drop scheme + any query/hash; the identity is the /in/<slug> path.
  s = s.replace(/^https?:\/\//, "").replace(/[?#].*$/, "");
  // Must be a linkedin.com host (incl. country subdomains like fr.linkedin.com)
  // — never fabricate a LinkedIn URL from an unrelated /in/ path.
  const host = s.split("/")[0];
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const m = s.match(/\/in\/([^/]+)\/?$/);
  if (m) return `https://www.linkedin.com/in/${m[1]}`;
  // Other linkedin paths (/pub, /company): keep cleaned, no trailing slash.
  return `https://${s.replace(/\/+$/, "")}`;
}

/** Parse LinkedIn's "DD Mon YYYY" (and "Mon DD, YYYY") to ISO yyyy-mm-dd. */
export function parseConnectedOn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // "15 Jun 2024"
  let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  // "Jun 15, 2024"
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mm = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

/** First non-empty trimmed value among the named columns (case-insensitive). */
function pick(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === n);
    if (key && row[key] != null) {
      const v = String(row[key]).trim();
      if (v !== "") return v;
    }
  }
  return "";
}

/** Index of the first line that looks like the LinkedIn connections header. */
export function findHeaderIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (
      l.includes("first name") &&
      (l.includes("url") || l.includes("email") || l.includes("position"))
    ) {
      return i;
    }
  }
  return -1;
}

export function parseLinkedInConnections(csvText: string): ParseLinkedInResult {
  const warnings: string[] = [];
  const text = stripBom(csvText ?? "");
  const rawLines = text.split(/\r\n|\r|\n/);
  const headerIdx = findHeaderIndex(rawLines);

  if (headerIdx === -1) {
    return {
      connections: [],
      totalRows: 0,
      duplicates: 0,
      skipped: 0,
      headerFound: false,
      warnings: ["No LinkedIn connections header row found"],
    };
  }
  if (headerIdx > 0) warnings.push(`Skipped ${headerIdx} preamble line(s) before the header`);

  const body = rawLines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const rows = parsed.data ?? [];
  let duplicates = 0;
  let skipped = 0;
  const seen = new Set<string>();
  const connections: LinkedInConnection[] = [];

  for (const row of rows) {
    const firstName = pick(row, "first name");
    const lastName = pick(row, "last name");
    const linkedinUrl = normalizeLinkedInUrl(pick(row, "url", "profile url"));
    const emailRaw = pick(row, "email address", "email");
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const company = pick(row, "company") || null;
    const position = pick(row, "position", "title") || null;
    const connectedOnRaw = pick(row, "connected on") || null;

    const hasName = firstName !== "" || lastName !== "";
    if (!hasName || (!linkedinUrl && !email)) {
      skipped++;
      continue;
    }

    const key =
      linkedinUrl ??
      (email ? `email:${email}` : `nc:${firstName}|${lastName}|${company ?? ""}`.toLowerCase());
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    connections.push({
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      linkedinUrl,
      email,
      company,
      position,
      connectedOn: parseConnectedOn(connectedOnRaw),
      connectedOnRaw,
    });
  }

  return {
    connections,
    totalRows: rows.length,
    duplicates,
    skipped,
    headerFound: true,
    warnings,
  };
}
