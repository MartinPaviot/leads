/**
 * Verify call-list prospects' roles against their live LinkedIn profile.
 *
 * Fired by the call-list cron with the day's contactIds. Gated on
 * `APIFY_TOKEN` — a no-op until the token is set. For each contact with a
 * LinkedIn URL not verified within the TTL, read the profile, compare the
 * current position to the company on file, and store the result:
 *   confirmed → properties.roleVerification (the fiche shows the verified role)
 *   left      → also set roleObsoleteAt, dropping them from call lists
 * Cost-capped per run; the TTL cache avoids re-paying for recent checks.
 */
import { inngest } from "./client";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  fetchLinkedInProfileByUrl,
  isApifyConfigured,
} from "@/lib/linkedin/apify-profile";
import { compareRole } from "@/lib/linkedin/verify-role";
import {
  isVerificationFresh,
  withRoleVerification,
  ROLE_OBSOLETE_KEY,
  type RoleVerification,
} from "@/lib/contacts/role-status";

const VERIFY_TTL_DAYS = 14;
const MAX_PER_RUN = 40;

export const verifyCallListRoles = inngest.createFunction(
  {
    id: "verify-call-list-roles",
    name: "Verify call-list roles on LinkedIn",
    retries: 1,
    concurrency: [{ limit: 1, key: "event.data.tenantId" }],
    triggers: [{ event: "call-list/verify-roles" }],
  },
  async ({ event, step }) => {
    if (!isApifyConfigured()) {
      return { skipped: true, reason: "APIFY_TOKEN not set" };
    }
    const { tenantId, contactIds } = event.data as {
      tenantId: string;
      contactIds?: string[];
    };
    if (!tenantId || !Array.isArray(contactIds) || contactIds.length === 0) {
      return { skipped: true, reason: "no contactIds" };
    }

    // Candidates: on the list, have a LinkedIn URL, not verified recently.
    const candidates = await step.run("load-candidates", async () => {
      const rows = await db
        .select({
          id: contacts.id,
          linkedinUrl: contacts.linkedinUrl,
          properties: contacts.properties,
          companyName: companies.name,
        })
        .from(contacts)
        .leftJoin(companies, eq(companies.id, contacts.companyId))
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            isNull(contacts.deletedAt),
            inArray(contacts.id, contactIds),
            isNotNull(contacts.linkedinUrl),
          ),
        );
      return rows
        .filter((r) => (r.linkedinUrl ?? "").trim().length > 0)
        .filter((r) => !isVerificationFresh(r.properties as Record<string, unknown>, VERIFY_TTL_DAYS))
        .slice(0, MAX_PER_RUN);
    });

    let confirmed = 0;
    let left = 0;
    let unknown = 0;

    for (const c of candidates) {
      // One step per contact: fetch + compare + persist. Idempotent enough to
      // replay; sequential to respect the scraper's rate limits.
      const status = await step.run(`verify-${c.id}`, async () => {
        const profile = await fetchLinkedInProfileByUrl(c.linkedinUrl!);
        if (!profile) return "unknown";
        const result = compareRole({ storedCompany: c.companyName }, profile);
        if (result.status === "unknown") return "unknown";

        // Re-read properties to avoid clobbering a concurrent write.
        const [fresh] = await db
          .select({ properties: contacts.properties })
          .from(contacts)
          .where(and(eq(contacts.id, c.id), eq(contacts.tenantId, tenantId)))
          .limit(1);
        const props = (fresh?.properties ?? {}) as Record<string, unknown>;

        const v: RoleVerification = {
          at: new Date().toISOString(),
          status: result.status,
          title: result.title ?? null,
          company: result.company ?? null,
        };
        let next = withRoleVerification(props, v);
        if (result.status === "left") {
          next = { ...next, [ROLE_OBSOLETE_KEY]: new Date().toISOString() };
        }
        await db
          .update(contacts)
          .set({ properties: next, updatedAt: new Date() })
          .where(and(eq(contacts.id, c.id), eq(contacts.tenantId, tenantId)));
        return result.status;
      });

      if (status === "confirmed") confirmed++;
      else if (status === "left") left++;
      else unknown++;
    }

    return { skipped: false, candidates: candidates.length, confirmed, left, unknown };
  },
);
