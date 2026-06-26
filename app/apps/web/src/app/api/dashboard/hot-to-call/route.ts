/**
 * GET /api/dashboard/hot-to-call
 *
 * Unified "callable hot leads" feed. Combines three signal streams
 * (email opens + email clicks + identified web visits) into a single
 * list of contacts, filtered to those with a phone number on file,
 * scored by `lib/hot-to-call/scoring.ts`, and sorted hottest first.
 *
 * Query params:
 *   hours   — lookback window in hours. Default 168 (7d). Cap 720 (30d).
 *   limit   — max number of contacts returned. Default 50. Cap 200.
 *
 * Response shape — see `HotToCallResponse` below.
 *
 * Anti-noise rule: a contact with NO direct signal (no own open/click)
 * but a visit from their company DOES surface — visits are a company-
 * level signal, every contact at the company is a candidate. The
 * recency × weight curve means a visiting company with 5 contacts
 * doesn't suddenly drown out a contact who just clicked.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails, contacts, companies, visits } from "@/db/schema";
import { and, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { notExcludedAsLeadSql } from "@/lib/inbound/lead-status-sql";
import {
  computeHotness,
  isInSpeedWindow,
  minutesAgo,
  pickHeadlineSignal,
  rankContacts,
  type HotSignal,
  type HotSignalKind,
} from "@/lib/hot-to-call/scoring";

const DEFAULT_HOURS = 168;
const MAX_HOURS = 720;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type HotToCallItem = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
  hotness: number;
  isSpeedWindow: boolean;
  lastSignal: {
    kind: HotSignalKind;
    at: string;
    minutesAgo: number;
    detail: string | null;
  };
  signals: Array<{
    kind: HotSignalKind;
    at: string;
    detail: string | null;
  }>;
};

export type HotToCallResponse = {
  items: HotToCallItem[];
  windowHours: number;
  generatedAt: string;
};

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const hours = Math.min(
    MAX_HOURS,
    Math.max(1, Number(url.searchParams.get("hours") ?? DEFAULT_HOURS)),
  );
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)),
  );
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const now = new Date();

  // 1. Email signals — opens AND clicks, joined to contacts that
  //    have a phone (the only ones we can act on). One query covers
  //    both kinds; we classify in code.
  const emailRows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      title: contacts.title,
      companyId: contacts.companyId,
      openedAt: outboundEmails.openedAt,
      clickedAt: outboundEmails.clickedAt,
      subject: outboundEmails.subject,
    })
    .from(outboundEmails)
    .innerJoin(
      contacts,
      and(
        eq(contacts.id, outboundEmails.contactId),
        eq(contacts.tenantId, authCtx.tenantId),
        isNotNull(contacts.phone),
        isNull(contacts.deletedAt),
        // Don't surface a contact ruled not-a-lead as "hot to call" just because
        // they opened/clicked — mirrors the dashboard-summary prospect gate.
        notExcludedAsLeadSql(contacts.properties),
      ),
    )
    .where(
      and(
        eq(outboundEmails.tenantId, authCtx.tenantId),
        or(
          and(
            isNotNull(outboundEmails.openedAt),
            gte(outboundEmails.openedAt, since),
          ),
          and(
            isNotNull(outboundEmails.clickedAt),
            gte(outboundEmails.clickedAt, since),
          ),
        ),
      ),
    );

  // 2. Visit signals — identified visits joined to every contact at
  //    the resolved company that has a phone. A visit is a company-
  //    level signal so we fan it out across the company's contacts.
  const visitRows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      title: contacts.title,
      companyId: contacts.companyId,
      visitedAt: visits.createdAt,
      visitUrl: visits.url,
    })
    .from(visits)
    .innerJoin(
      contacts,
      and(
        eq(contacts.companyId, visits.companyId),
        eq(contacts.tenantId, authCtx.tenantId),
        isNotNull(contacts.phone),
        isNull(contacts.deletedAt),
        notExcludedAsLeadSql(contacts.properties),
      ),
    )
    .where(
      and(
        eq(visits.tenantId, authCtx.tenantId),
        isNotNull(visits.companyId),
        gte(visits.createdAt, since),
      ),
    );

  // 3. Aggregate per contact. Each contact accumulates every signal
  //    that matches them so the hotness sum is over the full picture.
  type Bucket = {
    contactId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string;
    title: string | null;
    companyId: string | null;
    signals: HotSignal[];
  };
  const buckets = new Map<string, Bucket>();

  function getOrInit(row: {
    contactId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    companyId: string | null;
  }): Bucket {
    const existing = buckets.get(row.contactId);
    if (existing) return existing;
    const fresh: Bucket = {
      contactId: row.contactId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone ?? "",
      title: row.title,
      companyId: row.companyId,
      signals: [],
    };
    buckets.set(row.contactId, fresh);
    return fresh;
  }

  for (const r of emailRows) {
    const b = getOrInit(r);
    if (r.openedAt && r.openedAt >= since) {
      b.signals.push({
        kind: "open",
        at: r.openedAt,
        detail: r.subject ?? undefined,
      });
    }
    if (r.clickedAt && r.clickedAt >= since) {
      b.signals.push({
        kind: "click",
        at: r.clickedAt,
        detail: r.subject ?? undefined,
      });
    }
  }
  for (const r of visitRows) {
    const b = getOrInit(r);
    b.signals.push({
      kind: "visit",
      at: r.visitedAt,
      detail: r.visitUrl ?? undefined,
    });
  }

  // 4. Resolve companies in one batch query to avoid N+1.
  const companyIds = Array.from(
    new Set(
      Array.from(buckets.values())
        .map((b) => b.companyId)
        .filter((id): id is string => id !== null),
    ),
  );
  const companyMap = new Map<
    string,
    { name: string | null; domain: string | null }
  >();
  if (companyIds.length > 0) {
    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
      })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, authCtx.tenantId),
          isNull(companies.deletedAt),
        ),
      );
    for (const c of rows) {
      companyMap.set(c.id, { name: c.name, domain: c.domain });
    }
  }

  // 5. Score + rank + truncate.
  const scored = Array.from(buckets.values()).map((b) => {
    const hotness = computeHotness(b.signals, now);
    const headline = pickHeadlineSignal(b.signals, now);
    const mostRecent = b.signals.reduce<Date | null>(
      (acc, s) => (acc === null || s.at > acc ? s.at : acc),
      null,
    );
    return { bucket: b, hotness, headline, mostRecent };
  });

  const ranked = rankContacts(
    scored
      .filter((s) => s.hotness > 0 && s.mostRecent !== null && s.headline !== null)
      .map((s) => ({
        contactId: s.bucket.contactId,
        hotness: s.hotness,
        mostRecentSignalAt: s.mostRecent as Date,
        scored: s,
      })),
  ).slice(0, limit);

  const items: HotToCallItem[] = ranked.map(({ scored: s }) => {
    const b = s.bucket;
    const headline = s.headline as HotSignal;
    const company = b.companyId ? companyMap.get(b.companyId) : null;
    return {
      contactId: b.contactId,
      name:
        [b.firstName, b.lastName].filter(Boolean).join(" ") ||
        b.email ||
        "Unknown",
      email: b.email,
      phone: b.phone,
      title: b.title,
      companyId: b.companyId,
      companyName: company?.name ?? null,
      companyDomain: company?.domain ?? null,
      hotness: Math.round(s.hotness * 10) / 10,
      isSpeedWindow: isInSpeedWindow(headline.at, now),
      lastSignal: {
        kind: headline.kind,
        at: headline.at.toISOString(),
        minutesAgo: minutesAgo(headline.at, now),
        detail: headline.detail ?? null,
      },
      signals: b.signals
        .slice()
        .sort((a, z) => z.at.getTime() - a.at.getTime())
        .slice(0, 20)
        .map((sig) => ({
          kind: sig.kind,
          at: sig.at.toISOString(),
          detail: sig.detail ?? null,
        })),
    };
  });

  return Response.json({
    items,
    windowHours: hours,
    generatedAt: now.toISOString(),
  } satisfies HotToCallResponse);
}
