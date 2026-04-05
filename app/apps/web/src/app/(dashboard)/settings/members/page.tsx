"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

export default function MembersSettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/members")
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleRoleChange(memberId: string, role: string) {
    setError("");
    try {
      const res = await fetch("/api/settings/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role }),
      });
      if (res.ok) {
        setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
      } else {
        setError("Failed to update member role");
      }
    } catch {
      setError("Failed to update member role");
    }
  }

  return (
    <>
      <h1
        className="text-[24px] font-bold"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
      >
        Members
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Manage who has access to your workspace.{" "}
        {!loading && <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>}
      </p>

      <div className="mt-6">
        <div className="flex gap-2">
          <Input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Invite via email"
            type="email"
            className="flex-1"
          />
          <Select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
            ]}
          />
          <Button variant="gradient" disabled={!inviteEmail.trim()}>
            Invite
          </Button>
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          Invite functionality coming soon.
        </p>
        {error && <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
      </div>

      <div className="mt-6 space-y-2">
        {loading ? (
          <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>Loading...</p>
        ) : (
          members.map((member) => (
            <Card key={member.id}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: "var(--color-accent)" }}
                    >
                      {member.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {member.name}
                      </p>
                      <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <Select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    options={[
                      { value: "member", label: "Member" },
                      { value: "admin", label: "Admin" },
                    ]}
                  />
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
