"use client";

/**
 * Add-to-list modal — opened from the Accounts bulk-actions bar once one or
 * more accounts are checked. Two paths in one surface:
 *   - create a brand-new list from the selection (type a name), or
 *   - drop the selection into an existing list (click it).
 * The page owns the network + refetch; this component is presentational and
 * reports the chosen action through onCreate / onAddToExisting.
 */

import { useState } from "react";
import { Loader2, Plus, ListPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AccountList {
  id: string;
  name: string;
  count: number;
}

export function AddToListModal({
  open,
  onClose,
  selectedCount,
  lists,
  busy,
  onCreate,
  onAddToExisting,
}: {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  lists: AccountList[];
  busy: boolean;
  onCreate: (name: string) => void;
  onAddToExisting: (listId: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const accountLabel = `${selectedCount} account${selectedCount === 1 ? "" : "s"}`;

  return (
    <Modal open={open} onClose={onClose} title="Add to a list" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          Save {accountLabel} into a list you can reopen from the Accounts filter bar.
        </p>

        {/* Create a new list from the selection */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && !busy) onCreate(trimmed);
          }}
        >
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            New list
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hot leads Q3"
                maxLength={120}
                autoFocus
                className="w-full"
              />
            </div>
            <Button type="submit" variant="gradient" size="sm" icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} disabled={!trimmed || busy}>
              Create
            </Button>
          </div>
        </form>

        {lists.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                Add to existing
              </span>
              <span className="h-px flex-1" style={{ background: "var(--color-border-default)" }} />
            </div>
            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {lists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onAddToExisting(l.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <ListPlus size={14} style={{ color: "var(--color-text-tertiary)" }} />
                  <span className="flex-1 truncate">{l.name}</span>
                  <span className="shrink-0 tabular-nums text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {l.count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
