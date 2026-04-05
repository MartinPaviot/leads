"use client";

import { useState, useEffect } from "react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, Tag } from "@/components/ui/badge";

const CREATION_MODES = [
  { value: "disabled", label: "Disabled", desc: "Never create contacts from emails" },
  { value: "selective", label: "Selective", desc: "Only create contacts when they match your ICP" },
  { value: "always", label: "Always", desc: "Create a contact for every new email address" },
];

const BACKSYNC_OPTIONS = [
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

const DEFAULT_IGNORED_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com",
  "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "icloud.com",
  "aol.com", "protonmail.com", "proton.me", "me.com", "mail.com",
];

export default function PrivacySettingsPage() {
  const [contactCreationMode, setContactCreationMode] = useState("selective");
  const [backsyncRange, setBacksyncRange] = useState("3m");
  const [doNotTrackDomains, setDoNotTrackDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/privacy")
      .then((r) => r.json())
      .then((data) => {
        setContactCreationMode(data.contactCreationMode || "selective");
        setBacksyncRange(data.backsyncRange || "3m");
        setDoNotTrackDomains(data.doNotTrackDomains || []);
      })
      .catch(() => setError("Failed to load privacy settings"));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactCreationMode, backsyncRange, doNotTrackDomains }),
      });
      if (res.ok) {
        setSaved(true);
        setError("");
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save privacy settings");
      }
    } catch {
      setError("Failed to save privacy settings");
    } finally {
      setSaving(false);
    }
  }

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d || doNotTrackDomains.includes(d)) return;
    setDoNotTrackDomains([...doNotTrackDomains, d]);
    setNewDomain("");
  }

  function removeDomain(domain: string) {
    setDoNotTrackDomains(doNotTrackDomains.filter((d) => d !== domain));
  }

  return (
    <>
      <h1
        className="text-[24px] font-bold"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
      >
        Privacy & Sync
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Control how LeadSens captures and processes your email data.
      </p>

      <div className="mt-8 space-y-8">
        {/* Contact creation mode */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Contact creation
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            When new email addresses are detected, how should LeadSens handle them?
          </p>
          <div className="mt-3 space-y-2">
            {CREATION_MODES.map((mode) => {
              const selected = contactCreationMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setContactCreationMode(mode.value)}
                  className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors"
                  style={{
                    background: selected ? "var(--color-accent-soft)" : "var(--color-bg-card)",
                    border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border-default)"}`,
                  }}
                >
                  <div
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{
                      border: `2px solid ${selected ? "var(--color-accent)" : "var(--color-border-strong)"}`,
                    }}
                  >
                    {selected && (
                      <div className="h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} />
                    )}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {mode.label}
                    </div>
                    <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {mode.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Backsync range */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Email sync lookback
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            How far back should LeadSens import your email history when connecting a new mailbox?
          </p>
          <div className="mt-3">
            <Select
              value={backsyncRange}
              onChange={(e) => setBacksyncRange(e.target.value)}
              options={BACKSYNC_OPTIONS}
            />
          </div>
        </section>

        {/* Do not track domains */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Ignored domains
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            No company will be auto-created for these domains. Contacts and activities are still tracked.
          </p>

          {/* User-added domains */}
          {doNotTrackDomains.filter((d) => !DEFAULT_IGNORED_DOMAINS.includes(d)).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {doNotTrackDomains
                .filter((d) => !DEFAULT_IGNORED_DOMAINS.includes(d))
                .map((d) => (
                  <Tag key={d} onRemove={() => removeDomain(d)}>{d}</Tag>
                ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
              placeholder="Add domain (e.g. newsletter.com)"
              className="flex-1"
            />
            <Button variant="solid" onClick={addDomain} disabled={!newDomain.trim()}>
              Add
            </Button>
          </div>

          {/* Default excluded providers */}
          <p className="mt-4 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {DEFAULT_IGNORED_DOMAINS.length} personal email providers (gmail.com, outlook.com, yahoo.com...) are automatically ignored for company creation.
          </p>
        </section>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="solid" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
          {saved && <Badge variant="success">Saved</Badge>}
          {error && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
        </div>
      </div>
    </>
  );
}
