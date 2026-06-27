"use client";

/**
 * Per-thread assignment (INBOX-X01). Shows who owns the conversation and lets any
 * member (re)assign it to a teammate or unassign. Tenant-shared via
 * /api/inbox/assignment. Self-contained: fetches its own state per thread.
 */

import { useState, useEffect } from "react";
import { UserCheck } from "lucide-react";
import type { Member } from "@/lib/inbox/assignment";
import { useT } from "@/lib/i18n/locale";

export function ThreadAssignment({ conversationKey }: { conversationKey: string }) {
  const t = useT();
  const [assignee, setAssignee] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAssignee(null);
    fetch(`/api/inbox/assignment?key=${encodeURIComponent(conversationKey)}`)
      .then((r) => (r.ok ? r.json() : { assignee: null, members: [] }))
      .then((d: { assignee?: Member | null; members?: Member[] }) => {
        if (cancelled) return;
        setAssignee(d.assignee ?? null);
        if (Array.isArray(d.members)) setMembers(d.members);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationKey]);

  async function change(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (value === "") {
        await fetch(`/api/inbox/assignment?key=${encodeURIComponent(conversationKey)}`, { method: "DELETE" });
        setAssignee(null);
      } else {
        const r = await fetch("/api/inbox/assignment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: conversationKey, assigneeId: value }),
        });
        if (r.ok) {
          const d = (await r.json()) as { assignee?: Member | null };
          setAssignee(d.assignee ?? null);
        }
      }
    } catch {
      /* leave state; a reload re-syncs */
    } finally {
      setBusy(false);
    }
  }

  // No teammates to assign to → nothing to show (a solo/personal inbox).
  if (members.length < 2) return null;

  return (
    <div className="flex items-center gap-1.5">
      <UserCheck size={13} className="shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
      <select
        value={assignee?.id ?? ""}
        disabled={busy}
        onChange={(e) => void change(e.target.value)}
        className="rounded-md border px-1.5 py-0.5 text-[11px] outline-none"
        style={{
          borderColor: "var(--color-border-default)",
          background: "var(--color-bg-page)",
          color: assignee ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        }}
        aria-label={t("inbox.assignment.assignAria")}
      >
        <option value="">{t("inbox.assignment.unassigned")}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
