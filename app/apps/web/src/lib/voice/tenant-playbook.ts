/**
 * Per-tenant objection bank for the live coaching cards.
 *
 * The neutral PLAYBOOK (coaching-playbook.ts) is the universal fallback; this
 * layer overrides it class-by-class with responses generated ONCE from the
 * tenant's own product + ICP (same guarded pattern as generateCallScript) and
 * persisted in `tenants.settings.objectionBank` — no migration, founder-
 * editable later. No model key / generation failure / malformed bank ⇒ the
 * neutral fallback, never another vendor's pitch.
 *
 * Deps are injectable so the merge/generation logic unit-tests without DB or
 * network. A small in-memory TTL cache keeps the per-chunk webhook cheap.
 */

import { z } from "zod";
import { generateObject } from "ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { getTenantSettings, updateTenantSettings, type TenantSettings } from "@/lib/config/tenant-settings";
import { PLAYBOOK, type ObjectionClass, type PlaybookEntry } from "./coaching-playbook";

const CLASSES = Object.keys(PLAYBOOK) as ObjectionClass[];

export interface StoredObjectionEntry {
  objectionClass: string;
  responses: string[];
}

/** Validate a settings-stored bank into per-class entries. Unknown classes and
 *  malformed entries are dropped; null when nothing usable remains. */
export function parseObjectionBank(
  raw: unknown,
): Partial<Record<ObjectionClass, PlaybookEntry>> | null {
  if (!Array.isArray(raw)) return null;
  const out: Partial<Record<ObjectionClass, PlaybookEntry>> = {};
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const cls = (e as StoredObjectionEntry).objectionClass;
    const responses = (e as StoredObjectionEntry).responses;
    if (!CLASSES.includes(cls as ObjectionClass)) continue;
    if (!Array.isArray(responses)) continue;
    const clean = responses
      .filter((r): r is string => typeof r === "string")
      .map((r) => r.trim())
      .filter((r) => r.length >= 10 && r.length <= 300)
      .slice(0, 2);
    if (clean.length === 0) continue;
    out[cls as ObjectionClass] = {
      objectionClass: cls as ObjectionClass,
      label: PLAYBOOK[cls as ObjectionClass].label,
      suggestedResponses: clean,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Neutral base overridden class-by-class by the tenant entries. */
export function mergePlaybook(
  overrides: Partial<Record<ObjectionClass, PlaybookEntry>> | null,
): Record<ObjectionClass, PlaybookEntry> {
  if (!overrides) return PLAYBOOK;
  return { ...PLAYBOOK, ...overrides };
}

export interface TenantPlaybookDeps {
  loadSettings?: (tenantId: string) => Promise<TenantSettings>;
  saveBank?: (tenantId: string, bank: StoredObjectionEntry[]) => Promise<void>;
  /** null = no model available (generation skipped). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model?: any;
  generate?: typeof generateObject;
  now?: () => number;
}

const bankSchema = z.object({
  bank: z
    .array(
      z.object({
        objectionClass: z.enum(CLASSES as [ObjectionClass, ...ObjectionClass[]]),
        responses: z.array(z.string().min(10).max(300)).min(1).max(2),
      }),
    )
    .min(4),
});

async function generateBank(
  settings: TenantSettings,
  deps: Required<Pick<TenantPlaybookDeps, "model">> & TenantPlaybookDeps,
): Promise<StoredObjectionEntry[] | null> {
  const generate = deps.generate ?? generateObject;
  const product = settings.productDescription?.trim();
  if (!product) return null; // nothing grounded to phrase from
  try {
    const { object } = await generate({
      model: deps.model,
      schema: bankSchema,
      system: `You write live cold-call objection responses a rep whispers mid-call. French, "vous" register, one breath each (≤ 2 short sentences). Methodology: acknowledge → one calibrated question → de-risk the meeting. NEVER invent prices, certifications, metrics or competitor names that are not in PRODUCT. No hype.`,
      prompt: `PRODUCT: ${product}
SALES MOTION: ${settings.salesMotion ?? "n/a"}
ICP: industries ${settings.targetIndustries?.join(", ") || "n/a"}; sizes ${settings.targetCompanySizes?.join(", ") || "n/a"}; roles ${settings.targetRoles || "décideur"}.

For each objection class (${CLASSES.join(", ")}), write 2 responses grounded in THIS product. Return { bank: [{ objectionClass, responses }] }.`,
    });
    const entries = (object as z.infer<typeof bankSchema>).bank.map((b) => ({
      objectionClass: b.objectionClass,
      responses: b.responses,
    }));
    return entries.length > 0 ? entries : null;
  } catch {
    return null; // a missed bank must never break live coaching
  }
}

const cache = new Map<string, { at: number; playbook: Record<ObjectionClass, PlaybookEntry> }>();
const CACHE_TTL_MS = 5 * 60_000;

/**
 * The playbook in effect for a tenant: stored bank over neutral; generated
 * once (then persisted) when absent and a model is available; neutral
 * otherwise. Never throws.
 */
export async function getTenantPlaybook(
  tenantId: string,
  deps: TenantPlaybookDeps = {},
): Promise<Record<ObjectionClass, PlaybookEntry>> {
  const now = deps.now ?? Date.now;
  const hit = cache.get(tenantId);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.playbook;

  const loadSettings = deps.loadSettings ?? getTenantSettings;
  const saveBank =
    deps.saveBank ??
    (async (id: string, bank: StoredObjectionEntry[]) => {
      await updateTenantSettings(id, {
        objectionBank: bank,
        objectionBankGeneratedAt: new Date().toISOString(),
      });
    });
  const model =
    deps.model !== undefined
      ? deps.model
      : process.env.ANTHROPIC_API_KEY
        ? anthropic("claude-haiku-4-5-20251001")
        : null;

  let playbook = PLAYBOOK;
  try {
    const settings = await loadSettings(tenantId);
    let overrides = parseObjectionBank(settings.objectionBank);
    if (!overrides && model) {
      const generated = await generateBank(settings, { ...deps, model });
      if (generated) {
        overrides = parseObjectionBank(generated);
        if (overrides) await saveBank(tenantId, generated).catch(() => {});
      }
    }
    playbook = mergePlaybook(overrides);
  } catch {
    playbook = PLAYBOOK;
  }

  cache.set(tenantId, { at: now(), playbook });
  return playbook;
}
