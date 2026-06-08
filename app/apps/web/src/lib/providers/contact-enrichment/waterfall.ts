/**
 * Contact-enrichment waterfall. Geo-routes the prospect to the vendor
 * with the best mobile coverage for their country, runs providers by
 * (geo-boosted) priority, merges results, and stops as soon as we have
 * a reachable mobile + a usable email.
 *
 * Graceful degradation: providers whose env key is missing report
 * isAvailable()=false and are skipped, so with only APOLLO_API_KEY set
 * the waterfall behaves exactly like today (Apollo-only) — adding
 * KASPR_API_KEY / LUSHA_API_KEY lights up FR/CH mobile fill with no
 * other change.
 */

import {
  type ContactEnrichInput,
  type ContactEnrichResult,
  type ContactEnrichmentProvider,
  type ContactProviderContext,
  type ContactWaterfallResult,
  type EnrichedContact,
  type EnrichedPhone,
  type EmailStatus,
  deriveContactGeo,
  emptyContact,
} from "./types";
import {
  ensureContactDefaultsLoaded,
  listAvailableContactProviders,
} from "./registry";
import { enrichPerson } from "@/lib/integrations/apollo-client";

const EMAIL_RANK: Record<EmailStatus, number> = {
  verified: 3,
  likely: 2,
  unverified: 1,
};

/** Normalize a phone for dedup: keep a leading +, drop all other non-digits. */
function phoneKey(n: string): string {
  const plus = n.trim().startsWith("+") ? "+" : "";
  return plus + n.replace(/\D/g, "");
}

function mergePhones(acc: EnrichedPhone[], incoming: EnrichedPhone[]): void {
  const seen = new Set(acc.map((p) => phoneKey(p.number)));
  for (const p of incoming) {
    if (!p?.number) continue;
    const k = phoneKey(p.number);
    if (k === "" || seen.has(k)) continue;
    seen.add(k);
    acc.push(p);
  }
}

/** A reachable mobile + a usable email = stop calling vendors. */
function saturated(c: EnrichedContact): boolean {
  return Boolean(c.mobilePhone) && Boolean(c.email) && c.emailStatus !== "unverified";
}

function mergeInto(
  acc: EnrichedContact,
  data: Partial<EnrichedContact>,
  provider: string,
): void {
  // Email — keep the highest-confidence one seen so far.
  if (data.email) {
    const incomingRank = EMAIL_RANK[data.emailStatus ?? "unverified"];
    const currentRank = acc.email ? EMAIL_RANK[acc.emailStatus ?? "unverified"] : 0;
    if (incomingRank > currentRank) {
      acc.email = data.email;
      acc.emailStatus = data.emailStatus ?? "unverified";
    }
  }

  // Phones — union, then re-derive best mobile/direct in provider order.
  if (data.phones?.length) {
    mergePhones(acc.phones, data.phones.map((p) => ({ ...p, source: p.source ?? provider })));
  }
  // A provider may also hand us pre-classified single numbers.
  if (data.mobilePhone) {
    mergePhones(acc.phones, [{ number: data.mobilePhone, type: "mobile", source: provider }]);
  }
  if (data.directPhone) {
    mergePhones(acc.phones, [{ number: data.directPhone, type: "direct", source: provider }]);
  }
  acc.mobilePhone = acc.phones.find((p) => p.type === "mobile")?.number ?? acc.mobilePhone;
  acc.directPhone =
    acc.phones.find((p) => p.type === "direct" || p.type === "work")?.number ?? acc.directPhone;

  // First non-null wins for these.
  acc.firstName ??= data.firstName ?? null;
  acc.lastName ??= data.lastName ?? null;
  acc.linkedinUrl ??= data.linkedinUrl ?? null;
  acc.title ??= data.title ?? null;
  acc.seniority ??= data.seniority ?? null;

  if (data.raw) {
    acc.raw = { ...(acc.raw ?? {}), [provider]: data.raw };
  }
}

/** Geo-boosted ordering: a provider whose geoAffinity includes the
 * prospect geo runs before geo-neutral ones (subtract 100 from its
 * priority). Otherwise plain priority order. */
function orderProviders(
  providers: ContactEnrichmentProvider[],
  geo: ContactEnrichInput["geo"],
): ContactEnrichmentProvider[] {
  return [...providers].sort((a, b) => {
    const ap = geo && a.geoAffinity?.includes(geo) ? a.priority - 100 : a.priority;
    const bp = geo && b.geoAffinity?.includes(geo) ? b.priority - 100 : b.priority;
    return ap - bp;
  });
}

export async function enrichContact(
  input: ContactEnrichInput,
  ctx: ContactProviderContext,
): Promise<ContactWaterfallResult> {
  await ensureContactDefaultsLoaded();

  const acc = emptyContact();
  let resolved = input;

  // Identity pre-resolution: with an Apollo person id we reveal last_name +
  // linkedin_url + verified email ONCE up front (Apollo *search* returns those
  // masked). Phone vendors key on linkedin/name, and for CH Lusha runs before
  // Apollo — so an in-loop Apollo reveal would arrive too late. We resolve here,
  // then skip the Apollo provider in the loop to avoid paying for a 2nd reveal.
  if (input.apolloId) {
    try {
      const person = await enrichPerson({ id: input.apolloId, reveal_personal_emails: true });
      if (person) {
        const status: EmailStatus | null =
          person.email_status === "verified" ? "verified"
          : person.email_status === "likely" ? "likely"
          : person.email ? "unverified" : null;
        const phones: EnrichedPhone[] = (person.phone_numbers ?? [])
          .filter((p) => p.raw_number)
          .map((p): EnrichedPhone => ({
            number: p.raw_number,
            type: /mobile|cell/i.test(p.type) ? "mobile" : /work|direct|corporate/i.test(p.type) ? "direct" : "other",
            source: "apollo",
          }));
        mergeInto(acc, {
          firstName: person.first_name ?? null,
          lastName: person.last_name ?? null,
          email: person.email ?? null,
          emailStatus: status,
          linkedinUrl: person.linkedin_url ?? null,
          title: person.title ?? null,
          seniority: person.seniority ?? null,
          phones,
          raw: person as unknown as Record<string, unknown>,
        }, "apollo");
        resolved = {
          ...input,
          firstName: input.firstName ?? person.first_name ?? undefined,
          lastName: input.lastName ?? person.last_name ?? undefined,
          linkedinUrl: input.linkedinUrl ?? person.linkedin_url ?? undefined,
          email: input.email ?? person.email ?? undefined,
        };
      }
    } catch {
      // reveal failed — fall through to the normal provider loop
    }
  }

  const geo = deriveContactGeo(resolved);
  // When we already revealed via Apollo by id, drop the Apollo provider so we
  // don't pay for a second (weaker) name+domain match.
  const providers = orderProviders(listAvailableContactProviders(), geo)
    .filter((p) => !(input.apolloId && p.name === "apollo"));

  const attempts: ContactEnrichResult[] = [];
  let totalCostCents = 0;

  for (const provider of providers) {
    if (saturated(acc)) break;
    let result: ContactEnrichResult;
    try {
      result = await provider.enrich({ ...resolved, geo }, ctx);
    } catch (err) {
      result = {
        ok: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        provider: provider.name,
        durationMs: 0,
        costCents: 0,
      };
    }
    attempts.push(result);
    totalCostCents += result.costCents;
    if (result.ok && result.data) mergeInto(acc, result.data, provider.name);
  }

  const enriched =
    Boolean(acc.email) || acc.phones.length > 0 || Boolean(acc.linkedinUrl);

  return { data: acc, attempts, totalCostCents, enriched };
}
