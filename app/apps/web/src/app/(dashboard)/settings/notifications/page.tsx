"use client";

import { useState } from "react";

interface NotificationPref {
  key: string;
  label: string;
  description: string;
  category: string;
  email: boolean;
  inApp: boolean;
}

const DEFAULT_PREFS: NotificationPref[] = [
  { key: "chatMessage", label: "New chat message", description: "Get notified when LeadSens takes more than 60 seconds to draft a reply.", category: "Chats", email: true, inApp: true },
  { key: "taskDue", label: "Due date reminders", description: "Get notified before a task is due.", category: "Tasks", email: false, inApp: true },
  { key: "taskAssigned", label: "Task assigned to you", description: "Get notified when someone assigns you a task.", category: "Tasks", email: true, inApp: true },
  { key: "dealRisk", label: "Deal at risk", description: "Get notified when a deal is flagged as high risk.", category: "Pipeline", email: true, inApp: true },
  { key: "enrichmentDone", label: "Enrichment complete", description: "Get notified when company/contact enrichment finishes.", category: "Prospecting", email: false, inApp: true },
  { key: "sequenceReply", label: "Sequence reply detected", description: "Get notified when a prospect replies to a sequence email.", category: "Outreach", email: true, inApp: true },
];

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPref[]>(DEFAULT_PREFS);

  function toggle(key: string, channel: "email" | "inApp") {
    setPrefs(prefs.map((p) =>
      p.key === key ? { ...p, [channel]: !p[channel] } : p
    ));
  }

  const categories = [...new Set(prefs.map((p) => p.category))];

  return (
    <>
      <h1 className="text-xl font-semibold">Notifications</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Choose your preferred notification settings for email and in-app.
      </p>

      <div className="mt-6 space-y-8">
        {categories.map((category) => (
          <div key={category}>
            <div className="flex items-center gap-4 border-b border-[rgba(255,255,255,0.08)] pb-2">
              <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {category}
              </span>
              <span className="w-16 text-center text-[10px] text-[var(--color-text-tertiary)]">Email</span>
              <span className="w-16 text-center text-[10px] text-[var(--color-text-tertiary)]">In-app</span>
            </div>
            <div className="space-y-1">
              {prefs
                .filter((p) => p.category === category)
                .map((pref) => (
                  <div key={pref.key} className="flex items-center gap-4 rounded-lg px-2 py-3">
                    <div className="flex-1">
                      <p className="text-sm text-[var(--color-text-primary)]">{pref.label}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{pref.description}</p>
                    </div>
                    <div className="flex w-16 justify-center">
                      <button
                        onClick={() => toggle(pref.key, "email")}
                        className={`h-5 w-9 rounded-full transition-colors ${
                          pref.email ? "bg-[var(--color-accent)]" : "bg-[var(--color-bg-muted)]"
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded-full bg-white transition-transform ${
                            pref.email ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex w-16 justify-center">
                      <button
                        onClick={() => toggle(pref.key, "inApp")}
                        className={`h-5 w-9 rounded-full transition-colors ${
                          pref.inApp ? "bg-[var(--color-accent)]" : "bg-[var(--color-bg-muted)]"
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded-full bg-white transition-transform ${
                            pref.inApp ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
