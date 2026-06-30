/**
 * Spec 36 (T11) — source the JOBS and POSTS search categories into the canonical
 * CRM.
 *
 * Jobs → the HIRING COMPANY becomes an account (provider "unipile", deduped/merged
 * canonically) carrying a hiring signal in `properties.hiring` (the role they're
 * hiring for + when/where). A company hiring a "VP of Sales" / "Head of RevOps" is
 * a GTM-scaling buying signal.
 *
 * Posts → the post AUTHOR (a person) becomes a warm-lead contact (deduped on the
 * normalized linkedin_url), stamped with the topic they posted about. Optionally
 * also source everyone who ENGAGED each post (reuses post-sourcing).
 *
 * Server-only (DB + live Unipile). The result→fields mapping reuses the canonical
 * upsert + the engager mapper.
 */

import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { upsertAccount, upsertContact } from "@/db/canonical/upsert";
import { searchLinkedIn, type UnipileConfig, type LinkedInSearchResult } from "@/lib/providers/unipile/http";
import { enrichAccountFromLinkedIn } from "@/lib/providers/unipile/enrichment";
import { engagerToContact, sourceEngagersFromPost } from "./post-sourcing";
import type { JobsSearchBody, PostsSearchBody } from "./jobs-posts";

const UNIPILE = "unipile";

// ---------------------------------------------------------------------------
// JOBS → hiring-signal accounts
// ---------------------------------------------------------------------------

interface JobCompany {
  id?: string | number;
  name?: string;
  public_identifier?: string;
  profile_url?: string;
}
interface JobResult extends LinkedInSearchResult {
  title?: string;
  location?: string;
  posted_at?: string;
  url?: string;
  company?: JobCompany;
}

/** One recorded hiring signal — a role a company is currently hiring for. */
export interface HiringSignal {
  title: string;
  location: string | null;
  postedAt: string | null;
  url: string | null;
}

export interface HiringSourcingResult {
  jobsScanned: number;
  accountsUpserted: number;
  signalsRecorded: number;
  skippedNoCompany: number;
}

/**
 * Run a jobs search and upsert each hiring company as an account carrying its
 * open roles as a hiring signal. Companies are deduped across the run (a company
 * hiring 3 roles → one account, 3 signals). `hydrateAccounts` fetches each
 * company's LinkedIn profile for domain/industry/size (1 view/company).
 */
export async function sourceHiringSignals(params: {
  cfg: UnipileConfig;
  tenantId: string;
  unipileAccountId: string;
  body: JobsSearchBody;
  maxResults?: number;
  hydrateAccounts?: boolean;
}): Promise<HiringSourcingResult> {
  const { cfg, tenantId, unipileAccountId } = params;
  const max = params.maxResults ?? 100;
  const result: HiringSourcingResult = { jobsScanned: 0, accountsUpserted: 0, signalsRecorded: 0, skippedNoCompany: 0 };

  // Collect signals per company before any write (avoids jsonb array-append races
  // and lets a company hiring several roles upsert once).
  const byCompany = new Map<string, { name: string; linkedinId: string | null; profileUrl: string | null; signals: HiringSignal[] }>();

  let cursor: string | null = null;
  while (result.jobsScanned < max) {
    const page = await searchLinkedIn(cfg, unipileAccountId, params.body, { cursor, limit: Math.min(50, max - result.jobsScanned) });
    if (page.items.length === 0) break;
    for (const raw of page.items as JobResult[]) {
      result.jobsScanned++;
      const company = raw.company;
      const name = company?.name?.trim();
      if (!name) {
        result.skippedNoCompany++;
        continue;
      }
      const key = company?.id != null ? `id:${company.id}` : `name:${name.toLowerCase()}`;
      const entry = byCompany.get(key) ?? {
        name,
        linkedinId: company?.id != null ? String(company.id) : null,
        profileUrl: company?.profile_url ?? null,
        signals: [],
      };
      if (raw.title?.trim()) {
        entry.signals.push({
          title: raw.title.trim(),
          location: raw.location?.trim() || null,
          postedAt: raw.posted_at ?? null,
          url: raw.url ?? null,
        });
      }
      byCompany.set(key, entry);
      if (result.jobsScanned >= max) break;
    }
    cursor = page.cursor;
    if (!cursor) break;
  }

  const observedAt = new Date();
  for (const entry of byCompany.values()) {
    // Optional enrichment: domain/industry/size from the LinkedIn company profile.
    let domain: string | undefined;
    let industry: string | undefined;
    let size: string | undefined;
    if (params.hydrateAccounts && entry.linkedinId) {
      try {
        const e = await enrichAccountFromLinkedIn(cfg, unipileAccountId, entry.linkedinId);
        domain = e.fields.domain ?? undefined;
        industry = e.fields.industry ?? undefined;
        size = e.fields.size ?? undefined;
      } catch {
        /* best-effort — fall back to name-only */
      }
    }
    const row = await upsertAccount(tenantId, { name: entry.name, domain, industry, size, provider: UNIPILE, observedAt });
    if (!row?.id) continue;
    result.accountsUpserted++;
    if (entry.signals.length) {
      const patch = {
        hiring: {
          signals: entry.signals,
          linkedinUrl: entry.profileUrl,
          lastSourcedAt: observedAt.toISOString(),
        },
      };
      await db
        .update(companies)
        .set({ properties: sql`coalesce(${companies.properties}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
        .where(eq(companies.id, row.id));
      result.signalsRecorded += entry.signals.length;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// POSTS → author + engager leads
// ---------------------------------------------------------------------------

interface PostAuthor {
  public_identifier?: string;
  id?: string;
  name?: string;
  is_company?: boolean;
  headline?: string;
}
interface PostResult extends LinkedInSearchResult {
  social_id?: string;
  text?: string;
  author?: PostAuthor;
}

export interface PostsSourcingResult {
  postsScanned: number;
  authorsUpserted: number;
  engagersSourced: number;
  skipped: number;
}

/**
 * Run a posts search and source the people behind the content. Each post's author
 * (a person — companies are skipped) becomes a warm-lead contact stamped with the
 * topic. With `includeEngagers`, every post's reactors/commenters are also sourced
 * (reuses post-sourcing; ~a few LIST reads per post, no profile views).
 */
export async function sourcePostAuthors(params: {
  cfg: UnipileConfig;
  tenantId: string;
  unipileAccountId: string;
  body: PostsSearchBody;
  maxResults?: number;
  includeEngagers?: boolean;
}): Promise<PostsSourcingResult> {
  const { cfg, tenantId, unipileAccountId } = params;
  const max = params.maxResults ?? 50;
  const topic = params.body.keywords ?? null;
  const result: PostsSourcingResult = { postsScanned: 0, authorsUpserted: 0, engagersSourced: 0, skipped: 0 };
  const seen = new Set<string>();
  const observedAt = new Date();

  let cursor: string | null = null;
  while (result.postsScanned < max) {
    const page = await searchLinkedIn(cfg, unipileAccountId, params.body, { cursor, limit: Math.min(50, max - result.postsScanned) });
    if (page.items.length === 0) break;
    for (const raw of page.items as PostResult[]) {
      result.postsScanned++;
      const author = raw.author;
      // Person authors → contacts (companies are skipped). Build the /in/ URL from
      // the public_identifier so the engager mapper can normalize + dedup it.
      if (author && author.is_company !== true && author.public_identifier) {
        const fields = engagerToContact({
          name: author.name,
          headline: author.headline,
          profileUrl: `https://www.linkedin.com/in/${author.public_identifier}`,
        });
        if (fields && !seen.has(fields.linkedinUrl)) {
          seen.add(fields.linkedinUrl);
          const contact = await upsertContact(tenantId, {
            linkedinUrl: fields.linkedinUrl,
            firstName: fields.firstName,
            lastName: fields.lastName,
            title: fields.title,
            provider: UNIPILE,
            observedAt,
          });
          if (contact) {
            const patch = { linkedinPost: { topic, socialId: raw.social_id ?? null, observedAt: observedAt.toISOString() } };
            await db
              .update(contacts)
              .set({ properties: sql`coalesce(${contacts.properties}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
              .where(and(eq(contacts.id, contact.id), eq(contacts.tenantId, tenantId)));
            result.authorsUpserted++;
          }
        }
      } else if (author?.is_company === true) {
        result.skipped++;
      }
      // Optional: source everyone who engaged this post too.
      if (params.includeEngagers && raw.social_id) {
        try {
          const e = await sourceEngagersFromPost(cfg, { tenantId, unipileAccountId }, raw.social_id, { seen });
          result.engagersSourced += e.contactsUpserted;
        } catch {
          /* best-effort — never fail the run on one post's engagers */
        }
      }
      if (result.postsScanned >= max) break;
    }
    cursor = page.cursor;
    if (!cursor) break;
  }
  return result;
}
