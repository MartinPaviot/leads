"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input, Toggle } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSafeFetch } from "@/lib/infra/use-safe-fetch";

interface NotificationPref {
  key: string;
  label: string;
  description: string;
  category: string;
  email: boolean;
  inApp: boolean;
  slack: boolean;
}

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

  // Save preferences to API
  const save = useCallback(async (updatedPrefs: NotificationPref[]) => {
    setSaving(true);
    const preferences: Record<string, { email: boolean; inApp: boolean; slack: boolean }> = {};
    for (const p of updatedPrefs) {
      preferences[p.key] = { email: p.email, inApp: p.inApp, slack: p.slack };
    }
    await sfetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences, slackWebhook }),
      errorMessage: "Failed to save notification preferences",
    });
    setSaving(false);
  }, [slackWebhook, sfetch]);

  function toggle(key: string, channel: "email" | "inApp" | "slack") {
    const updated = prefs.map((p) =>
      p.key === key ? { ...p, [channel]: !p[channel] } : p
    );
    setPrefs(updated);
    save(updated);
  }

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
    </>
  );
}
