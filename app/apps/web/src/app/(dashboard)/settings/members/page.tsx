"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input, Select } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useSafeFetch } from "@/lib/infra/use-safe-fetch";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  sentAt: string;
  lastSentAt: string;
  expiresAt: string;
  resendCount: number;
}

export default function MembersSettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const sfetch = useSafeFetch();
  const { toast } = useToast();

  const loadInvites = useCallback(async () => {
    const { data } = await sfetch<{ invites: PendingInvite[] }>(
      "/api/settings/members/invites",
      { silent: true },
    );
    if (data) setInvites(data.invites || []);
  }, [sfetch]);

  useEffect(() => {
    Promise.all([
      sfetch<{ members: Member[] }>("/api/settings/members", { errorMessage: "Failed to load members" }),
      sfetch<{ invites: PendingInvite[] }>("/api/settings/members/invites", { silent: true }),
    ]).then(([m, i]) => {
      if (m.data) setMembers(m.data.members || []);
      if (i.data) setInvites(i.data.invites || []);
      setLoading(false);
    });
  }, [sfetch]);

  async function handleRoleChange(memberId: string, role: string) {
    setError("");
    const { error: err } = await sfetch("/api/settings/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, role }),
      errorMessage: "Failed to update member role",
    });
    if (!err) {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    } else {
      setError(err);
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setError("");
    const { data, error: err } = await sfetch<{
      invite?: { email: string };
      emailSent?: boolean;
      emailError?: string;
      error?: string;
    }>("/api/settings/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
      errorMessage: "Failed to send invitation",
    });
    setInviting(false);
    if (err) return;
    if (data?.invite) {
      if (data.emailSent === false) {
        toast(`Invite created but email failed: ${data.emailError ?? "unknown"}`, "warning");
      } else {
        toast(`Invitation sent to ${data.invite.email}`, "success");
      }
      setInviteEmail("");
      setInviteRole("member");
      await loadInvites();
    }
  }

  async function handleResend(id: string) {
    const { data, error: err } = await sfetch<{ emailSent?: boolean; emailError?: string }>(
      `/api/settings/members/invites/${id}`,
      { method: "POST", errorMessage: "Failed to resend invitation" },
    );
    if (!err && data) {
      toast(data.emailSent ? "Invitation resent" : `Resend failed: ${data.emailError ?? "unknown"}`,
        data.emailSent ? "success" : "warning");
      await loadInvites();
    }
  }

  // E5 — invitation cancel routes through ConfirmDialog; inviteeEmail
  // is kept in state so the dialog body can name whose invite is
  // about to be revoked ("Cancel invitation for sarah@acme.com?").
  const [cancelInvite, setCancelInvite] = useState<{ id: string; email: string } | null>(null);
  const [cancellingInvite, setCancellingInvite] = useState(false);

  function handleCancel(id: string) {
    const invite = invites.find((i) => i.id === id);
    setCancelInvite({ id, email: invite?.email ?? "" });
  }

  async function confirmCancelInvite() {
    if (!cancelInvite) return;
    setCancellingInvite(true);
    const { error: err } = await sfetch(
      `/api/settings/members/invites/${cancelInvite.id}`,
      {
        method: "DELETE",
        errorMessage: "Failed to cancel invitation",
      }
    );
    setCancellingInvite(false);
    const cancelledId = cancelInvite.id;
    setCancelInvite(null);
    if (!err) {
      setInvites((prev) => prev.filter((i) => i.id !== cancelledId));
      toast("Invitation cancelled", "success");
    }
  }

  return (
    <>
      <SettingsHeader
        title="Members"
        subtitle={
          <>
            Manage who has access to your workspace.{" "}
            {!loading && <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>}
          </>
        }
      />

      <div>
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
          <Button
            variant="gradient"
            disabled={!inviteEmail.trim() || inviting}
            onClick={handleInvite}
          >
            {inviting ? "Inviting..." : "Invite"}
          </Button>
        </div>
        {error && <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
      </div>

      {invites.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Pending invitations ({invites.length})
          </div>
          <div className="space-y-2">
            {invites.map((inv) => {
              const expires = new Date(inv.expiresAt);
              const expired = expires.getTime() < Date.now();
              return (
                <Card key={inv.id}>
                  <CardBody>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {inv.email}
                          </p>
                          <Badge variant={inv.role === "admin" ? "warning" : "info"} size="sm">
                            {inv.role}
                          </Badge>
                          {expired && <Badge variant="error" size="sm">expired</Badge>}
                        </div>
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                          Sent {new Date(inv.lastSentAt).toLocaleDateString()} · expires {expires.toLocaleDateString()}
                          {inv.resendCount > 0 && ` · resent ${inv.resendCount}×`}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResend(inv.id)}
                          disabled={inv.resendCount >= 3}
                          title={inv.resendCount >= 3 ? "Resend limit reached" : "Resend invitation"}
                        >
                          Resend
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(inv.id)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-row rounded-lg p-4" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
                <div className="flex items-center gap-3">
                  <div className="skeleton h-8 w-8 rounded-full" />
                  <div><div className="skeleton h-3.5 w-28 rounded" /><div className="skeleton mt-1 h-3 w-36 rounded" /></div>
                </div>
              </div>
            ))}
          </div>
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

      <ConfirmDialog
        open={cancelInvite !== null}
        title="Cancel this invitation?"
        description={
          cancelInvite?.email
            ? `The invitation link sent to ${cancelInvite.email} will stop working. You can re-invite them anytime.`
            : "The invitation link will stop working. You can re-invite them anytime."
        }
        confirmLabel="Cancel invitation"
        cancelLabel="Keep invitation"
        variant="destructive"
        onConfirm={confirmCancelInvite}
        onCancel={() => setCancelInvite(null)}
        busy={cancellingInvite}
      />
    </>
  );
}
