"use client";

import { useEffect, useState } from "react";

interface Member {
  id: string;
  name: string;
  isSelf?: boolean;
}

/**
 * Reusable "who is responsible" picker — a workspace-member dropdown over
 * `/api/settings/members`. Used to assign an owner on create and to reassign on
 * the detail pages (opportunities now; accounts/contacts next). Ownership =
 * accountability, not visibility (data stays shared); pairs with collision
 * awareness so a teammate can see who holds a prospect.
 *
 * `defaultToSelf` auto-selects the current user once the members load (for the
 * create form, where a new record defaults to its creator). Fail-soft: if the
 * members fetch fails the control simply shows "Unassigned" and stays usable.
 */
export function OwnerSelect({
  value,
  onChange,
  defaultToSelf = false,
  disabled = false,
  className = "",
  ariaLabel = "Owner",
}: {
  value: string | null;
  onChange: (ownerId: string | null) => void;
  defaultToSelf?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/members")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const list = ((d?.members ?? []) as Member[]).filter((m) => m.id);
        setMembers(list);
        setLoaded(true);
        if (defaultToSelf && !value) {
          const self = list.find((m) => m.isSelf);
          if (self) onChange(self.id);
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
    // Mount-only: members don't change within a form session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled || !loaded}
      className={`rounded-md border px-2.5 py-1.5 text-[13px] ${className}`}
      style={{
        borderColor: "var(--color-border-default)",
        background: "var(--color-bg-base)",
        color: "var(--color-text-primary)",
      }}
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {m.isSelf ? " (you)" : ""}
        </option>
      ))}
    </select>
  );
}
