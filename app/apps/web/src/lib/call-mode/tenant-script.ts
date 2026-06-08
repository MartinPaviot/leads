/**
 * Per-tenant call script: load (persisted or default), generate (LLM from the
 * tenant's product + ICP), and upsert (rep edits). Keeps the hardcoded content
 * out of the cockpit — `lib/call-mode/call-scripts.ts` stays pure and only
 * supplies the editable DEFAULTS this layer falls back to.
 */

import { db } from "@/db";
import { callScripts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { defaultScriptFields, type ScriptFields } from "./call-scripts";

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export interface StoredScript extends ScriptFields {
  sector: string;
  origin: string;
}

/**
 * The script in effect for a (tenant, sector): an exact sector variant if one
 * exists, else the tenant default ('' sector), else the code defaults seeded
 * with the best sector match. Never throws — the cockpit always gets a script.
 */
export async function loadTenantScript(tenantId: string, sector?: string | null): Promise<StoredScript> {
  const key = norm(sector);
  const rows = await db.select().from(callScripts).where(eq(callScripts.tenantId, tenantId));
  const exact = key ? rows.find((r) => r.sector === key) : undefined;
  const def = rows.find((r) => r.sector === "");
  const row = exact ?? def;
  if (row) {
    return {
      opener: row.opener,
      problems: row.problems ?? [],
      permissionCheck: row.permissionCheck,
      bookingAsk: row.bookingAsk,
      guidance: row.guidance ?? [],
      sector: row.sector,
      origin: row.origin,
    };
  }
  return { ...defaultScriptFields(sector), sector: key, origin: "default" };
}

/** Save the rep's script for a (tenant, sector). Upsert on the unique key. */
export async function upsertTenantScript(args: {
  tenantId: string;
  userId?: string | null;
  sector?: string | null;
  fields: ScriptFields;
  origin?: string;
}): Promise<void> {
  const key = norm(args.sector);
  const f = args.fields;
  const [existing] = await db
    .select({ id: callScripts.id })
    .from(callScripts)
    .where(and(eq(callScripts.tenantId, args.tenantId), eq(callScripts.sector, key)))
    .limit(1);
  const values = {
    opener: f.opener,
    problems: f.problems,
    permissionCheck: f.permissionCheck,
    bookingAsk: f.bookingAsk,
    guidance: f.guidance,
    origin: args.origin ?? "edited",
    updatedBy: args.userId ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(callScripts).set(values).where(eq(callScripts.id, existing.id));
  } else {
    await db.insert(callScripts).values({ tenantId: args.tenantId, sector: key, ...values });
  }
}

/**
 * Generate a permission-based call script from the tenant's product + ICP via
 * an LLM. Returns a draft (not saved) the rep can review/edit then save.
 * Null when no model key is configured.
 */
export async function generateCallScript(
  tenantId: string,
  opts: { sector?: string | null; persona?: string | null } = {},
): Promise<ScriptFields | null> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return null;

  const s = await getTenantSettings(tenantId);
  const sector = (opts.sector ?? (s.targetIndustries ?? [])[0] ?? "").toString().trim();
  const ctx = {
    product: s.productDescription ?? "",
    salesMotion: s.salesMotion ?? "",
    challenge: s.primaryChallenge ?? "",
    industries: s.targetIndustries ?? [],
    sizes: s.targetCompanySizes ?? [],
    geographies: s.targetGeographies ?? [],
    roles: s.targetRoles ?? "",
    technologies: s.targetTechnologies ?? [],
    sector,
    persona: opts.persona ?? s.targetRoles ?? "",
  };

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: z.object({
        opener: z.string().describe("Permission gate: greeting + who you are (rep + company) + a '2 minutes ?' ask. MUST keep the {name} placeholder. One sentence, no pitch, no listed problems."),
        problems: z.array(z.string()).min(1).max(3).describe("1-3 sector ENJEUX the prospect validates ONE AT A TIME (not read as a list). Each is one concrete pain this exact segment feels, that the product removes."),
        permissionCheck: z.string().describe("Short question checking whether the enjeu is a current topic for them, e.g. 'Est-ce que c'est un sujet chez vous en ce moment ?'."),
        bookingAsk: z.string().describe("Propose to meet (~45 min) to go deeper, offering day/time options; mention they leave with something concrete even without a follow-up."),
      }),
      prompt: `Write a permission-based cold-call script in French (Suisse romande), for a salesperson selling this product:

PRODUCT: ${ctx.product || "(non renseigné)"}
SALES MOTION: ${ctx.salesMotion || "(n/a)"}
KEY CHALLENGE WE SOLVE: ${ctx.challenge || "(n/a)"}
TARGET SEGMENT — sector: ${ctx.sector || "(générique)"}; sizes: ${ctx.sizes.join(", ") || "n/a"}; geographies: ${ctx.geographies.join(", ") || "n/a"}; persona/roles: ${ctx.persona || "décideur"}; tech in place we replace: ${ctx.technologies.join(", ") || "n/a"}.

Methodology (strict, permission-based — locked by the founder): the cold call is short (2-3 min); its ONLY job is to earn a YES to a ~45-min deep-dive. Flow: (1) opener = a permission gate — greeting + who you are + "vous avez 2 minutes ?", NO pitch and NO listed problems; (2) then present ONE enjeu at a time as a hypothesis the prospect validates ("est-ce un sujet chez vous ?"), the rep iterates up to 3 until one lands; (3) propose the meeting with day/time options. Talk to decision-makers first. Use "vous". No emojis. Sound natural, like a peer with one real reason to call — never a stack of techniques. Never claim a certification the company doesn't have. Keep each enjeu to one concrete pain this exact segment feels, tied to the product. The opener MUST keep the {name} placeholder so it interpolates per call (do not put {sector}/{geo} in the opener).`,
      _trace: { agentId: "call-script-generate", tenantId, inputPreview: sector.slice(0, 80) },
    });
    return { ...object, guidance: defaultScriptFields(opts.sector).guidance };
  } catch {
    return null;
  }
}
