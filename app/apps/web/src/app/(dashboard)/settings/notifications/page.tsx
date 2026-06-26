"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input, Toggle } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSafeFetch } from "@/lib/infra/use-safe-fetch";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* CLE-14: page-action helpers (pure, shared) */
const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });
function definePageAction<P>(a: PageAction<P>): PageAction { return a as unknown as PageAction; }

interface NotificationPref {
  key: string;
  label: string;
  description: string;
  category: string;
  email: boolean;
  inApp: boolean;
  slack: boolean;
}

// Folded in from the retired /settings/inbox-notifications page (Settings IA):
// inbox per-event opt-in + digest cadence + quiet hours, saved to a separate
// owner-scoped store (/api/inbox/notifications), gated downstream by shouldNotify.
type InboxDigestMode = "off" | "morning" | "morning_evening";
interface InboxNotifEvent { id: string; label: string; description: string; default: boolean }
interface InboxNotifPrefs { events: Record<string, boolean>; digest: InboxDigestMode; dndStart: string | null; dndEnd: string | null }
const INBOX_DIGEST_OPTIONS: { value: InboxDigestMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "morning", label: "Morning" },
  { value: "morning_evening", label: "Morning + evening" },
];

const DEFAULT_PREFS: NotificationPref[] = [
  { key: "deal_risk", label: "Deal at risk", description: "Get notified when a deal is flagged as high risk or stalled.", category: "Pipeline", email: true, inApp: true, slack: false },
  { key: "deal_won", label: "Deal won", description: "Get notified when a deal is marked as won.", category: "Pipeline", email: true, inApp: true, slack: false },
  { key: "deal_lost", label: "Deal lost", description: "Get notified when a deal is marked as lost.", category: "Pipeline", email: false, inApp: true, slack: false },
  { key: "task_due", label: "Due date reminders", description: "Get notified before a task is due.", category: "Tasks", email: false, inApp: true, slack: false },
  { key: "task_assigned", label: "Task assigned to you", description: "Get notified when someone assigns you a task.", category: "Tasks", email: true, inApp: true, slack: false },
  { key: "meeting_upcoming", label: "Meeting ready for review", description: "Get notified when a meeting transcript has been processed.", category: "Meetings", email: true, inApp: true, slack: false },
  { key: "sequence_reply", label: "Sequence reply detected", description: "Get notified when a prospect replies to a sequence email.", category: "Outreach", email: true, inApp: true, slack: false },
  { key: "enrichment_done", label: "Enrichment complete", description: "Get notified when company/contact enrichment finishes.", category: "Prospecting", email: false, inApp: true, slack: false },
  { key: "new_contact", label: "New contact auto-created", description: "Get notified when a contact is auto-created from email sync.", category: "Prospecting", email: false, inApp: true, slack: false },
  { key: "system", label: "System notifications", description: "Important system alerts and updates.", category: "System", email: true, inApp: true, slack: false },
];

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPref[]>(DEFAULT_PREFS);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inboxEvents, setInboxEvents] = useState<InboxNotifEvent[]>([]);
  const [inboxPrefs, setInboxPrefs] = useState<InboxNotifPrefs>({ events: {}, digest: "morning", dndStart: null, dndEnd: null });

  const sfetch = useSafeFetch();

  // Load preferences from API
  useEffect(() => {
    type Resp = {
      preferences?: Record<string, { email?: boolean; inApp?: boolean; slack?: boolean }>;
      slackWebhook?: string;
    };
    sfetch<Resp>("/api/notifications/preferences", {
      errorMessage: "Failed to load notification preferences",
    }).then(({ data }) => {
      if (data?.preferences) {
        const saved = data.preferences;
        setPrefs(DEFAULT_PREFS.map((p) => ({
          ...p,
          email: saved[p.key]?.email ?? p.email,
          inApp: saved[p.key]?.inApp ?? p.inApp,
          slack: saved[p.key]?.slack ?? p.slack,
        })));
      }
      if (data?.slackWebhook) setSlackWebhook(data.slackWebhook);
      setLoading(false);
    });
  }, [sfetch]);

  // Load the inbox notification prefs (folded in). Best-effort — the section just
  // stays hidden if the catalog can't load; the rest of the page is unaffected.
  useEffect(() => {
    type R = { events?: InboxNotifEvent[]; prefs?: InboxNotifPrefs };
    sfetch<R>("/api/inbox/notifications", { errorMessage: "Failed to load inbox notification preferences" })
      .then(({ data }) => {
        if (data?.events) setInboxEvents(data.events);
        if (data?.prefs) setInboxPrefs(data.prefs);
      });
  }, [sfetch]);

  // Inbox prefs auto-save (matches the general matrix's click-to-save pattern),
  // through their own endpoint.
  const saveInbox = useCallback(async (next: InboxNotifPrefs) => {
    setInboxPrefs(next);
    await sfetch("/api/inbox/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      errorMessage: "Failed to save inbox notification preferences",
    });
  }, [sfetch]);
  const inboxEventEnabled = (e: InboxNotifEvent): boolean => {
    const v = inboxPrefs.events[e.id];
    return typeof v === "boolean" ? v : e.default;
  };

  /**
   * CLE-14 — the single PUT path shared by the Save button, the channel
   * toggles, and the chat action. Returns {ok,error?} so the action run can
   * report without re-reading the form or duplicating the fetch.
   */
  const putPreferences = useCallback(
    async (updatedPrefs: NotificationPref[]): Promise<{ ok: boolean; error?: string }> => {
      setSaving(true);
      const preferences: Record<string, { email: boolean; inApp: boolean; slack: boolean }> = {};
      for (const p of updatedPrefs) {
        preferences[p.key] = { email: p.email, inApp: p.inApp, slack: p.slack };
      }
      const { error } = await sfetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences, slackWebhook }),
        errorMessage: "Failed to save notification preferences",
      });
      setSaving(false);
      return error ? { ok: false, error } : { ok: true };
    },
    [slackWebhook, sfetch],
  );

  // Save preferences to API (whole-form; keeps the existing void signature for
  // the Slack Save button + toggles which don't read the result).
  const save = useCallback(async (updatedPrefs: NotificationPref[]) => {
    await putPreferences(updatedPrefs);
  }, [putPreferences]);

  function toggle(key: string, channel: "email" | "inApp" | "slack") {
    const updated = prefs.map((p) =>
      p.key === key ? { ...p, [channel]: !p[channel] } : p
    );
    setPrefs(updated);
    save(updated);
  }

  /**
   * CLE-14 — flip ONE channel on ONE preference to an explicit value, then PUT
   * the resulting map (no whole-form re-read). Used by the chat action; mirrors
   * what `toggle` does for a click. Unknown key -> {ok:false}, no PUT.
   */
  const setNotificationPref = useCallback(
    async (
      key: string,
      channel: "email" | "inApp" | "slack",
      enabled: boolean,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!prefs.some((p) => p.key === key)) {
        return { ok: false, error: `Unknown notification "${key}".` };
      }
      const updated = prefs.map((p) => (p.key === key ? { ...p, [channel]: enabled } : p));
      setPrefs(updated);
      return putPreferences(updated);
    },
    [prefs, putPreferences],
  );

  // CLE-14: register this page's one SAFE config action. Reuses
  // setNotificationPref, which PUTs through the same endpoint the toggles use.
  const notificationActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "settings.updateNotificationPrefs",
        title: "Update a notification preference",
        description:
          "Enable or disable one notification channel (email, inApp, or slack) for one notification type " +
          "(key, e.g. deal_risk, deal_won, task_due, sequence_reply). Use when the user wants to turn a " +
          "specific notification on or off on a given channel.",
        params: z.object({
          key: z.string().min(1),
          channel: z.enum(["email", "inApp", "slack"]),
          enabled: z.boolean(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ key, channel, enabled }): Promise<PageActionResult> => {
          const r = await setNotificationPref(key, channel, enabled);
          return r.ok
            ? okResult(`${enabled ? "Enabled" : "Disabled"} ${channel} notifications for ${key}.`)
            : errResult(r.error ?? "Couldn't update the notification preference.");
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNotificationPref],
  );
  useRegisterPageActions(notificationActions);

  const categories = [...new Set(prefs.map((p) => p.category))];
  const slackConnected = !!slackWebhook;

  return (
    <>
      <SettingsHeader
        title="Notifications"
        subtitle="Choose your preferred notification settings for in-app, email, and Slack."
      />

      {/* Slack webhook config */}
      <Card className="mt-4">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>Slack Integration</p>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                {slackConnected
                  ? "Connected. Notifications will be sent to your Slack channel."
                  : "Add a Slack webhook URL to receive notifications in Slack."}
              </p>
            </div>
            {slackConnected && (
              <Badge variant="success">Connected</Badge>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="flex-1"
            />
            <Button
              variant="solid"
              size="md"
              onClick={() => save(prefs)}
              loading={saving}
            >
              Save
            </Button>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />)}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <div className="flex items-center gap-4 pb-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <span className="flex-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  {category}
                </span>
                <span className="w-14 text-center text-[10px]" style={{ color: "var(--color-text-muted)" }}>Slack</span>
                <span className="w-14 text-center text-[10px]" style={{ color: "var(--color-text-muted)" }}>Email</span>
                <span className="w-14 text-center text-[10px]" style={{ color: "var(--color-text-muted)" }}>In-app</span>
              </div>
              <div className="space-y-0.5">
                {prefs
                  .filter((p) => p.category === category)
                  .map((pref) => (
                    <div key={pref.key} className="flex items-center gap-4 rounded-md px-2 py-2.5">
                      <div className="flex-1">
                        <p className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{pref.label}</p>
                        <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{pref.description}</p>
                      </div>
                      {/* Slack toggle */}
                      <div className="flex w-14 justify-center">
                        {slackConnected ? (
                          <Toggle checked={pref.slack} onChange={() => toggle(pref.key, "slack")} />
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>--</span>
                        )}
                      </div>
                      {/* Email toggle */}
                      <div className="flex w-14 justify-center">
                        <Toggle checked={pref.email} onChange={() => toggle(pref.key, "email")} />
                      </div>
                      {/* In-app toggle */}
                      <div className="flex w-14 justify-center">
                        <Toggle checked={pref.inApp} onChange={() => toggle(pref.key, "inApp")} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inbox — folded in from the retired /settings/inbox-notifications page:
          per-event opt-in + digest cadence + quiet hours. Saved live to its own
          store; the section stays hidden until its catalog loads. */}
      {inboxEvents.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-4 pb-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
            <span className="flex-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Inbox
            </span>
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Choose what&apos;s worth interrupting you for in the inbox, when to get a digest, and quiet hours.
          </p>

          <div className="mt-3 divide-y" style={{ borderColor: "var(--color-border-default)" }}>
            {inboxEvents.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px]" style={{ color: "var(--color-text-primary)" }}>{e.label}</span>
                  <span className="block text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{e.description}</span>
                </span>
                <input
                  type="checkbox"
                  checked={inboxEventEnabled(e)}
                  onChange={() => saveInbox({ ...inboxPrefs, events: { ...inboxPrefs.events, [e.id]: !inboxEventEnabled(e) } })}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
              </label>
            ))}
          </div>

          <div className="mt-4">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Digest</span>
            <div className="mt-2 flex gap-1.5">
              {INBOX_DIGEST_OPTIONS.map((o) => {
                const selected = inboxPrefs.digest === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => saveInbox({ ...inboxPrefs, digest: o.value })}
                    className="rounded-md border px-2.5 py-1 text-[12px]"
                    style={{
                      borderColor: "var(--color-border-default)",
                      background: selected ? "var(--color-accent)" : "transparent",
                      color: selected ? "var(--color-accent-foreground, #fff)" : "var(--color-text-secondary)",
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Do not disturb</span>
            <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              <span>From</span>
              <input
                type="time"
                value={inboxPrefs.dndStart ?? ""}
                onChange={(e) => saveInbox({ ...inboxPrefs, dndStart: e.target.value || null })}
                className="rounded-md border px-2 py-1 text-[12px] outline-none"
                style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-primary)" }}
              />
              <span>to</span>
              <input
                type="time"
                value={inboxPrefs.dndEnd ?? ""}
                onChange={(e) => saveInbox({ ...inboxPrefs, dndEnd: e.target.value || null })}
                className="rounded-md border px-2 py-1 text-[12px] outline-none"
                style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-primary)" }}
              />
              <span style={{ color: "var(--color-text-muted)" }}>(wraps past midnight)</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
