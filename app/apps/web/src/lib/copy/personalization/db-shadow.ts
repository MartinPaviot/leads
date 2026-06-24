/**
 * Spec 19/20 — grounded-copy SHADOW. Runs the spec-18/19 copy engine over a live
 * prospect (assets+voice from the spec-18 store, evidence from the prospect
 * context) and stores the result for comparison against the live draft path. The
 * shadow NEVER replaces a live send — it's the data the founder reads to decide a
 * cutover. Behind COPY_ENGINE_SHADOW (off). The model call is injectable so the
 * pipeline is testable without the network; generateMessage enforces the
 * never-invent post-check, so a thin/ungrounded result is a flagged fallback, not
 * a hallucination.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db as defaultDb } from "@/db";
import { copyShadowSample } from "@/db/schema";
import { buildProspectContext } from "@/lib/context/prospect-context";
import { copyContextForTenant } from "@/lib/copy/assets/db-store";
import { prospectContextToEvidence } from "./db-evidence";
import {
  generateMessage,
  type Lang,
  type Message,
  type PersonalizationAgentInput,
  type PersonalizationAgentResult,
} from "./generate-message";

/** Whether the copy-engine shadow is enabled. Default OFF — runs an LLM per sample. */
export function isCopyShadowEnabled(): boolean {
  const v = process.env.COPY_ENGINE_SHADOW;
  return v === "1" || v === "true";
}

export type ShadowGenerate = (args: { system: string; user: string }) => Promise<string>;

const defaultGenerate: ShadowGenerate = async ({ system, user }) => {
  const anthropic = new Anthropic();
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 800,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
};

const SYSTEM_PROMPT = `You write ONE personalization line for a cold outreach email, grounded ONLY in the cited evidence provided. Rules:
- Reference a SPECIFIC fact from the evidence; cite the evidence id(s) you used in citedIds.
- NEVER invent a detail. If no evidence is specific enough, return an empty line and citedIds [].
- Obey the voice guide: never use any banned token; for French use vouvoiement unless told otherwise.
- One or two sentences, no greeting, no sign-off.
Output ONLY valid JSON: { "line": "<the personalization line>", "subject": "<optional subject>", "citedIds": ["<evidence id>", ...] }`;

/** Build the agent prompt from assets + voice + evidence. */
export function buildAgentPrompt(input: PersonalizationAgentInput): { system: string; user: string } {
  const parts: string[] = [];
  parts.push(`Language: ${input.lang}${input.lang === "fr" ? " (vouvoiement)" : ""}`);
  if (input.roleClass) parts.push(`Recipient role: ${input.roleClass}`);
  parts.push("\n## Our positioning / offer (for tone, do not copy verbatim)");
  parts.push([input.assets.positioning, input.assets.offer].filter(Boolean).join("\n") || "(none)");
  parts.push("\n## Voice");
  parts.push(`Banned tokens: ${input.voice.banned.join(", ") || "(none)"}`);
  if (input.voice.favoredPhrasings?.length) parts.push(`Favored phrasings: ${input.voice.favoredPhrasings.join(", ")}`);
  parts.push("\n## Evidence (cite by id; never state anything not here)");
  for (const c of input.evidence) parts.push(`- [${c.id}] (${c.source}, conf ${c.confidence.toFixed(2)}): ${c.fact}`);
  return { system: SYSTEM_PROMPT, user: parts.join("\n") };
}

/** The spec-04-shaped personalization agent. Model error/unparseable → non-result (falls back). */
export async function personalizationRunAgent(
  input: PersonalizationAgentInput,
  generate: ShadowGenerate = defaultGenerate,
): Promise<PersonalizationAgentResult> {
  try {
    const raw = await generate(buildAgentPrompt(input));
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { evalPassed: false, reason: "no_json" };
    const parsed = JSON.parse(match[0]) as { line?: unknown; subject?: unknown; citedIds?: unknown };
    if (typeof parsed.line !== "string" || !Array.isArray(parsed.citedIds)) return { evalPassed: false, reason: "bad_shape" };
    return {
      evalPassed: true,
      value: {
        line: parsed.line,
        subject: typeof parsed.subject === "string" ? parsed.subject : undefined,
        citedIds: parsed.citedIds.filter((x): x is string => typeof x === "string"),
      },
    };
  } catch (e) {
    return { evalPassed: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export interface ShadowOutcome {
  ran: boolean;
  reason?: string;
  message?: Message;
  evidenceCount?: number;
}

/**
 * Generate one grounded shadow sample for a contact and persist it. Loads the
 * tenant's assets+voice (spec-18) + the prospect's evidence, runs generateMessage,
 * stores the result. Returns ran:false when disabled or no context.
 */
export async function generateShadowCopy(
  contactId: string,
  tenantId: string,
  opts: { lang?: Lang; campaignId?: string | null; generate?: ShadowGenerate; database?: typeof defaultDb } = {},
): Promise<ShadowOutcome> {
  if (!isCopyShadowEnabled()) return { ran: false, reason: "copy_shadow_disabled" };
  const database = opts.database ?? defaultDb;
  const lang: Lang = opts.lang ?? "en";

  const ctx = await buildProspectContext(contactId, tenantId);
  if (!ctx) return { ran: false, reason: "no_prospect_context" };

  const evidence = prospectContextToEvidence(ctx);
  const copyCtx = await copyContextForTenant(tenantId, { lang, campaignId: opts.campaignId ?? null }, database);

  const message = await generateMessage({
    assets: copyCtx.assets,
    voice: {
      banned: copyCtx.voice?.banned ?? [],
      frFormality: copyCtx.voice?.frFormality ?? "vouvoiement",
      favoredPhrasings: copyCtx.voice?.favoredPhrasings,
    },
    evidence,
    roleClass: ctx.contact.seniority ?? undefined,
    lang,
    runAgent: (input) => personalizationRunAgent(input, opts.generate),
    winningFormats: copyCtx.voice?.formats,
  });

  await persistShadowSample(tenantId, contactId, lang, message, evidence.length, database);
  return { ran: true, message, evidenceCount: evidence.length };
}

/** Persist a shadow sample (best-effort — a logging failure must not surface as a sample error). */
export async function persistShadowSample(
  tenantId: string,
  contactId: string,
  lang: Lang,
  message: Message,
  evidenceCount: number,
  database: typeof defaultDb = defaultDb,
): Promise<void> {
  try {
    await database.insert(copyShadowSample).values({
      tenantId,
      contactId,
      lang,
      personalizationLevel: message.personalization_level,
      subject: message.subject ?? null,
      body: message.body,
      flags: message.flags,
      evidenceCount,
    });
  } catch {
    /* best-effort */
  }
}
