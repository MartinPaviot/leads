/**
 * Server-grounded evidence for the per-prospect script generation (Étape D).
 *
 * Rebuilds, from the DATABASE (not the client), the small set of facts the
 * generator may cite for THIS prospect: a voiceable live signal, hiring roles,
 * a dated funding round, and the catalog-replaceable tools actually detected.
 * Each fact carries a stable id (E1..En) — the generation contract is that any
 * prospect-specific enjeu MUST cite one of these ids, and uncited claims are
 * dropped (fail-closed) in tenant-script.ts.
 *
 * The mapping props → evidence is pure (`evidenceFromProps`, unit-tested);
 * `buildEvidenceForContact` is the thin tenant-scoped DB wrapper.
 */

import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isVoiceableSignal, mergeTechStacks } from "./live-script";
import { pickReplaceableTools } from "@/lib/tech-detect/replaceable";

export interface GenEvidenceItem {
  /** Stable citation id within one generation ("E1"…). */
  id: string;
  kind: "signal" | "hiring" | "funding" | "tool";
  /** The human fact, ready to be cited and phrased. */
  fact: string;
}

interface ContactProps {
  latestSignal?: { type: string; label: string } | null;
}
interface CompanyProps {
  technologies?: unknown;
  dossier?: {
    techStack?: string[] | null;
    hiringSignals?: Array<{ role: string }> | null;
    funding?: { lastRound?: string | null; date?: string | null } | null;
  } | null;
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

/** Pure: contact + company properties → citable evidence (ids E1..En). */
export function evidenceFromProps(
  contactProps: ContactProps | null | undefined,
  companyProps: CompanyProps | null | undefined,
): GenEvidenceItem[] {
  const out: GenEvidenceItem[] = [];
  let n = 0;
  const push = (kind: GenEvidenceItem["kind"], fact: string) => {
    const f = fact.replace(/\s+/g, " ").trim();
    if (f) out.push({ id: `E${++n}`, kind, fact: f });
  };

  const sig = contactProps?.latestSignal;
  if (sig && isVoiceableSignal(sig.type) && sig.label?.trim()) {
    push("signal", `Signal récent : ${sig.label}`);
  }

  const dossier = companyProps?.dossier ?? null;
  for (const h of (dossier?.hiringSignals ?? []).slice(0, 2)) {
    if (h?.role?.trim()) push("hiring", `Recrute ${h.role}`);
  }

  const round = dossier?.funding?.lastRound?.trim();
  if (round) {
    const date = dossier?.funding?.date?.trim();
    const dated = date && date.toLowerCase() !== "unknown" && !round.includes(date) ? `${round} (${date})` : round;
    push("funding", `Levée de fonds : ${dated}`);
  }

  const tools = pickReplaceableTools(mergeTechStacks(dossier?.techStack, strArr(companyProps?.technologies)));
  for (const t of tools.slice(0, 3)) push("tool", `Outil en place : ${t}`);

  return out;
}

/** Tenant-scoped DB wrapper. Empty array when the contact is unknown. */
export async function buildEvidenceForContact(
  tenantId: string,
  contactId: string,
): Promise<GenEvidenceItem[]> {
  const [row] = await db
    .select({ cProps: contacts.properties, coProps: companies.properties })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!row) return [];
  return evidenceFromProps(
    (row.cProps ?? {}) as ContactProps,
    (row.coProps ?? {}) as CompanyProps,
  );
}
