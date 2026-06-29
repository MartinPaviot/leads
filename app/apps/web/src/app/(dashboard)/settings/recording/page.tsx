"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Video } from "lucide-react";
import { useSafeFetch } from "@/lib/infra/use-safe-fetch";
import { useT } from "@/lib/i18n/locale";

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

// Option labels live as message KEYS (these consts are module-level, so they
// can't call the useT hook); the component resolves them with t() at render.
const POLICY_OPTIONS: Array<{ value: RecordingPolicy; titleKey: string; helperKey: string }> = [
  { value: "branded", titleKey: "settings.recording.policy.branded.title", helperKey: "settings.recording.policy.branded.helper" },
  { value: "always_silent", titleKey: "settings.recording.policy.silent.title", helperKey: "settings.recording.policy.silent.helper" },
  { value: "per_meeting_choice", titleKey: "settings.recording.policy.perMeeting.title", helperKey: "settings.recording.policy.perMeeting.helper" },
];

const REASON_OPTIONS: Array<{ value: OptOutReason; labelKey: string }> = [
  { value: "internal_only", labelKey: "settings.recording.reason.internalOnly" },
  { value: "client_confidential", labelKey: "settings.recording.reason.clientConfidential" },
  { value: "regulatory", labelKey: "settings.recording.reason.regulatory" },
  { value: "other", labelKey: "settings.recording.reason.other" },
];

export default function RecordingSettingsPage() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);
  const [botName, setBotName] = useState("Elevay Notetaker");
  const [policy, setPolicy] = useState<RecordingPolicy>("branded");
  const [optOutReason, setOptOutReason] = useState<OptOutReason | null>(null);
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [domainAliasesInput, setDomainAliasesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Whether a notetaker (Recall) is actually configured. Without it the bot
  // never joins, so the "records automatically" copy must not promise it.
  const [notetakerOn, setNotetakerOn] = useState(true);

  const sfetch = useSafeFetch();

  useEffect(() => {
    fetch("/api/features")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Fail CLOSED: if we can't confirm Recall is configured, assume it's OFF
        // so the "records automatically" copy never over-promises a bot join.
        if (d && typeof d.recallai === "boolean") setNotetakerOn(d.recallai);
        else setNotetakerOn(false);
      })
      .catch(() => setNotetakerOn(false));
  }, []);

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
        title={t("settings.recording.title")}
        subtitle={t("settings.recording.subtitle")}
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
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {t("settings.recording.autoRecord")}
                </p>
                {!notetakerOn && <Badge variant="warning" size="sm">{t("common.notConfigured")}</Badge>}
              </div>
              <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                {notetakerOn
                  ? t("settings.recording.autoRecordOn")
                  : t("settings.recording.autoRecordOff")}
              </p>
            </div>
          </div>
          <button
            aria-label={t("settings.recording.toggleAria")}
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
            label={t("settings.recording.botNameLabel")}
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="Elevay Notetaker"
            disabled={!enabled}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {t("settings.recording.botNameHelper")}
          </p>
        </div>

        {/* Branding policy */}
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {t("settings.recording.brandingPolicy")}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {t("settings.recording.brandingHelper")}
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
                    {t(opt.titleKey)}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {t(opt.helperKey)}
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
              {t("settings.recording.reasonTitle")} <span style={{ color: "var(--color-text-error, #d33)" }}>*</span>
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
                  <span style={{ color: "var(--color-text-primary)" }}>{t(r.labelKey)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Primary domain */}
        <div>
          <Input
            label={t("settings.recording.primaryDomainLabel")}
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="acme.com"
            disabled={!enabled}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {t("settings.recording.primaryDomainHelper")}
          </p>
        </div>

        {/* Domain aliases */}
        <div>
          <Input
            label={t("settings.recording.aliasesLabel")}
            value={domainAliasesInput}
            onChange={(e) => setDomainAliasesInput(e.target.value)}
            placeholder="acme-eu.com, acmegroup.com"
            disabled={!enabled}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {t("settings.recording.aliasesHelper")}
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button variant="solid" onClick={handleSave} disabled={!canSave}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          {saved && <Badge variant="success">{t("common.saved")}</Badge>}
          {needsReason && !optOutReason && (
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {t("settings.recording.selectReason")}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
