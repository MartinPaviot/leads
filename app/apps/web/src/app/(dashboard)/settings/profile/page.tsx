"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Mail } from "lucide-react";

export default function ProfileSettingsPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings/profile");
        if (!r.ok) {
          // Was `.then(r => r.json())` with no status check: a 500's error body
          // parsed into empty fields, so the form rendered blank with no error.
          setError("Failed to load profile");
          setLoaded(true);
          return;
        }
        const data = await r.json();
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setEmail(data.email || "");
        setLanguage(data.language || "en");
        setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        setLoaded(true);
      } catch {
        setError("Failed to load profile");
        setLoaded(true);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), language, timezone }),
      });
      if (res.ok) {
        setSaved(true);
        setError("");
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save profile");
      }
    } catch {
      setError("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    // Skeleton (not a blank pane) while the profile loads, matching the form's shape.
    return (
      <>
        <SettingsHeader title="Profile" subtitle="Manage settings for your personal profile." />
        <div className="space-y-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <SettingsHeader
        title="Profile"
        subtitle="Manage settings for your personal profile."
      />

      <div className="space-y-5">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Input label="Email" value={email} disabled />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg px-3 py-1.5 text-[12px] outline-none"
              style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
            >
              <option value="en">English</option>
              <option value="fr">Fran\u00e7ais</option>
              <option value="de">Deutsch</option>
              <option value="es">Espa\u00f1ol</option>
              <option value="pt">Portugu\u00eas</option>
              <option value="it">Italiano</option>
              <option value="nl">Nederlands</option>
              <option value="ja">\u65e5\u672c\u8a9e</option>
              <option value="ko">\ud55c\uad6d\uc5b4</option>
              <option value="zh">\u4e2d\u6587</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg px-3 py-1.5 text-[12px] outline-none"
              style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
            >
              {Intl.supportedValuesOf?.("timeZone")?.map((tz: string) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              )) || [
                "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai",
                "Australia/Sydney", "Pacific/Auckland",
              ].map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="solid" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Update"}
          </Button>
          {saved && <Badge variant="success">Saved</Badge>}
          {error && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
        </div>
      </div>

      {/* Email & Calendar — link to dedicated page */}
      <section className="mt-12">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Email & Calendar
        </h2>
        <Link
          href="/settings/mail-calendar"
          className="mt-3 flex items-center gap-3 rounded-lg p-4 transition-colors"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--color-bg-hover)" }}>
            <Mail size={16} style={{ color: "var(--color-text-secondary)" }} />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Mail & Calendar settings
            </p>
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Manage connected accounts, sync preferences, and sending settings.
            </p>
          </div>
          <span className="text-[12px]" style={{ color: "var(--color-accent)" }}>&rarr;</span>
        </Link>
      </section>
    </>
  );
}
