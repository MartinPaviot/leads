import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { buildQueue } from "@/lib/voice/queue";
import { navigateDirective } from "@/lib/chat/ui-directives";
import {
  resolveSprintAudience,
  countSprintAudience,
  validateSprintLabels,
  readSprintAudience,
  listSprintContactsMissingPhone,
  type SprintAudience,
} from "@/lib/voice/call-sprint";
import {
  getOwnActiveCampaign,
  updateCallCampaign,
  generateDailyCallList,
} from "@/lib/voice/campaign";
import { enqueueFullEnrichForContacts } from "@/lib/integrations/fullenrich-enqueue";

/**
 * Call Mode tools. Read side: the prioritised cold-call queue the Call Mode
 * page builds (composite intent × accessibility × deal-value, DNC +
 * quiet-hours flagged). Write side: the CALL SPRINT pair — propose (honest
 * preview with counts) then apply (audience onto the rep's own active
 * campaign) — which makes the founder playbook's "sprint mono-secteur"
 * executable from the chat.
 *
 * Placing an actual call is intentionally NOT exposed here: dialing is a
 * Twilio side-effect that belongs behind the Call Mode UI's explicit
 * controls, not a chat tool call.
 */
export function buildCallTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    getCallList: makeTool({
      description:
        `Get today's prioritised cold-call list (the Call Mode queue): highest-intent, reachable contacts sorted by a composite intent × accessibility × deal-value score, each flagged for Do-Not-Call and quiet hours with its local time. Use when the user asks "who should I call today", "my call list", "call queue", "who's worth phoning at [account]".`,
      inputSchema: z.object({
        limit: z.number().optional().describe("Max contacts to return (default 20)"),
        companyId: z.string().optional().describe("Restrict the queue to one account's contacts"),
      }),
      execute: async (input) => {
        const items = await buildQueue(
          tenantId,
          input.limit ?? 20,
          input.companyId ? { companyIds: [input.companyId] } : {},
        );
        return {
          count: items.length,
          callList: items.map((i) => ({
            contactId: i.contactId,
            name: i.contactName,
            title: i.title,
            company: i.companyName,
            phone: i.phone,
            score: Math.round(i.score * 100) / 100,
            localTime: i.localTime,
            inQuietHours: i.inQuietHours,
            onDnc: i.onDnc,
            signal: i.latestSignal?.label ?? null,
          })),
        };
      },
    }),

    proposeCallSprint: makeTool({
      description:
        `Resolve a CALL SPRINT target from a natural-language description ("les DG des EMS romands", "les CTO des fintechs") against the STORED data (real industry labels + the ICP persona vocabulary) and return honest counts: contacts in the target, with a phone, callable now. Read-only preview — ALWAYS call this first when the user asks to extract a target / build a call list for a segment; show the counts and ask for confirmation before applyCallSprint. Founder playbook rule: one sector × persona per sprint.`,
      inputSchema: z.object({
        target: z.string().describe(`The target description, e.g. "les directeurs généraux des EMS"`),
      }),
      execute: async (input) => {
        const { audience, facets } = await resolveSprintAudience(input.target, tenantId);
        if (audience.industries.length === 0 && audience.personas.length === 0) {
          return {
            resolved: false,
            facets,
            message:
              "Cible non résolue sur les données stockées (aucun secteur ni persona reconnus). Reformuler avec un secteur et/ou un rôle, p.ex. « les DG des EMS » ou « les CTO des sociétés financières ».",
          };
        }
        const counts = await countSprintAudience(tenantId, audience);
        const campaign = await getOwnActiveCampaign(tenantId, ctx.authCtx.appUserId);
        return {
          resolved: true,
          audience,
          facets,
          counts,
          enrichmentGap: Math.max(0, counts.total - counts.withPhone),
          hasOwnActiveCampaign: !!campaign,
          nextStep: campaign
            ? "Si l'utilisateur confirme, appeler applyCallSprint avec EXACTEMENT ces labels (audience.industries / audience.personas / audience.label)."
            : "Pas de campagne d'appels active à son nom : l'inviter à créer son objectif dans Call Mode d'abord, puis applyCallSprint.",
        };
      },
    }),

    applyCallSprint: makeTool({
      description:
        `Apply a CONFIRMED call sprint to the user's own active call campaign: stores the audience (industries × personas) on the campaign and regenerates today's list, so the daily top-up only draws from that target (retries already in cadence keep their schedule). Pass back the EXACT labels proposeCallSprint returned. clear=true removes the sprint (list reverts to the whole ICP ranked by fit). Only call after the user explicitly confirmed the proposal.`,
      inputSchema: z.object({
        label: z.string().optional().describe("Human sprint label, from proposeCallSprint's audience.label"),
        industries: z.array(z.string()).optional().describe("Verbatim industry labels from the proposal"),
        personas: z.array(z.string()).optional().describe("Verbatim persona labels from the proposal"),
        clear: z.boolean().optional().describe("true = remove the active sprint instead of setting one"),
      }),
      execute: async (input) => {
        const campaign = await getOwnActiveCampaign(tenantId, ctx.authCtx.appUserId);
        if (!campaign) {
          return {
            applied: false,
            error: "no_active_campaign",
            message:
              "Aucune campagne d'appels active à ton nom — crée d'abord ton objectif dans Call Mode (p.ex. « 100 appels cette semaine »), puis je cible le sprint.",
            ...navigateDirective("/call-mode", "Ouvrir Call Mode"),
          };
        }

        if (input.clear) {
          await updateCallCampaign({ tenantId, campaignId: campaign.id, audience: null });
          const gen = await generateDailyCallList(campaign.id);
          return {
            applied: true,
            cleared: true,
            todaysList: gen,
            message: "Sprint retiré — la liste redevient tout l'ICP classé par fit.",
            ...navigateDirective("/call-mode", "Ouvrir Call Mode"),
          };
        }

        // Never trust echoed labels: re-validate verbatim against stored data.
        const valid = await validateSprintLabels(
          tenantId,
          input.industries ?? [],
          input.personas ?? [],
        );
        if (valid.industries.length === 0 && valid.personas.length === 0) {
          return {
            applied: false,
            error: "empty_audience",
            message:
              "Aucun label valide après vérification contre les données — relancer proposeCallSprint et reprendre ses labels tels quels.",
          };
        }

        const audience: SprintAudience = {
          label: (input.label ?? "").trim().slice(0, 120) || "sprint",
          industries: valid.industries,
          personas: valid.personas,
        };
        await updateCallCampaign({ tenantId, campaignId: campaign.id, audience });
        const gen = await generateDailyCallList(campaign.id);
        const counts = await countSprintAudience(tenantId, audience);

        const shortfall =
          gen.newlyAdded === 0 && counts.callable === 0
            ? ` Attention : 0 contact joignable dans la cible (${counts.total} contacts, ${counts.withPhone} avec téléphone) — lancer la vague d'enrichissement avant d'appeler.`
            : "";
        return {
          applied: true,
          audience,
          counts,
          todaysList: gen,
          message:
            `Sprint « ${audience.label} » appliqué à la campagne « ${campaign.name} ». Liste du jour : ${gen.listed} (${gen.retriesDue} rappels dus + ${gen.newlyAdded} nouveaux de la cible).` +
            shortfall,
          ...navigateDirective("/call-mode", "Voir la liste du sprint"),
        };
      },
    }),

    enrichCallSprint: makeTool({
      description:
        `Launch the phone-enrichment wave for the ACTIVE call sprint: takes the sprint-audience contacts that have NO phone number (highest ICP fit first, cap 100) and fires the FullEnrich bulk pass (async — mobiles land on the contacts via webhook, typically within minutes). Use when the user says "lance l'enrichissement du sprint", "trouve les numéros de la cible", or after applyCallSprint reported 0 callable. Honest by design: reports requested/skipped, or the exact reason nothing was launched.`,
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe("Max contacts to enrich in this wave (default 50, cap 100 — provider daily quotas are the real ceiling)"),
      }),
      execute: async (input) => {
        const campaign = await getOwnActiveCampaign(tenantId, ctx.authCtx.appUserId);
        if (!campaign) {
          return {
            launched: false,
            error: "no_active_campaign",
            message: "Aucune campagne d'appels active à ton nom — crée d'abord l'objectif dans Call Mode.",
          };
        }
        const audience = readSprintAudience(campaign.targetFilter);
        if (!audience) {
          return {
            launched: false,
            error: "no_sprint",
            message: "Aucun sprint actif sur ta campagne — lance d'abord proposeCallSprint puis applyCallSprint.",
          };
        }
        const missing = await listSprintContactsMissingPhone(tenantId, audience, input.limit ?? 50);
        if (missing.length === 0) {
          return {
            launched: false,
            error: "nothing_to_enrich",
            sprint: audience.label,
            message: "Tous les contacts de la cible ont déjà un numéro (ou la cible est vide).",
          };
        }
        const baseUrl =
          process.env.FULLENRICH_CALLBACK_BASE_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://www.elevay.dev";
        const result = await enqueueFullEnrichForContacts({
          tenantId,
          contactIds: missing.map((m) => m.id),
          baseUrl,
        });
        if (!result.ok) {
          return { launched: false, error: result.code, sprint: audience.label, message: result.error };
        }
        return {
          launched: true,
          async: true,
          sprint: audience.label,
          requested: result.requested,
          skipped: result.skipped,
          message:
            `Vague d'enrichissement lancée pour le sprint « ${audience.label} » : ${result.requested} contact${result.requested === 1 ? "" : "s"} demandé${result.requested === 1 ? "" : "s"} (${result.skipped} sans identité suffisante). Les mobiles arrivent sur les fiches via webhook — relancer applyCallSprint ensuite pour regénérer la liste.`,
        };
      },
    }),
  };
}
