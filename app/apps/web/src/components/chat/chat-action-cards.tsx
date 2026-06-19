"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { parseUiToolParts } from "@/components/tool-call-panel";
import { ActionCard, parseToolResultForCard } from "@/components/action-card";
import { runRegisteredAction, highlightEntity } from "@/lib/chat/page-actions/registry";
import type { PageActionResult } from "@/lib/chat/page-actions/types";
import type { InvokeActionDirective } from "@/lib/chat/ui-directives";
import { encodeActionResult, maybeHighlightFromResult } from "@/components/chat/use-ui-directives";
import { ActionConfirmCard, type ConfirmStatus } from "./action-confirm-card";

/**
 * Shared action-card approval flow for every chat surface (the full /chat
 * page AND the floating dock). Extracted so the create/update proposal
 * UX — edit fields, approve, dismiss, "create all", sequential linking —
 * lives in exactly one place and can never drift between surfaces.
 */

type CardStatus = "pending" | "approved" | "dismissed";

/** Minimal slice of the AI SDK chat helpers this controller needs. */
interface ChatSender {
  sendMessage: (message: { text: string }) => void;
}

/** A UIMessage-shaped object — only `id` and `parts` are read. */
interface RenderableMessage {
  id: string;
  parts: readonly { type: string }[];
}

export interface ChatActionCardController {
  cardStatuses: Record<string, CardStatus>;
  cardExecuting: Record<string, boolean>;
  approveCard: (
    cardKey: string,
    proposalAction: string | undefined,
    editedFields: Record<string, string | number | null>,
    entityName?: string,
  ) => Promise<void>;
  dismissCard: (cardKey: string) => void;
}

export function useChatActionCards(chat: ChatSender): ChatActionCardController {
  const router = useRouter();
  const { toast } = useToast();
  const [cardStatuses, setCardStatuses] = useState<Record<string, CardStatus>>({});
  const [cardExecuting, setCardExecuting] = useState<Record<string, boolean>>({});

  const approveCard = useCallback(
    async (
      cardKey: string,
      proposalAction: string | undefined,
      editedFields: Record<string, string | number | null>,
      entityName?: string,
    ) => {
      setCardExecuting((prev) => ({ ...prev, [cardKey]: true }));
      try {
        // Campaign approval: navigate to the sequence detail. SPA push keeps
        // the chat history in memory so the user can come back and continue.
        if (proposalAction === "campaign") {
          setCardStatuses((prev) => ({ ...prev, [cardKey]: "approved" }));
          const seqId = (editedFields as Record<string, unknown>).sequenceId;
          if (typeof seqId === "string" && seqId) router.push(`/sequences/${seqId}`);
          return;
        }

        const endpoint =
          proposalAction === "createContact" ? "/api/contacts"
          : proposalAction === "createAccount" ? "/api/accounts"
          : proposalAction === "createDeal" ? "/api/opportunities"
          : null;
        if (!endpoint) return;

        const entityType =
          proposalAction === "createContact" ? "contact"
          : proposalAction === "createAccount" ? "account"
          : proposalAction === "createDeal" ? "deal"
          : "record";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editedFields),
        });

        if (res.ok) {
          const created = await res.json();
          setCardStatuses((prev) => ({ ...prev, [cardKey]: "approved" }));
          // Sequential workflow: tell the model what was created so it can
          // propose linked records (e.g. a contact for a new account).
          const createdId =
            created.id || created.contact?.id || created.account?.id || created.deal?.id || "";
          if (createdId) {
            chat.sendMessage({
              text: `[Approved: ${entityType} "${entityName || "record"}" created with id ${createdId}. If there are related records to create (e.g., a contact for a new account), propose them now.]`,
            });
          }
          return;
        }

        // Surface server errors so the user can retry or fix the payload.
        const errorBody = (await res.json().catch(() => ({}))) as { error?: string };
        const serverMsg = errorBody.error ?? null;
        if (res.status === 409) {
          toast(`A ${entityType} with this identifier already exists.`, "error");
        } else if (res.status === 422 || res.status === 400) {
          toast(`Validation failed: ${serverMsg ?? "check required fields"}.`, "error");
        } else {
          toast(
            `Failed to create ${entityType} (${res.status})${serverMsg ? `: ${serverMsg}` : ""}. Click Approve to retry.`,
            "error",
          );
        }
        // Keep state "pending" so the user can retry from the same card.
      } catch (err) {
        const entityType =
          proposalAction === "createContact" ? "contact"
          : proposalAction === "createAccount" ? "account"
          : proposalAction === "createDeal" ? "deal"
          : "record";
        toast(
          err instanceof Error
            ? `Failed to create ${entityType}: ${err.message}`
            : `Failed to create ${entityType}. Please try again.`,
          "error",
        );
      } finally {
        setCardExecuting((prev) => ({ ...prev, [cardKey]: false }));
      }
    },
    [chat, router, toast],
  );

  const dismissCard = useCallback((cardKey: string) => {
    setCardStatuses((prev) => ({ ...prev, [cardKey]: "dismissed" }));
  }, []);

  return { cardStatuses, cardExecuting, approveCard, dismissCard };
}

/**
 * Render every create/update proposal + result card for one assistant
 * message, including the "Create all N" batch bar when 2+ proposals are
 * pending. Shared by the dock and the full chat page.
 */
export function MessageActionCards({
  message,
  controller,
}: {
  message: RenderableMessage;
  controller: ChatActionCardController;
}) {
  const { cardStatuses, approveCard, dismissCard } = controller;

  const completedCalls = parseUiToolParts(message.parts).filter((c) => !c.isStreaming);
  const cards = completedCalls
    .map((call, idx) => {
      const cardData = parseToolResultForCard(call.toolName, call.args, call.result);
      if (!cardData) return null;
      return { cardData, cardKey: `${message.id}-${idx}`, idx };
    })
    .filter(Boolean) as {
    cardData: NonNullable<ReturnType<typeof parseToolResultForCard>>;
    cardKey: string;
    idx: number;
  }[];

  if (cards.length === 0) return null;

  const pendingProposals = cards.filter(
    (c) => c.cardData.isProposal && (cardStatuses[c.cardKey] || "pending") === "pending",
  );

  return (
    <>
      {pendingProposals.length >= 2 && (
        <div
          className="my-2 flex items-center justify-end gap-2 rounded-md px-3 py-1.5"
          style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-default)" }}
        >
          <span className="mr-auto text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            {pendingProposals.length} pending
          </span>
          <button
            onClick={() => pendingProposals.forEach((p) => dismissCard(p.cardKey))}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Dismiss all
          </button>
          <button
            onClick={async () => {
              for (const p of pendingProposals) {
                await approveCard(p.cardKey, p.cardData.proposalAction, p.cardData.fields, p.cardData.entityName);
              }
            }}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium text-white transition-colors"
            style={{ background: "var(--color-accent)" }}
          >
            <Check size={12} />
            Create all {pendingProposals.length}
          </button>
        </div>
      )}

      {cards.map(({ cardData, cardKey, idx }) => {
        const cardStatus = cardData.isProposal ? cardStatuses[cardKey] || "pending" : "approved";
        return (
          <ActionCard
            key={idx}
            actionType={cardData.actionType}
            entityType={cardData.entityType}
            entityName={cardData.entityName}
            fields={cardData.fields}
            status={cardStatus}
            proposalAction={cardData.proposalAction}
            onApprove={
              cardData.isProposal
                ? (editedFields) => approveCard(cardKey, cardData.proposalAction, editedFields, cardData.entityName)
                : undefined
            }
            onDismiss={cardData.isProposal ? () => dismissCard(cardKey) : undefined}
          />
        );
      })}
    </>
  );
}

/* ================================================================== */
/*  CLE-05 — Page-action confirmation cards                            */
/*  A SECOND, distinct controller for `invokeAction` directives whose  */
/*  requireConfirm is true. Unlike the create-card flow above (which   */
/*  POSTs to REST), page actions run on the CLIENT via the registry    */
/*  (runRegisteredAction) and round-trip a result envelope. Single-    */
/*  sourced here so the dock AND the /chat page share one impl.        */
/* ================================================================== */

interface PendingConfirm {
  directive: InvokeActionDirective; // invocationId, actionId, params, requireConfirm:true
  status: ConfirmStatus;
  resultSummary?: string;
  error?: string;
}

export interface ActionConfirmController {
  pending: PendingConfirm[]; // render order; one card per invocationId
  enqueueConfirm: (d: InvokeActionDirective) => void;
  approveActionCard: (invocationId: string, editedParams: Record<string, unknown>) => Promise<void>;
  dismissActionCard: (invocationId: string) => void;
}

export function useActionConfirmCards(chat: ChatSender): ActionConfirmController {
  const [byId, setById] = useState<Record<string, PendingConfirm>>({});
  const [order, setOrder] = useState<string[]>([]);
  // SSOT for the status machine: mutated synchronously so a double-click is seen
  // before React flushes (mirrors the dock's surfaceRef pattern). setById mirrors
  // it for rendering.
  const byIdRef = useRef<Record<string, PendingConfirm>>({});

  const roundTrip = useCallback(
    (invocationId: string, r: PageActionResult) => {
      chat.sendMessage({ text: encodeActionResult(invocationId, r) });
    },
    [chat],
  );

  const enqueueConfirm = useCallback((d: InvokeActionDirective) => {
    if (byIdRef.current[d.invocationId]) return; // E-5: idempotent per invocationId
    byIdRef.current = { ...byIdRef.current, [d.invocationId]: { directive: d, status: "pending" } };
    setById(byIdRef.current);
    setOrder((prev) => (prev.includes(d.invocationId) ? prev : [...prev, d.invocationId]));
  }, []);

  const approveActionCard = useCallback(
    async (invocationId: string, editedParams: Record<string, unknown>) => {
      const cur = byIdRef.current[invocationId];
      // AC-8/E-4 single-flight: only a pending or failed (Retry) card may run.
      if (!cur || (cur.status !== "pending" && cur.status !== "failed")) return;
      // Mark running synchronously BEFORE awaiting so a second click no-ops.
      byIdRef.current = { ...byIdRef.current, [invocationId]: { ...cur, status: "running", error: undefined } };
      setById(byIdRef.current);

      // runRegisteredAction re-validates params against the live Zod schema (AC-5)
      // and never throws (CLE-03 §2.3) — so no try/catch is needed here.
      const result = await runRegisteredAction(cur.directive.actionId, editedParams);
      roundTrip(invocationId, result); // AC-2: success OR error envelope round-trips
      // CLE-15: pulse the affected element if the result named one. Import
      // highlightEntity directly (module-level) so the controller signature is
      // not widened. A failed run pulses nothing (maybeHighlightFromResult guards).
      maybeHighlightFromResult(result, highlightEntity);

      const prev = byIdRef.current[invocationId];
      byIdRef.current = {
        ...byIdRef.current,
        [invocationId]: {
          ...prev,
          status: result.ok ? "done" : "failed", // E-3: failed keeps Retry
          resultSummary: result.summary,
          error: result.error,
        },
      };
      setById(byIdRef.current);
    },
    [roundTrip],
  );

  const dismissActionCard = useCallback(
    (invocationId: string) => {
      const cur = byIdRef.current[invocationId];
      // AC-8: ignore dismiss while running or after a terminal state.
      if (!cur || cur.status === "running" || cur.status === "done" || cur.status === "dismissed") return;
      byIdRef.current = { ...byIdRef.current, [invocationId]: { ...cur, status: "dismissed" } };
      setById(byIdRef.current);
      // AC-3: round-trip an explicit cancelled envelope through the same codec.
      roundTrip(invocationId, { ok: false, summary: "Cancelled by the user.", error: "cancelled" });
    },
    [roundTrip],
  );

  const pending = order.map((id) => byId[id]).filter(Boolean) as PendingConfirm[];
  return { pending, enqueueConfirm, approveActionCard, dismissActionCard };
}

/**
 * Render the pending page-action confirm cards (one per invocationId). Rendered
 * once per surface near MessageActionCards — it reads the controller queue, not
 * a specific message's parts, so a card survives re-renders and never
 * double-mounts (E-5).
 */
export function ActionConfirmCards({ controller }: { controller: ActionConfirmController }) {
  if (controller.pending.length === 0) return null;
  return (
    <>
      {controller.pending.map((p) => (
        <ActionConfirmCard
          key={p.directive.invocationId}
          directive={p.directive}
          status={p.status}
          resultSummary={p.resultSummary}
          error={p.error}
          onApprove={(edited) => controller.approveActionCard(p.directive.invocationId, edited)}
          onDismiss={() => controller.dismissActionCard(p.directive.invocationId)}
        />
      ))}
    </>
  );
}
