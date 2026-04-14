"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { DestructiveConfirm } from "@/components/ui/destructive-confirm";

/**
 * `/settings/privacy` — GDPR controls (T1 P2 N1).
 *
 * - Data export: downloads a JSON with the authenticated user's auth
 *   profile + all tenant-scoped records they can see.
 * - Delete account: requires typing "DELETE" in the confirm modal; on
 *   success the user is signed out and sent back to the marketing page.
 */
export default function PrivacyPage() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/gdpr/export");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast(data.error ?? "Export failed.", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `elevay-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Export ready. Check your downloads.", "success");
    } catch (err) {
      console.warn("privacy: export failed", err);
      toast("Network error. Try again.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast(data.error ?? "Deletion failed. Contact support.", "error");
        return;
      }
      await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
      window.location.href = "/";
    } catch (err) {
      console.warn("privacy: delete failed", err);
      toast("Network error. Try again.", "error");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[18px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Privacy &amp; data
        </h1>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Export your data or permanently delete your Elevay account.
        </p>
      </header>

      <section
        className="flex items-start justify-between gap-4 rounded-xl p-5"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
      >
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Export your data
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Download a JSON archive of your profile, contacts, companies, deals, activities,
            notes, and tasks. Satisfies the GDPR Subject Access Request.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{
            background: "var(--color-bg-page)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <Download size={13} />
          {exporting ? "Preparing…" : "Download JSON"}
        </button>
      </section>

      <section
        className="flex items-start justify-between gap-4 rounded-xl p-5"
        style={{ background: "var(--color-bg-card)", border: "1px solid rgba(220,38,38,0.25)" }}
      >
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-error, #b91c1c)" }}>
            Delete account
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Permanently remove your auth profile, sessions, and app user. Workspace data shared
            with the team stays — a separate &quot;delete workspace&quot; action handles the full erase.
            This cannot be undone.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: "var(--color-error, #b91c1c)" }}
        >
          <Trash2 size={13} />
          Delete account
        </button>
      </section>

      <DestructiveConfirm
        open={confirmOpen}
        title="Delete your Elevay account?"
        description="This permanently removes your profile, sessions, and app user. Shared workspace data stays."
        confirmLabel="Delete account"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
