"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";

export default function WorkspaceSettingsPage() {
  const [name, setName] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/workspace")
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setDomains(data.companyDomains || []);
      })
      .catch(console.error);
  }, []);

  async function saveName() {
    if (!name.trim()) return;
    try {
      await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      console.error("Failed to save");
    }
  }

  async function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d || domains.includes(d)) return;
    const updated = [...domains, d];
    setDomains(updated);
    setNewDomain("");
    await fetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyDomains: updated }),
    }).catch(console.error);
  }

  async function removeDomain(domain: string) {
    const updated = domains.filter((d) => d !== domain);
    setDomains(updated);
    await fetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyDomains: updated }),
    }).catch(console.error);
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Workspace settings</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Manage settings for your entire workspace.
      </p>

      <div className="mt-6 space-y-6">
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
                    Schedule workspace to be permanently deleted
                  </p>
                </div>
                <Button variant="destructive" size="sm">
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
