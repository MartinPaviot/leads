"use client";

import { useState } from "react";

interface Member {
  name: string;
  email: string;
  role: "admin" | "member";
}

export default function MembersSettingsPage() {
  const [members] = useState<Member[]>([
    { name: "Martin Paviot", email: "martin@leadsens.com", role: "admin" },
  ]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  return (
    <>
      <h1 className="text-xl font-semibold">Members</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Manage members {members.length}
      </p>

      <div className="mt-6">
        <div className="flex gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Invite via email"
            type="email"
            className="flex-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
            className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            disabled={!inviteEmail.trim()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Invite
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {members.map((member) => (
          <div
            key={member.email}
            className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-text-tertiary)] text-xs font-bold text-white">
                {member.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{member.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{member.email}</p>
              </div>
            </div>
            <span className="text-xs text-[var(--color-text-secondary)] capitalize">{member.role}</span>
          </div>
        ))}
      </div>
    </>
  );
}
