/**
 * TAM proposal queue — create / list / apply.
 *
 * The living-TAM loops (icp/source-tenant, tam.refresh.daily) enqueue
 * proposals via `proposeTamChange`; the founder approves them in the
 * review surface, which calls `decideProposals`. Approving an "add"
 * inserts the company and fires enrichment; "refresh" forces re-
 * enrichment of a stale row; "exclude" marks a row not-a-fit. Nothing
 * here spends credits until approved — the approval-queue posture.
 */
import { db } from "@/db";
import { tamProposals, companies } from "@/db/schema";
import { and, eq, inArray, desc, isNull, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { resolveDomain } from "@/lib/discovery/resolve-domain";

export type TamProposalKind = "add" | "refresh" | "exclude";
export type TamProposalRow = typeof tamProposals.$inferSelect;

export interface ProposeInput {
  tenantId: string;
  kind: TamProposalKind;
  dedupKey?: string | null;
  entityType?: "company" | "contact" | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  summary?: string | null;
  reason?: string | null;
  source?: string | null;
  score?: number | null;
}

/**
 * Queue a proposal unless an open (pending) one with the same
 * (tenant, kind, dedupKey) already exists — idempotent so the loops can
 * run repeatedly without flooding the queue. Returns whether it created.
 */
export async function proposeTamChange(
  input: ProposeInput,
): Promise<{ created: boolean; id?: string }> {
  if (input.dedupKey) {
    const [dupe] = await db
      .select({ id: tamProposals.id })
      .from(tamProposals)
      .where(
        and(
          eq(tamProposals.tenantId, input.tenantId),
          eq(tamProposals.kind, input.kind),
          eq(tamProposals.dedupKey, input.dedupKey),
          eq(tamProposals.status, "pending"),
        ),
      )
      .limit(1);
    if (dupe) return { created: false, id: dupe.id };
  }

  const [row] = await db
    .insert(tamProposals)
    .values({
      tenantId: input.tenantId,
      kind: input.kind,
      dedupKey: input.dedupKey ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload ?? {},
      summary: input.summary ?? null,
      reason: input.reason ?? null,
      source: input.source ?? null,
      score: input.score ?? null,
    })
    .returning({ id: tamProposals.id });
  return { created: true, id: row.id };
}

/**
 * Apply one approved proposal. Pure side-effect + result; the caller
 * records status. Never throws — failures come back as { ok:false }.
 */
export async function applyProposal(
  p: TamProposalRow,
): Promise<{ ok: boolean; appliedEntityId?: string; error?: string }> {
  try {
    const payload = (p.payload ?? {}) as Record<string, unknown>;

    if (p.kind === "add") {
      const name =
        (payload.name as string) || (payload.domain as string) || "";
      if (!name) return { ok: false, error: "add proposal missing name/domain" };
      // Domain-resolution bridge: domainless registry candidates (SIRENE)
      // get a domain here, at approval time (Pappers fiche-by-SIREN). null
      // when unresolved — the row is inserted identity-only with its SIREN.
      let domain: string | null = (payload.domain as string) ?? null;
      if (!domain) {
        domain = await resolveDomain({ siren: (payload.siren as string) ?? null });
      }
      // Don't double-insert a domain already in the TAM.
      if (domain) {
        const [dupe] = await db
          .select({ id: companies.id })
          .from(companies)
          .where(
            and(
              eq(companies.tenantId, p.tenantId),
              eq(companies.domain, domain),
              isNull(companies.deletedAt),
            ),
          )
          .limit(1);
        if (dupe) return { ok: true, appliedEntityId: dupe.id };
      }
      const [row] = await db
        .insert(companies)
        .values({
          tenantId: p.tenantId,
          name,
          domain,
          industry: (payload.industry as string) ?? null,
          size: (payload.size as string) ?? null,
          sourceSystem: (payload.source as string) ?? p.source ?? "discovery",
          properties: {
            ...((payload.properties as Record<string, unknown>) ?? {}),
            source: "tam",
            proposed_from: p.source ?? null,
          },
        })
        .returning({ id: companies.id });
      // Enrichment is domain-keyed — fire only when we have a domain.
      if (domain) {
        await inngest
          .send({
            name: "company/created",
            data: { companyId: row.id, tenantId: p.tenantId },
          })
          .catch(() => {});
      }
      return { ok: true, appliedEntityId: row.id };
    }

    if (p.kind === "refresh") {
      if (!p.entityId) return { ok: false, error: "refresh proposal missing entityId" };
      const isContact = p.entityType === "contact";
      const table = isContact ? "contacts" : "companies";
      // Clear the enrichment_source marker so the enrich function's
      // "already enriched" guard doesn't no-op the deliberate refresh.
      await db.execute(
        sql`UPDATE ${sql.identifier(table)}
            SET properties = (COALESCE(properties, '{}'::jsonb)) - 'enrichment_source',
                updated_at = now()
            WHERE id = ${p.entityId} AND tenant_id = ${p.tenantId}`,
      );
      await inngest
        .send(
          isContact
            ? { name: "contact/created", data: { contactId: p.entityId, tenantId: p.tenantId } }
            : { name: "company/created", data: { companyId: p.entityId, tenantId: p.tenantId } },
        )
        .catch(() => {});
      return { ok: true, appliedEntityId: p.entityId };
    }

    if (p.kind === "exclude") {
      if (!p.entityId) return { ok: false, error: "exclude proposal missing entityId" };
      const reason = (payload.reason as string) || "anti_icp";
      await db
        .update(companies)
        .set({ excludedReason: reason, excludedAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(eq(companies.id, p.entityId), eq(companies.tenantId, p.tenantId)));
      return { ok: true, appliedEntityId: p.entityId };
    }

    return { ok: false, error: `unknown proposal kind: ${p.kind}` };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "apply failed" };
  }
}

/** Approve (apply) or reject pending proposals, single or in bulk. */
export async function decideProposals(args: {
  tenantId: string;
  userId: string;
  ids?: string[];
  all?: boolean;
  action: "approve" | "reject";
}): Promise<{ approved: number; rejected: number; failed: number }> {
  const rows = await db
    .select()
    .from(tamProposals)
    .where(
      and(
        eq(tamProposals.tenantId, args.tenantId),
        eq(tamProposals.status, "pending"),
        args.all ? undefined : inArray(tamProposals.id, args.ids ?? []),
      ),
    );

  let approved = 0;
  let rejected = 0;
  let failed = 0;

  for (const p of rows) {
    if (args.action === "reject") {
      await db
        .update(tamProposals)
        .set({ status: "rejected", reviewedByUserId: args.userId, reviewedAt: sql`now()` })
        .where(eq(tamProposals.id, p.id));
      rejected++;
      continue;
    }

    const res = await applyProposal(p);
    await db
      .update(tamProposals)
      .set({
        status: res.ok ? "applied" : "failed",
        appliedEntityId: res.appliedEntityId ?? null,
        reviewedByUserId: args.userId,
        reviewedAt: sql`now()`,
      })
      .where(eq(tamProposals.id, p.id));
    if (res.ok) approved++;
    else failed++;
  }

  return { approved, rejected, failed };
}

/** List proposals (default: pending) newest-first, plus per-status counts. */
export async function listProposals(
  tenantId: string,
  opts: { status?: string; kind?: string; limit?: number } = {},
): Promise<{ proposals: TamProposalRow[]; counts: Record<string, number> }> {
  const proposals = await db
    .select()
    .from(tamProposals)
    .where(
      and(
        eq(tamProposals.tenantId, tenantId),
        eq(tamProposals.status, opts.status ?? "pending"),
        opts.kind ? eq(tamProposals.kind, opts.kind) : undefined,
      ),
    )
    .orderBy(desc(tamProposals.createdAt))
    .limit(opts.limit ?? 100);

  const countRows = await db
    .select({ status: tamProposals.status, n: sql<number>`count(*)::int` })
    .from(tamProposals)
    .where(eq(tamProposals.tenantId, tenantId))
    .groupBy(tamProposals.status);
  const counts: Record<string, number> = {};
  for (const r of countRows) counts[r.status] = r.n;

  return { proposals, counts };
}
