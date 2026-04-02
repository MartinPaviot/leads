"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      </div>

      <div className="mt-6 space-y-2">
        {members.map((member) => (
          <Card key={member.email}>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-text-tertiary)] text-xs font-bold text-white">
                    {member.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{member.name}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">{member.email}</p>
                  </div>
                </div>
                <Badge variant="neutral" size="md">{member.role}</Badge>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
