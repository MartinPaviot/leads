/**
 * Company intake — industrialised "FDAE onboarding" for tenant Knowledge.
 *
 * What a forward-deployed sales executive learns about a company before
 * selling for it, extracted from the company's OWN website into stable,
 * founder-editable Knowledge entries (Settings → Knowledge) that the chat,
 * call-script generation, objection bank and TAM prompts already consume.
 *
 * Grounding contract:
 *  - canonical section titles (INTAKE_SECTIONS) → idempotent upserts and a
 *    recognisable structure; the model cannot invent sections (validated
 *    verbatim, fail-closed drop);
 *  - categories are FORCED from the canonical map, never trusted from the
 *    model;
 *  - the prompt forbids invention: only facts observable in the fetched
 *    pages, claims attributed to the site, no numbers/certifications/
 *    customers beyond what the pages state. Source URLs are appended to
 *    each saved entry;
 *  - what the site CANNOT answer comes back as `gaps` — founder questions —
 *    returned to the caller, never saved as knowledge.
 *
 * Fetching is SSRF-guarded on every hop (same contract as
 * api/onboarding/analyze-website): user-supplied URLs must resolve to
 * public addresses, redirects re-validated.
 */

import { createHash } from "crypto";
import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { assertPublicUrl } from "@/lib/infra/ssrf-guard";
import { embedKnowledgeEntry } from "./retrieval";
import logger from "@/lib/observability/logger";

/** Canonical FDAE sections — stable titles (idempotent upserts) + forced category. */
export const INTAKE_SECTIONS: ReadonlyArray<{ title: string; category: string; hint: string }> = [
  { title: "Company — Identity & legal", category: "context", hint: "Legal entity, locations, founding facts, who is behind the company." },
  { title: "Company — Offer & packaging", category: "product", hint: "What is sold, the modules/services, how it is delivered." },
  { title: "Company — Pricing & commercial model", category: "product", hint: "Pricing structure, billing currency/shape, contract model — only as stated." },
  { title: "Company — Customers & segments served", category: "icp", hint: "Observed customers, segments, use cases (logos, testimonials, case studies)." },
  { title: "Company — Proof points", category: "context", hint: "Numbers, SLAs, named customers, awards — exactly as the site claims them." },
  { title: "Company — Differentiation & alternatives", category: "competitors", hint: "Positioning, what it replaces, competitors/alternatives mentioned or implied." },
  { title: "Company — Sales process & CTAs", category: "process", hint: "How a deal starts: CTAs, demo/review offers, onboarding steps described." },
  { title: "Company — Delivery, support & SLAs", category: "process", hint: "Support model, response times, operational promises." },
  { title: "Company — Compliance & hosting posture", category: "context", hint: "Data residency, certifications CLAIMED (or explicitly not claimed), legal posture." },
];

const SECTION_BY_TITLE = new Map(INTAKE_SECTIONS.map((s) => [s.title, s]));

export interface IntakePage {
  url: string;
  text: string;
}

export interface IntakeEntry {
  title: string;
  category: string;
  content: string;
  sourceUrls: string[];
}

export interface IntakeGap {
  question: string;
  why: string;
}

export interface IntakeResult {
  ok: boolean;
  error?: string;
  pages: Array<{ url: string; chars: number }>;
  entries: IntakeEntry[];
  gaps: IntakeGap[];
  created: number;
  updated: number;
  unchanged: number;
  dryRun: boolean;
}

/* ------------------------------------------------------------------ */
/*  Fetching (SSRF-guarded, no DOM parser)                             */
/* ------------------------------------------------------------------ */

async function safeFetch(url: string): Promise<{ finalUrl: string; html: string } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const check = await assertPublicUrl(current);
    if (!check.ok || !check.url) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(check.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Elevay/1.0; +https://elevay.com)",
          Accept: "text/html",
        },
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        current = new URL(loc, check.url).toString();
        continue;
      }
      if (!res.ok) return null;
      return { finalUrl: check.url, html: await res.text() };
    } catch {
      return null;
    }
  }
  return null;
}

/** Strip an HTML page to LLM-ready text (title, metas, headings, body). */
export function pageToText(html: string, cap = 5000): string {
  const extract = (pattern: RegExp): string => {
    const match = html.match(pattern);
    return match?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
  };
  const title = extract(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc =
    extract(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
    extract(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
  const headings: string[] = [];
  const headingRegex = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
  let h;
  while ((h = headingRegex.exec(html)) !== null && headings.length < 16) {
    const t = h[1].replace(/<[^>]*>/g, "").trim();
    if (t.length > 2 && t.length < 200) headings.push(t);
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, cap);
  return [
    title && `Title: ${title}`,
    metaDesc && `Meta: ${metaDesc}`,
    headings.length > 0 && `Headings: ${headings.join(" | ")}`,
    body && `Content: ${body}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Paths an FDAE would read first. Link TRIAGE heuristic (not data matching). */
const LINK_KEYWORDS =
  /about|a-propos|apropos|équipe|equipe|team|company|societe|société|pricing|tarif|prix|offer|offre|product|produit|service|solution|platform|cloud|hosting|infrastructure|workflow|faq|contact|legal|mentions/i;

/** Pick same-origin candidate pages from a fetched HTML, scored by path keywords. */
export function pickCandidateLinks(html: string, baseUrl: string, max = 5): string[] {
  const out = new Map<string, number>();
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const hrefRegex = /href=["']([^"'#?]+)[^"']*["']/gi;
  let m;
  while ((m = hrefRegex.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
    let abs: URL;
    try {
      abs = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue;
    const path = abs.pathname.replace(/\/$/, "");
    if (!path || path === "") continue;
    if (/\.(png|jpe?g|svg|gif|webp|css|js|pdf|ico|woff2?)$/i.test(path)) continue;
    const key = `${abs.origin}${path}`;
    if (key === `${origin}` || key === baseUrl.replace(/\/$/, "")) continue;
    const score = LINK_KEYWORDS.test(path) ? 2 : 0;
    if (score === 0) continue; // only keyword-relevant pages — depth stays shallow
    out.set(key, Math.max(out.get(key) ?? 0, score));
  }
  return [...out.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([url]) => url);
}

/** Fetch the root + a few FDAE-relevant pages (+ explicit extra URLs). */
export async function fetchCompanyPages(
  rootUrl: string,
  opts: { extraUrls?: string[]; maxPages?: number } = {},
): Promise<IntakePage[]> {
  const pages: IntakePage[] = [];
  const seen = new Set<string>();
  const push = (url: string, html: string) => {
    const text = pageToText(html);
    if (text.length > 100) pages.push({ url, text });
  };

  const root = await safeFetch(rootUrl);
  if (root) {
    seen.add(rootUrl.replace(/\/$/, ""));
    push(root.finalUrl, root.html);
    const candidates = pickCandidateLinks(root.html, root.finalUrl, opts.maxPages ?? 5);
    for (const url of candidates) {
      if (seen.has(url)) continue;
      seen.add(url);
      const page = await safeFetch(url);
      if (page) push(url, page.html);
    }
  }
  for (const extra of opts.extraUrls ?? []) {
    const key = extra.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const page = await safeFetch(extra);
    if (page) push(extra, page.html);
  }
  return pages;
}

/* ------------------------------------------------------------------ */
/*  Extraction (one grounded LLM pass) + validation                    */
/* ------------------------------------------------------------------ */

const intakeSchema = z.object({
  entries: z
    .array(
      z.object({
        title: z.string().describe("EXACTLY one of the provided section titles, verbatim"),
        content: z
          .string()
          .describe("The section's facts, in the site's primary language. Only what the pages state — no invention, no embellishment."),
        sourceUrls: z.array(z.string()).describe("The fetched page URLs these facts come from"),
      }),
    )
    .describe("One entry per section that has real evidence; omit sections without evidence"),
  gaps: z
    .array(
      z.object({
        question: z.string().describe("A specific question to ask the founder, in the site's language"),
        why: z.string().describe("Why a salesperson needs this answer"),
      }),
    )
    .describe("What the website cannot answer but a forward-deployed sales exec would need (pricing numbers, real references, sales cycle, win/loss reasons...)"),
});

/**
 * Validate model output against the canonical sections: unknown titles are
 * DROPPED, categories forced from the map, content length-gated, source
 * URLs restricted to actually-fetched pages, one entry per section.
 */
export function validateIntakeEntries(
  raw: Array<{ title?: unknown; content?: unknown; sourceUrls?: unknown }>,
  fetchedUrls: string[],
): IntakeEntry[] {
  const allowedUrls = new Set(fetchedUrls);
  const seen = new Set<string>();
  const out: IntakeEntry[] = [];
  for (const e of raw) {
    const title = typeof e.title === "string" ? e.title.trim() : "";
    const section = SECTION_BY_TITLE.get(title);
    if (!section || seen.has(title)) continue;
    const content = typeof e.content === "string" ? e.content.trim() : "";
    if (content.length < 80 || content.length > 4000) continue;
    const sourceUrls = Array.isArray(e.sourceUrls)
      ? [...new Set(e.sourceUrls.filter((u): u is string => typeof u === "string" && allowedUrls.has(u)))]
      : [];
    seen.add(title);
    out.push({ title, category: section.category, content, sourceUrls });
  }
  return out;
}

async function extractIntake(
  pages: IntakePage[],
  tenantId: string,
): Promise<{ entries: IntakeEntry[]; gaps: IntakeGap[] }> {
  if (!process.env.ANTHROPIC_API_KEY) return { entries: [], gaps: [] };
  const pagesBlock = pages
    .map((p) => `=== PAGE: ${p.url} ===\n${p.text}`)
    .join("\n\n");
  try {
    const { object } = await tracedGenerateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: intakeSchema,
      temperature: 0.2,
      prompt: `You are doing the research a forward-deployed sales executive does before selling for a company: read its website and write the knowledge base entries a new salesperson needs.

SECTIONS (use these EXACT titles, one entry max per section, OMIT a section when the pages carry no real evidence for it):
${INTAKE_SECTIONS.map((s) => `- "${s.title}" — ${s.hint}`).join("\n")}

HARD RULES:
- Facts ONLY from the pages below. Never invent numbers, certifications, customer names, team sizes or pricing. If the site explicitly disclaims something (e.g. certifications it does not hold), record that disclaimer — it is sales-critical.
- Write each entry in the site's primary language, in dense plain prose a rep can absorb in 30 seconds. No hype, no marketing adjectives of your own.
- Attribute claims to the site where it matters ("the site states...", "le site annonce...").
- For everything important that the website CANNOT answer (real price points, named references, sales cycle length, churn/win reasons, team size), add a precise founder question to \`gaps\` instead of guessing.

${pagesBlock}`,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      _trace: {
        agentId: "company-intake",
        tenantId,
        inputPreview: `${pages.length} pages: ${pages.map((p) => p.url).join(", ").slice(0, 140)}`,
      },
    });
    const parsed = object as z.infer<typeof intakeSchema>;
    return {
      entries: validateIntakeEntries(parsed.entries ?? [], pages.map((p) => p.url)),
      gaps: (parsed.gaps ?? []).filter((g) => g.question?.trim()).slice(0, 12),
    };
  } catch (e) {
    logger.warn("Company intake extraction failed", { error: String(e) });
    return { entries: [], gaps: [] };
  }
}

/* ------------------------------------------------------------------ */
/*  Persistence (idempotent upsert by title) + orchestration           */
/* ------------------------------------------------------------------ */

async function upsertIntakeEntry(
  tenantId: string,
  userId: string,
  entry: IntakeEntry,
): Promise<"created" | "updated" | "unchanged"> {
  const content =
    entry.sourceUrls.length > 0
      ? `${entry.content}\n\nSources: ${entry.sourceUrls.join(" · ")}`
      : entry.content;
  const contentHash = createHash("sha256").update(content.trim()).digest("hex");

  const [existing] = await db
    .select({ id: knowledgeEntries.id, contentHash: knowledgeEntries.contentHash })
    .from(knowledgeEntries)
    .where(and(eq(knowledgeEntries.tenantId, tenantId), eq(knowledgeEntries.title, entry.title)))
    .limit(1);

  if (existing) {
    if (existing.contentHash === contentHash) return "unchanged";
    await db
      .update(knowledgeEntries)
      .set({ content: content.trim(), category: entry.category, contentHash, isActive: true, updatedAt: new Date() })
      .where(eq(knowledgeEntries.id, existing.id));
    embedKnowledgeEntry(tenantId, existing.id, entry.title, content).catch(() => {});
    return "updated";
  }

  const [inserted] = await db
    .insert(knowledgeEntries)
    .values({
      tenantId,
      createdBy: userId,
      scope: "workspace",
      title: entry.title,
      category: entry.category,
      content: content.trim(),
      contentHash,
    })
    .returning();
  embedKnowledgeEntry(tenantId, inserted.id, inserted.title, inserted.content).catch(() => {});
  return "created";
}

/**
 * Run the intake: fetch → extract → validate → (unless dryRun) upsert.
 * Never throws; an empty result carries `error` for the caller to surface.
 */
export async function runCompanyIntake(params: {
  tenantId: string;
  userId: string;
  url: string;
  extraUrls?: string[];
  dryRun?: boolean;
}): Promise<IntakeResult> {
  const dryRun = params.dryRun ?? false;
  const base: IntakeResult = { ok: false, pages: [], entries: [], gaps: [], created: 0, updated: 0, unchanged: 0, dryRun };

  const pages = await fetchCompanyPages(params.url, { extraUrls: params.extraUrls });
  base.pages = pages.map((p) => ({ url: p.url, chars: p.text.length }));
  if (pages.length === 0) {
    return { ...base, error: "No fetchable pages (blocked, unreachable, or non-public URL)." };
  }

  const { entries, gaps } = await extractIntake(pages, params.tenantId);
  base.entries = entries;
  base.gaps = gaps;
  if (entries.length === 0) {
    return { ...base, error: "Extraction produced no valid sections (model unavailable or pages too thin)." };
  }

  if (!dryRun) {
    for (const entry of entries) {
      const outcome = await upsertIntakeEntry(params.tenantId, params.userId, entry);
      if (outcome === "created") base.created++;
      else if (outcome === "updated") base.updated++;
      else base.unchanged++;
    }
  }
  return { ...base, ok: true };
}
