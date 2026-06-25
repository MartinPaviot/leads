"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { processWorkspaceLogoFile, LOGO_FILE_ACCEPT } from "@/lib/logo/client-logo-file";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* CLE-14: page-action helpers (pure, shared) */
const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });
function definePageAction<P>(a: PageAction<P>): PageAction { return a as unknown as PageAction; }

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
      // Was `.then(r => r.json())` with no status check: a 500's error body
      // parsed into empty fields, so the form rendered blank with no error.
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load workspace settings");
        return r.json();
      })
      .then((data) => {
        setName(data.name || "");
        setDomains(data.companyDomains || []);
        setLogoUrl(data.logoUrl || null);
      })
      .catch(() => setError("Failed to load workspace settings"));
  }, []);

  /** Extract a human message from an error response. Routes answer with
   * either `{ error: "..." }` (validation) or `{ error: { message } }`
   * (requirePermission 403) — handle both so a denied member sees
   * "Missing permission: settings:write", never "[object Object]". */
  async function readApiError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    const err = body?.error;
    if (typeof err === "string" && err) return err;
    if (typeof err?.message === "string" && err.message) return err.message;
    return fallback;
  }

  /**
   * CLE-14 — the single PUT path for the workspace name, shared by the Update
   * button and the chat action. Updates local state so the input reflects the
   * saved value, returns {ok,error?} so the action run can report without
   * duplicating the fetch. On failure it surfaces via the page's error banner.
   */
  const saveWorkspaceName = useCallback(
    async (next: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = next.trim();
      if (!trimmed) return { ok: false, error: "A workspace name is required." };
      setError("");
      try {
        const res = await fetch("/api/settings/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) throw new Error(await readApiError(res, "Failed to save workspace name"));
        setName(trimmed);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save workspace name";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [],
  );

  async function saveName() {
    await saveWorkspaceName(name);
  }

  // CLE-14: register this page's one SAFE config action (rename only — the
  // danger-zone delete stays human-bound and disabled). Reuses saveWorkspaceName.
  const workspaceActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "settings.updateWorkspaceName",
        title: "Rename the workspace",
        description:
          "Change the workspace's display name (shown in the sidebar and across the app). " +
          "Use when the user wants to rename their workspace/organisation.",
        params: z.object({ name: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ name: next }): Promise<PageActionResult> => {
          const trimmed = next.trim();
          if (!trimmed) return errResult("A workspace name is required.");
          const r = await saveWorkspaceName(trimmed);
          return r.ok ? okResult(`Workspace renamed to "${trimmed}".`) : errResult(r.error ?? "Failed to rename the workspace.");
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveWorkspaceName],
  );
  useRegisterPageActions(workspaceActions);

  async function saveLogo(logoDataUrl: string | null) {
    const res = await fetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoDataUrl }),
    });
    if (!res.ok) throw new Error(await readApiError(res, "Failed to save logo"));
    // Re-read so the preview gets the fresh versioned URL… (guard res.ok: a
    // failed re-read used to parse an error body and blank the logo).
    const reread = await fetch("/api/settings/workspace");
    if (reread.ok) {
      const data = await reread.json();
      setLogoUrl(data.logoUrl || null);
    }
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

  /** Optimistic domains write — reverts the local list when the server
   * refuses (403 for non-admins, 500), instead of lying with kept state. */
  async function saveDomains(updated: string[], previous: string[], fallback: string) {
    setDomains(updated);
    setError("");
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyDomains: updated }),
      });
      if (!res.ok) throw new Error(await readApiError(res, fallback));
    } catch (err) {
      setDomains(previous);
      setError(err instanceof Error ? err.message : fallback);
    }
  }

  async function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d || domains.includes(d)) return;
    setNewDomain("");
    await saveDomains([...domains, d], domains, "Failed to save domain");
  }

  async function removeDomain(domain: string) {
    await saveDomains(domains.filter((x) => x !== domain), domains, "Failed to remove domain");
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
            <Avatar src={logoUrl} name={name || "Workspace"} size="lg" shape="square" />
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
