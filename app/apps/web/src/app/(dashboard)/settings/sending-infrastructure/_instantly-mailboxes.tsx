"use client";

/**
 * Instantly mailbox assignment (one shared workspace, boxes belong to different
 * reps). Lists the imported Instantly mailboxes and assigns each to the rep who
 * owns it — that rep then sees the box in their personal inbox. Admin-only
 * surface (the parent page is admin-gated). Per-row picker + bulk-assign,
 * because there can be dozens of boxes.
 */

import { useCallback, useEffect, useState } from "react";
import { OwnerSelect } from "@/components/owner-select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface Box {
  id: string;
  emailAddress: string;
  displayName: string | null;
  ownerId: string | null;
  ownerEmail: string | null;
}

const ENDPOINT = "/api/settings/sending-infra/providers/instantly/mailboxes";

export function InstantlyMailboxes() {
  const { toast } = useToast();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT);
      if (res.ok) {
        const d = (await res.json()) as { mailboxes: Box[] };
        setBoxes(d.mailboxes ?? []);
      }
    } catch {
      /* fail-soft: section stays empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchOwner(mailboxId: string, ownerId: string | null): Promise<boolean> {
    try {
      const res = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId, ownerId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function assignOne(mailboxId: string, ownerId: string | null) {
    setBoxes((prev) => prev.map((b) => (b.id === mailboxId ? { ...b, ownerId } : b)));
    const ok = await patchOwner(mailboxId, ownerId);
    if (!ok) {
      toast("Couldn't assign that mailbox — reloading.", "error");
      void load();
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === boxes.length ? new Set() : new Set(boxes.map((b) => b.id))));
  }

  async function applyBulk() {
    if (selected.size === 0) return;
    setBusy(true);
    const ids = [...selected];
    setBoxes((prev) => prev.map((b) => (selected.has(b.id) ? { ...b, ownerId: bulkOwner } : b)));
    let failed = 0;
    for (const id of ids) {
      // Sequential keeps it gentle on the API; a few dozen boxes is fine.
      // eslint-disable-next-line no-await-in-loop
      if (!(await patchOwner(id, bulkOwner))) failed++;
    }
    setBusy(false);
    setSelected(new Set());
    if (failed > 0) {
      toast(`${ids.length - failed} assigned, ${failed} failed — reloading.`, "warning");
      void load();
    } else {
      toast(`Assigned ${ids.length} mailbox${ids.length === 1 ? "" : "es"}.`, "success");
    }
  }

  if (loading) {
    return (
      <p className="mt-4 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Loading mailboxes…
      </p>
    );
  }
  if (boxes.length === 0) {
    return (
      <p className="mt-4 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        No Instantly mailboxes imported yet — click “Import mailboxes” above.
      </p>
    );
  }

  const assignedCount = boxes.filter((b) => b.ownerId).length;
  const allSelected = selected.size === boxes.length;

  return (
    <div className="mt-5" style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: 16 }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        Imported Instantly mailboxes ({boxes.length})
      </h3>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Assign each box to the rep who owns it — they&apos;ll see it in their inbox.{" "}
        {assignedCount}/{boxes.length} assigned.
      </p>

      {/* Bulk-assign bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Select all
        </label>
        {selected.size > 0 && (
          <>
            <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              {selected.size} selected →
            </span>
            <OwnerSelect value={bulkOwner} onChange={setBulkOwner} ariaLabel="Owner for selected mailboxes" />
            <Button size="sm" onClick={() => void applyBulk()} disabled={busy}>
              {busy ? "Assigning…" : "Assign selected"}
            </Button>
          </>
        )}
      </div>

      {/* Per-box rows */}
      <div className="mt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
        {boxes.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-2 py-1.5"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <input
              type="checkbox"
              checked={selected.has(b.id)}
              onChange={() => toggleOne(b.id)}
              aria-label={`Select ${b.emailAddress}`}
            />
            <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--color-text-primary)" }}>
              {b.emailAddress}
            </span>
            <OwnerSelect
              value={b.ownerId}
              onChange={(id) => void assignOne(b.id, id)}
              ariaLabel={`Owner for ${b.emailAddress}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
