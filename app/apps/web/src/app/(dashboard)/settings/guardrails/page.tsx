"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, Loader2, Save } from "lucide-react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* CLE-14: page-action helpers (pure, shared) */
const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });
function definePageAction<P>(a: PageAction<P>): PageAction { return a as unknown as PageAction; }

/**
 * CLE-14 — the settings actions we INTENTIONALLY do NOT register, ever. Two
 * classes are strictly human-bound:
 *  - security: password change + MFA enroll/disable are credential ceremonies
 *    that must stay with the human (no agent path may touch auth factors);
 *  - money: billing / plan upgrade / payment-method updates spend real money
 *    and live behind the human only.
 * A boundary test asserts the registered settings id set is DISJOINT from this.
 */
// SETTINGS_EXCLUDED_IDS moved to ./_excluded-ids (a Next page.tsx may only export
// the default component + route config).

/**
 * Settings → Guardrails — the consolidated page for approval mode,
 * LLM budget summary, and sending-infrastructure summary.
 *
 * Approval mode and sending infra summaries are editable inline; the
 * LLM budget section links to the existing `/settings/llm-budget`
 * page to avoid duplicating that UI's live spend indicator.
 */

type ApprovalModeV2 =
  | "review-each"
  | "batch-daily"
  | "auto-high-confidence";

type SendingMode =
  | "primary-with-caps"
  | "external-connected"
  | "elevay-managed-requested"
  | "elevay-managed-active";

interface SendingInfraPayload {
  mode: SendingMode;
  sendingDailyCapPrimary: number;
  sendingAllowColdOnPrimary: boolean;
  providers: { instantly: { connected: boolean } };
  pendingManagedRequest: {
    id: string;
    status: string;
    requestedAt: string;
    assigneeEmail: string | null;
    notes: string | null;
  } | null;
}

const APPROVAL_MODES: Array<{
  value: ApprovalModeV2;
  title: string;
  description: string;
  icon: typeof Shield;
}> = [
  {
    value: "review-each",
    title: "Review each action",
    description:
      "The safest default. I draft; you approve before anything leaves the app.",
    icon: ShieldCheck,
  },
  {
    value: "batch-daily",
    title: "Batch daily review",
    description:
      "Actions queue through the day. You review the full batch in one sitting.",
    icon: Shield,
  },
  {
    value: "auto-high-confidence",
    title: "Auto on high-confidence",
    description:
      "I send high-confidence drafts without asking. Borderline actions still wait for your review.",
    icon: ShieldAlert,
  },
];

export default function GuardrailsSettingsPage() {
  const { toast } = useToast();
  const [approvalMode, setApprovalMode] = useState<ApprovalModeV2 | null>(null);
  const [sending, setSending] = useState<SendingInfraPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceRes, sendingRes] = await Promise.all([
        fetch("/api/settings/workspace"),
        fetch("/api/settings/sending-infra"),
      ]);
      if (workspaceRes.ok) {
        const payload = (await workspaceRes.json()) as { agentApprovalMode?: ApprovalModeV2 };
        setApprovalMode(payload.agentApprovalMode ?? "review-each");
      }
      if (sendingRes.ok) {
        setSending((await sendingRes.json()) as SendingInfraPayload);
      }
    } catch (err) {
      console.warn("guardrails: load failed", err);
      toast("Couldn't load guardrails", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * CLE-14 — the single fetch path shared by the Save button and the chat
   * action. Optimistic with rollback; returns {ok,error?} so the page-action
   * run can report success/failure without re-reading the form or duplicating
   * the PUT. The UI keeps toasting via the wrapper below.
   */
  const saveApprovalModeValue = useCallback(
    async (mode: ApprovalModeV2): Promise<{ ok: boolean; error?: string }> => {
      setSaving(true);
      const prev = approvalMode;
      setApprovalMode(mode); // optimistic
      try {
        const res = await fetch("/api/settings/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentApprovalMode: mode }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true };
      } catch (err) {
        console.warn("guardrails: save failed", err);
        setApprovalMode(prev); // rollback
        return { ok: false, error: err instanceof Error ? err.message : "Couldn't save approval mode" };
      } finally {
        setSaving(false);
      }
    },
    [approvalMode],
  );

  async function saveApprovalMode(mode: ApprovalModeV2) {
    const r = await saveApprovalModeValue(mode);
    if (r.ok) toast("Approval mode updated", "success");
    else toast("Couldn't save approval mode", "error");
  }

  // CLE-14: register this page's one SAFE config action for the chat
  // live-executor. Reuses saveApprovalModeValue (the same PUT the buttons use).
  const guardrailsActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "settings.setApprovalMode",
        title: "Set the agent approval mode",
        description:
          "Set how much the agent must ask before acting: 'review-each' (approve every action), " +
          "'batch-daily' (queue actions for one daily review), or 'auto-high-confidence' (auto-send " +
          "high-confidence drafts, hold borderline ones). Use when the user wants to change trust/autonomy.",
        params: z.object({ mode: z.enum(["review-each", "batch-daily", "auto-high-confidence"]) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ mode }): Promise<PageActionResult> => {
          const r = await saveApprovalModeValue(mode);
          return r.ok ? okResult(`Approval mode set to ${mode}.`) : errResult(r.error ?? "Couldn't save approval mode.");
        },
      }),
    ],
    // run() reaches the latest saveApprovalModeValue via the identity below; the
    // id set is stable so registration happens once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveApprovalModeValue],
  );
  useRegisterPageActions(guardrailsActions);

  return (
    <>
      <SettingsHeader
        title="Guardrails"
        subtitle="Explicit trust calibration before any autonomous action."
      />

      <div className="space-y-4">
        {/* ── Approval mode ── */}
        <Card>
          <CardBody>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Approval mode
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Controls when the agent requires your explicit approval before acting.
            </p>

            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-[12px]">
                <Loader2 size={14} className="animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {APPROVAL_MODES.map(({ value, title, description, icon: Icon }) => {
                  const active = approvalMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={saving}
                      onClick={() => void saveApprovalMode(value)}
                      className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-all"
                      style={{
                        background: active
                          ? "rgba(44,107,237,.06)"
                          : "var(--color-bg-page)",
                        border: `1px solid ${
                          active
                            ? "var(--color-accent)"
                            : "var(--color-border-default)"
                        }`,
                        cursor: saving ? "wait" : "pointer",
                      }}
                    >
                      <Icon
                        size={18}
                        style={{
                          color: active
                            ? "var(--color-accent)"
                            : "var(--color-text-tertiary)",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      <div className="flex-1">
                        <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {title}
                        </div>
                        <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                          {description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── Sending infra summary ── */}
        <Card>
          <CardBody>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Sending infrastructure
                </h2>
                <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Where your outbound emails leave from, and the protections around your primary domain.
                </p>
              </div>
              <a href="/settings/sending-infrastructure">
                <Button size="sm" variant="outline">Manage</Button>
              </a>
            </div>

            {sending ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <dt style={{ color: "var(--color-text-tertiary)" }}>Mode</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {sending.mode}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--color-text-tertiary)" }}>Daily cap (primary)</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {sending.sendingDailyCapPrimary}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--color-text-tertiary)" }}>Cold on primary</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {sending.sendingAllowColdOnPrimary ? "Allowed" : "Blocked"}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--color-text-tertiary)" }}>Instantly</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {sending.providers.instantly.connected ? "Connected" : "Not connected"}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="mt-3 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                {loading ? "Loading…" : "Couldn't load sending infrastructure."}
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── Budget link ── */}
        <Card>
          <CardBody>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  LLM budget
                </h2>
                <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Monthly cap on AI-credit spend. Stops runaway loops and keeps surprises out of the bill.
                </p>
              </div>
              <a href="/settings/llm-budget">
                <Button size="sm" variant="outline"><Save size={13} /> Configure</Button>
              </a>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
