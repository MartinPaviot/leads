"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Video } from "lucide-react";
import { useSafeFetch } from "@/lib/infra/use-safe-fetch";

type RecordingPolicy = "branded" | "always_silent" | "per_meeting_choice";
type OptOutReason = "internal_only" | "client_confidential" | "regulatory" | "other";

type WorkspaceResponse = {
  settings?: {
    recordingEnabled?: boolean;
    recordingBotName?: string;
    recordingPolicy?: RecordingPolicy;
    recordingOptOutReason?: OptOutReason | null;
    primaryDomain?: string | null;
    domainAliases?: string[];
  };
};

const POLICY_OPTIONS: Array<{ value: RecordingPolicy; title: string; helper: string }> = [
  {
    value: "branded",
    title: "Branded (recommended)",
    helper: "Le bot rejoint sous le nom de votre workspace avec la mention « via Elevay » pour les meetings externes. Meetings internes : mode silencieux automatique.",
  },
  {
    value: "always_silent",
    title: "Always silent",
    helper: "Le bot rejoint toujours sous le nom « Notes », sans marque Elevay. Utile pour secteurs régulés.",
  },
  {
    value: "per_meeting_choice",
    title: "Per-meeting choice",
    helper: "Par défaut branded, avec option de désactiver la marque meeting par meeting (UI à venir).",
  },
];

const REASON_OPTIONS: Array<{ value: OptOutReason; label: string }> = [
  { value: "internal_only", label: "Usage interne uniquement" },
  { value: "client_confidential", label: "Clients confidentiels" },
  { value: "regulatory", label: "Secteur régulé (finance, santé)" },
  { value: "other", label: "Autre" },
];

export default function RecordingSettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [botName, setBotName] = useState("Elevay Notetaker");
  const [policy, setPolicy] = useState<RecordingPolicy>("branded");
  const [optOutReason, setOptOutReason] = useState<OptOutReason | null>(null);
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [domainAliasesInput, setDomainAliasesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sfetch = useSafeFetch();

  useEffect(() => {
    sfetch<WorkspaceResponse>("/api/settings/workspace", {
      errorMessage: "Failed to load recording settings",
    }).then(({ data }) => {
      if (data?.settings) {
        setEnabled(data.settings.recordingEnabled !== false);
        setBotName(data.settings.recordingBotName || "Elevay Notetaker");
        setPolicy(data.settings.recordingPolicy || "branded");
        setOptOutReason(data.settings.recordingOptOutReason ?? null);
        setPrimaryDomain(data.settings.primaryDomain || "");
        setDomainAliasesInput((data.settings.domainAliases || []).join(", "));
      }
    });
  }, [sfetch]);

  const needsReason = policy === "always_silent";
  const canSave = !saving && (!needsReason || !!optOutReason);

  async function handleSave() {
    setSaving(true);
    const aliases = domainAliasesInput
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    const { error } = await sfetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordingEnabled: enabled,
        recordingBotName: botName.trim(),
        recordingPolicy: policy,
        recordingOptOutReason: needsReason ? optOutReason : null,
        primaryDomain: primaryDomain.trim() || null,
        domainAliases: aliases,
      }),
      errorMessage: "Failed to save recording settings",
    });
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  return (
    <>
      <SettingsHeader
        title="Recording"
        subtitle="Configure automatic meeting recording, transcription, and branding policy."
      />

      <div className="mt-8 space-y-6">
        {/* Toggle */}
        <div
          className="flex items-center justify-between rounded-lg p-4"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: "var(--color-bg-hover)" }}
            >
              <Video size={16} style={{ color: "var(--color-text-secondary)" }} />
            </div>
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                Auto-record meetings
              </p>
              <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                A bot joins your meetings to record and transcribe automatically.
              </p>
            </div>
          </div>
          <button
            aria-label="Toggle recording"
            onClick={() => setEnabled(!enabled)}
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ background: enabled ? "var(--color-accent)" : "var(--color-bg-emphasis)" }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ left: enabled ? 22 : 2 }}
            />
          </button>
        </div>

        {/* Bot name */}
        <div>
          <Input
            label="Bot display name"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="Elevay Notetaker"
            disabled={!enabled}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            This name appears when the bot joins external meetings. The « (via Elevay) » wedge is appended automatically.
          </p>
        </div>

        {/* Branding policy */}
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Branding policy
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            Controls whether external prospects see the Elevay brand in meeting recordings.
          </p>
          <div className="mt-3 space-y-2">
            {POLICY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-3"
                style={{
                  background: policy === opt.value ? "var(--color-bg-hover)" : "var(--color-bg-card)",
                  border: `1px solid ${policy === opt.value ? "var(--color-accent)" : "var(--color-border-default)"}`,
                }}
              >
                <input
                  type="radio"
                  name="recordingPolicy"
                  value={opt.value}
                  checked={policy === opt.value}
                  onChange={() => setPolicy(opt.value)}
                  disabled={!enabled}
                  className="mt-1"
                />
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {opt.title}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {opt.helper}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Opt-out reason */}
        {needsReason && (
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Reason for silent mode <span style={{ color: "var(--color-text-error, #d33)" }}>*</span>
            </p>
            <div className="mt-3 space-y-2">
              {REASON_OPTIONS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="recordingOptOutReason"
                    value={r.value}
                    checked={optOutReason === r.value}
                    onChange={() => setOptOutReason(r.value)}
                  />
                  <span style={{ color: "var(--color-text-primary)" }}>{r.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Primary domain */}
        <div>
          <Input
            label="Primary company domain"
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="acme.com"
            disabled={!enabled}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            Attendees on this domain count as internal. Defaults to your owner email domain.
          </p>
        </div>

        {/* Domain aliases */}
        <div>
          <Input
            label="Additional domains (comma-separated)"
            value={domainAliasesInput}
            onChange={(e) => setDomainAliasesInput(e.target.value)}
            placeholder="acme-eu.com, acmegroup.com"
            disabled={!enabled}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            Useful if your team spans multiple domains (subsidiaries, acquisitions). Max 10.
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button variant="solid" onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
          {saved && <Badge variant="success">Saved</Badge>}
          {needsReason && !optOutReason && (
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              Select a reason to save silent-mode policy.
            </span>
          )}
        </div>
      </div>
    </>
  );
}
