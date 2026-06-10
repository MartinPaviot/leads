/**
 * Prospect brief — IO orchestrator.
 *
 * Builds (or serves from cache) the Call Mode pre-call brief for a contact:
 *  - person half: deterministic career timeline from one Apollo people/match
 *    (no reveal flags — career data only, 1 credit, cached) + a 1-2 sentence
 *    grounded LLM background;
 *  - company half: the company's REAL homepage text (tech-detect fetcher,
 *    keyless) summarised by the same single LLM call, + the verbatim meta
 *    description as a deterministic fallback.
 *
 * Every external step is fail-soft (null), the LLM text is fail-closed
 * (validateBriefTexts: empty over invented). Caches live in jsonb:
 * contacts.properties.brief / companies.properties.webBrief; failed lookups
 * are cached on a short TTL so a dead site or an unmatched person doesn't
 * re-fire on every fiche open, but recovers quickly.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import {
  enrichPerson,
  isApolloAvailable,
  type ApolloPerson,
} from "@/lib/integrations/apollo-client";
import { fetchSiteSignals, toHomepageUrl } from "@/lib/tech-detect/fetch";
import { getModelForTask } from "@/lib/ai/ai-provider";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import logger from "@/lib/observability/logger";
import {
  BRIEF_TTL_DAYS,
  buildCareerTimeline,
  careerEntryLabel,
  extractWebsiteText,
  isFresh,
  validateBriefTexts,
  type CompanyWebBriefData,
  type PersonBriefData,
  type ProspectBriefPayload,
} from "./prospect-brief-core";

/** Failed/empty lookups retry after a day instead of locking in for 30. */
const EMPTY_TTL_DAYS = 1;

type PersonBriefCache = PersonBriefData & { v: 1 };
type CompanyWebBriefCache = CompanyWebBriefData & { v: 1 };

const briefLlmSchema = z.object({
  personBackground: z
    .string()
    .describe(
      "1 à 2 phrases factuelles en français sur le parcours du prospect (postes, employeurs, années), UNIQUEMENT à partir des données fournies. Aucun sigle non développé. Chaîne vide si les données sont insuffisantes.",
    ),
  companySummary: z
    .string()
    .describe(
      "2 à 3 phrases factuelles en français sur ce que fait l'entreprise d'après le texte de SON site (activité, offre, clients/secteurs). Aucun sigle non développé. Chaîne vide si le texte est insuffisant.",
    ),
});

// ── Apollo person match (career data only — no reveal flags) ─────

async function matchPerson(contact: {
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
  companyDomain: string | null;
  companyName: string | null;
}): Promise<ApolloPerson | null> {
  if (!isApolloAvailable()) return null;

  // Most precise key first; each fallback needs a real name to match on.
  const hasName = Boolean(contact.firstName && contact.lastName);
  const keys = contact.linkedinUrl
    ? { linkedin_url: contact.linkedinUrl }
    : hasName && contact.companyDomain
      ? {
          first_name: contact.firstName!,
          last_name: contact.lastName!,
          domain: contact.companyDomain,
        }
      : hasName && contact.companyName
        ? {
            first_name: contact.firstName!,
            last_name: contact.lastName!,
            organization_name: contact.companyName,
          }
        : null;
  if (!keys) return null;

  try {
    return await enrichPerson(keys);
  } catch (err) {
    logger.warn("[prospect-brief] Apollo person match failed", {
      error: String(err),
    });
    return null;
  }
}

// ── LLM synthesis (one call for both halves, fail-closed) ───────

async function synthesize(
  input: {
    contactName: string;
    crmTitle: string | null;
    headline: string | null;
    careerLines: string[];
    companyName: string | null;
    siteUrl: string | null;
    siteTitle: string | null;
    siteMetaDescription: string | null;
    siteText: string;
  },
  tenantId: string,
): Promise<{ personBackground: string; companySummary: string } | null> {
  const model = getModelForTask("lightweight");
  if (!model) return null;

  const personBlock =
    [
      `- Nom : ${input.contactName || "(inconnu)"}`,
      input.crmTitle ? `- Poste actuel (CRM) : ${input.crmTitle}` : null,
      input.headline ? `- Headline LinkedIn : ${input.headline}` : null,
      input.careerLines.length > 0
        ? `- Parcours :\n${input.careerLines.map((l) => `  - ${l}`).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n") || "(aucune donnée)";

  const companyBlock = input.siteText
    ? [
        input.siteTitle ? `Titre de la page : ${input.siteTitle}` : null,
        input.siteMetaDescription
          ? `Meta description : ${input.siteMetaDescription}`
          : null,
        `Texte visible : ${input.siteText}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "(site indisponible)";

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: briefLlmSchema,
      prompt: `Tu prépares un commercial avant un appel à froid. Réponds en français, faits uniquement — aucune invention, aucun superlatif, aucun conseil de vente. Chaque affirmation doit être traçable aux données ci-dessous ; si une section manque de données, renvoie une chaîne vide pour ce champ.
Écris les sigles et acronymes en toutes lettres — le lecteur ne connaît pas le jargon du secteur (« l'assurance-invalidité », pas « l'AI » ; « petites et moyennes entreprises », pas « PME »). Si le sigle est utile, mets-le entre parenthèses après la forme complète. Les noms propres (entreprises, produits) restent tels quels.

PROSPECT (CRM + Apollo) :
${personBlock}

ENTREPRISE ${input.companyName ? `(${input.companyName}) ` : ""}— texte extrait de ${input.siteUrl ?? "son site"} :
${companyBlock}`,
      _trace: {
        agentId: "prospect-brief",
        tenantId,
        inputPreview: `Brief ${input.contactName} @ ${input.companyName ?? "?"}`,
      },
    });
    return object;
  } catch (err) {
    logger.warn("[prospect-brief] LLM synthesis failed", { error: String(err) });
    return null;
  }
}

// ── Main builder ─────────────────────────────────────────────────

/** Per-instance in-flight dedupe: StrictMode double-effects and rapid
 *  re-selects share one build instead of double-spending Apollo/LLM. */
const inflight = new Map<string, Promise<ProspectBriefPayload | null>>();

export async function getProspectBrief(
  contactId: string,
  tenantId: string,
): Promise<ProspectBriefPayload | null> {
  const key = `${tenantId}:${contactId}`;
  const running = inflight.get(key);
  if (running) return running;

  const p = buildProspectBrief(contactId, tenantId).finally(() =>
    inflight.delete(key),
  );
  inflight.set(key, p);
  return p;
}

async function buildProspectBrief(
  contactId: string,
  tenantId: string,
): Promise<ProspectBriefPayload | null> {
  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      linkedinUrl: contacts.linkedinUrl,
      companyId: contacts.companyId,
      properties: contacts.properties,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.tenantId, tenantId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact) return null;

  let company: {
    id: string;
    name: string | null;
    domain: string | null;
    properties: unknown;
  } | null = null;
  if (contact.companyId) {
    const [co] = await db
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
        properties: companies.properties,
      })
      .from(companies)
      .where(
        and(
          eq(companies.id, contact.companyId),
          eq(companies.tenantId, tenantId),
          isNull(companies.deletedAt),
        ),
      )
      .limit(1);
    company = co ?? null;
  }

  const contactProps = (contact.properties ?? {}) as Record<string, unknown>;
  const companyProps = (company?.properties ?? {}) as Record<string, unknown>;
  const cachedPerson = (contactProps.brief ?? null) as PersonBriefCache | null;
  const cachedCompany = (companyProps.webBrief ?? null) as CompanyWebBriefCache | null;

  // Empty results retry daily; real data holds for the full TTL.
  const personFresh =
    cachedPerson != null &&
    isFresh(
      cachedPerson.generatedAt,
      cachedPerson.source === "apollo" ? BRIEF_TTL_DAYS : EMPTY_TTL_DAYS,
    );
  const companyFresh =
    cachedCompany != null &&
    isFresh(
      cachedCompany.generatedAt,
      cachedCompany.summary || cachedCompany.metaDescription
        ? BRIEF_TTL_DAYS
        : EMPTY_TTL_DAYS,
    );
  // A contact with no company never gets a company half — don't rebuild
  // the person half daily chasing one.
  const companySettled = companyFresh || !company?.domain;

  if (personFresh && companySettled) {
    return {
      person: stripCache(cachedPerson),
      company: cachedCompany ? stripCache(cachedCompany) : null,
    };
  }

  // ── Rebuild ────────────────────────────────────────────────────
  const contactName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();

  // A fresh person half is reused as-is — no Apollo re-match just because
  // the company half (e.g. a slow/dead site) needs another pass.
  const [person, site] = await Promise.all([
    personFresh
      ? Promise.resolve(null)
      : matchPerson({
          firstName: contact.firstName,
          lastName: contact.lastName,
          linkedinUrl: contact.linkedinUrl,
          companyDomain: company?.domain ?? null,
          companyName: company?.name ?? null,
        }),
    // Swiss SMB homepages routinely take 8-12 s to first byte; the build is
    // async behind a skeleton and cached 30 d, so a generous timeout beats
    // a false "site injoignable".
    company?.domain
      ? fetchSiteSignals(company.domain, { timeoutMs: 15_000 })
      : Promise.resolve(null),
  ]);

  const career = personFresh
    ? cachedPerson!.career
    : buildCareerTimeline(person?.employment_history);
  const headline = personFresh
    ? cachedPerson!.headline
    : (person?.headline ?? "").trim() || null;
  const linkedinUrl =
    contact.linkedinUrl ||
    (personFresh ? cachedPerson!.linkedinUrl : person?.linkedin_url) ||
    null;
  const siteUrl = company?.domain ? toHomepageUrl(company.domain) : null;
  const extracted = site ? extractWebsiteText(site.html) : null;

  const hasPersonInputs = career.length > 0 || Boolean(headline) || Boolean(contact.title);
  const siteText = extracted?.text ?? "";

  const llm =
    hasPersonInputs || siteText.length > 0
      ? await synthesize(
          {
            contactName,
            crmTitle: contact.title,
            headline,
            careerLines: career.map(careerEntryLabel),
            companyName: company?.name ?? null,
            siteUrl,
            siteTitle: extracted?.title ?? null,
            siteMetaDescription: extracted?.metaDescription ?? null,
            siteText,
          },
          tenantId,
        )
      : null;

  const validated = validateBriefTexts(llm ?? {}, {
    hasPersonInputs,
    siteTextChars: siteText.length,
  });

  const now = new Date().toISOString();
  const personBrief: PersonBriefCache = {
    v: 1,
    background: validated.background ?? (personFresh ? cachedPerson!.background : null),
    headline,
    career,
    linkedinUrl,
    source: personFresh ? cachedPerson!.source : person ? "apollo" : "crm",
    generatedAt: now,
  };
  const companyBrief: CompanyWebBriefCache | null = company?.domain
    ? {
        v: 1,
        summary: validated.summary,
        metaDescription: extracted?.metaDescription ?? null,
        url: siteUrl,
        generatedAt: now,
      }
    : null;

  await persist(contact.id, tenantId, personBrief, {
    // Backfill the real column when Apollo discovered the profile.
    linkedinUrl: !contact.linkedinUrl && person?.linkedin_url ? person.linkedin_url : null,
  });
  if (company && companyBrief) {
    await persistCompany(company.id, tenantId, companyBrief);
  }

  return {
    person: stripCache(personBrief),
    company: companyBrief
      ? stripCache(companyBrief)
      : cachedCompany
        ? stripCache(cachedCompany)
        : null,
  };
}

function stripCache<T extends { v: 1 }>(cache: T): Omit<T, "v"> {
  const { v: _v, ...data } = cache;
  return data;
}

async function persist(
  contactId: string,
  tenantId: string,
  brief: PersonBriefCache,
  extra: { linkedinUrl: string | null },
): Promise<void> {
  try {
    await db
      .update(contacts)
      .set({
        // `||` merge (not jsonb_set) so a missing properties bag can't
        // silently no-op, and sibling keys are preserved.
        properties: sql`coalesce(${contacts.properties}, '{}'::jsonb) || ${JSON.stringify({ brief })}::jsonb`,
        ...(extra.linkedinUrl ? { linkedinUrl: extra.linkedinUrl } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)));
  } catch (err) {
    logger.warn("[prospect-brief] failed to cache person brief", {
      error: String(err),
    });
  }
}

async function persistCompany(
  companyId: string,
  tenantId: string,
  webBrief: CompanyWebBriefCache,
): Promise<void> {
  try {
    await db
      .update(companies)
      .set({
        properties: sql`coalesce(${companies.properties}, '{}'::jsonb) || ${JSON.stringify({ webBrief })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId)));
  } catch (err) {
    logger.warn("[prospect-brief] failed to cache company web brief", {
      error: String(err),
    });
  }
}
