"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { processWorkspaceLogoFile, LOGO_FILE_ACCEPT } from "@/lib/logo/client-logo-file";

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoSaved, setLogoSaved] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/workspace")
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setDomains(data.companyDomains || []);
        setLogoUrl(data.logoUrl || null);
      })
      .catch(() => setError("Failed to load workspace settings"));
  }, []);

  async function saveName() {
    if (!name.trim()) return;
    setError("");
    try {
      await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save workspace name");
    }
  }

  async function saveLogo(logoDataUrl: string | null) {
    const res = await fetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoDataUrl }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to save logo");
    }
    // Re-read so the preview gets the fresh versioned URL…
    const data = await fetch("/api/settings/workspace").then((r) => r.json());
    setLogoUrl(data.logoUrl || null);
    // …and re-render the server layout so the sidebar picks it up now.
    router.refresh();
    setLogoSaved(true);
    setTimeout(() => setLogoSaved(false), 2000);
  }

  async function onLogoFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setLogoError("");
    setLogoSaving(true);
    try {
      const dataUrl = await processWorkspaceLogoFile(file);
      await saveLogo(dataUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoSaving(false);
    }
  }

  async function removeLogo() {
    setLogoError("");
    setLogoSaving(true);
    try {
      await saveLogo(null);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoSaving(false);
    }
  }

  async function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d || domains.includes(d)) return;
    const updated = [...domains, d];
    setDomains(updated);
    setNewDomain("");
    setError("");
    try {
      await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyDomains: updated }),
      });
    } catch {
      setError("Failed to save domain");
    }
  }

  async function removeDomain(domain: string) {
    const updated = domains.filter((d) => d !== domain);
    setDomains(updated);
    setError("");
    try {
      await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyDomains: updated }),
      });
    } catch {
      setError("Failed to remove domain");
    }
  }

  return (
    <>
      <SettingsHeader
        title="Workspace settings"
        subtitle="Manage settings for your entire workspace."
      />

      <div className="space-y-6">
        <div>
          <label className="text-sm text-[var(--color-text-secondary)]">Workspace name</label>
          <div className="mt-1 flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="solid"
              onClick={saveName}
              disabled={!name.trim()}
            >
              Update
            </Button>
          </div>
          {saved && <p className="mt-1 text-xs text-green-400">Saved</p>}
          {error && <p className="mt-1 text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
        </div>

        <div>
          <label className="text-sm text-[var(--color-text-secondary)]">Workspace logo</label>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            Shown in the sidebar instead of the workspace initials. PNG, JPEG, WebP or SVG.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Avatar src={logoUrl} name={name || "Workspace"} size="lg" />
            <input
              ref={logoInputRef}
              type="file"
              accept={LOGO_FILE_ACCEPT}
              className="hidden"
              onChange={onLogoFilePicked}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoSaving}
            >
              {logoSaving ? "Saving..." : logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {logoUrl && (
              <Button variant="ghost" size="sm" onClick={removeLogo} disabled={logoSaving}>
                Remove
              </Button>
            )}
          </div>
          {logoSaved && <p className="mt-1 text-xs text-green-400">Saved</p>}
          {logoError && <p className="mt-1 text-[12px]" style={{ color: "var(--color-error)" }}>{logoError}</p>}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Domains</h2>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            These domains will be associated with your company. No new accounts will be
            created for companies with these domains.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {domains.map((domain) => (
              <Tag key={domain} onRemove={() => removeDomain(domain)}>
                {domain}
              </Tag>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
              placeholder="Add domain (e.g. yourcompany.com)"
              className="flex-1"
            />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: "24px" }}>
          <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
          <Card className="mt-3" style={{ border: "1px solid var(--color-error-soft)", background: "rgba(239,68,68,0.03)" }}>
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--color-text-primary)]">Delete workspace</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Contact support to delete your workspace.
                  </p>
                </div>
                <Button variant="destructive" size="sm" disabled>
                  Delete workspace
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
