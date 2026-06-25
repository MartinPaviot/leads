"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input, Select } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useSafeFetch } from "@/lib/infra/use-safe-fetch";
import { useCan } from "@/components/role-provider";
import { processWorkspaceLogoFile, LOGO_FILE_ACCEPT } from "@/lib/logo/client-logo-file";

function roleBadgeVariant(role: string) {
  return role === "admin" ? "warning" : role === "viewer" ? "neutral" : "info";
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  isSelf: boolean;
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
  const [loadError, setLoadError] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const sfetch = useSafeFetch();
  const { toast } = useToast();
  const router = useRouter();
  // Managing members is admin-only (members:invite / members:manage).
  // Non-admins get a read-only roster: no invite box, roles shown as
  // badges, no resend/cancel. The server enforces this regardless.
  const canInvite = useCan("members:invite");
  const canManage = useCan("members:manage");

  // Your own profile photo — self-service for every role (viewers too).
  // Falls back to the gradient initials bubble when unset.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoSaving, setPhotoSaving] = useState(false);

  async function savePhoto(avatarDataUrl: string | null) {
    setPhotoSaving(true);
    const { data, error: err } = await sfetch<{ avatarUrl: string | null }>(
      "/api/account/avatar",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarDataUrl }),
        errorMessage: "Failed to update photo",
      },
    );
    setPhotoSaving(false);
    if (err) return;
    setMembers((prev) =>
      prev.map((m) => (m.isSelf ? { ...m, avatarUrl: data?.avatarUrl ?? null } : m)),
    );
    // Re-render the server layout so the sidebar bubble updates now.
    router.refresh();
    toast(avatarDataUrl ? "Photo updated" : "Photo removed", "success");
  }

  async function onPhotoFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      // Same canvas pipeline as the workspace logo — strips EXIF,
      // rasterizes SVG, bounds the stored size to ≤256px.
      const dataUrl = await processWorkspaceLogoFile(file);
      await savePhoto(dataUrl);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to read the image", "warning");
    }
  }

  const loadInvites = useCallback(async () => {
    const { data } = await sfetch<{ invites: PendingInvite[] }>(
      "/api/settings/members/invites",
      { silent: true },
    );
    if (data) setInvites(data.invites || []);
  }, [sfetch]);

  const refreshMembers = useCallback(async () => {
    const { data } = await sfetch<{ members: Member[] }>(
      "/api/settings/members",
      { silent: true },
    );
    if (data) setMembers(data.members || []);
  }, [sfetch]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [m, i] = await Promise.all([
      sfetch<{ members: Member[] }>("/api/settings/members", { errorMessage: "Failed to load members" }),
      // Was silent:true — a failed invites load was invisible. Toast it so the
      // admin can tell "no pending invites" from "couldn't load invites".
      sfetch<{ invites: PendingInvite[] }>("/api/settings/members/invites", { errorMessage: "Failed to load pending invitations" }),
    ]);
    if (m.data) setMembers(m.data.members || []);
    else setLoadError(true); // the roster otherwise rendered blank on a failed load
    if (i.data) setInvites(i.data.invites || []);
    setLoading(false);
  }, [sfetch]);

  useEffect(() => { loadAll(); }, [loadAll]);

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

  // The accept link from the most recent invite, kept on screen with a Copy
  // button so the admin can share it directly — a reliable path that doesn't
  // depend on the invitation email landing in the recipient's inbox.
  const [lastInvite, setLastInvite] = useState<{ email: string; url: string } | null>(null);
  // When a link appears, select it so a single Ctrl/Cmd+C copies it even if the
  // programmatic clipboard write was blocked (e.g. activation lapsed mid-fetch).
  const linkInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (lastInvite && linkInputRef.current) {
      linkInputRef.current.focus();
      linkInputRef.current.select();
    }
  }, [lastInvite]);

  async function copyToClipboard(text: string): Promise<boolean> {
    // The async Clipboard API is the reliable path in a secure context: it
    // resolves only on a real write. (It can still reject if the click's
    // transient activation lapsed during the preceding fetch — then we fall
    // back, and the link also stays visible in the panel for manual copy.)
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through */
      }
    }
    // Legacy fallback. Use an OFF-SCREEN (not opacity:0) textarea: some
    // browsers return true from execCommand without actually copying when the
    // source element is opacity:0 — which is exactly how a stale clipboard got
    // pasted after a "copied" toast.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
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
      acceptUrl?: string;
      reactivated?: boolean;
      member?: { email: string };
    }>("/api/settings/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
      errorMessage: "Failed to send invitation",
    });
    setInviting(false);
    if (err) return;
    // Re-inviting a previously-removed person restores their access in place —
    // no email, they're a member again immediately.
    if (data?.reactivated) {
      toast(`${data.member?.email ?? email} re-added to the workspace`, "success");
      setInviteEmail("");
      setInviteRole("member");
      await refreshMembers();
      return;
    }
    if (data?.invite) {
      if (data.emailSent === false) {
        toast(`Invite created but email failed: ${data.emailError ?? "unknown"}`, "warning");
      } else {
        toast(`Invitation sent to ${data.invite.email}`, "success");
      }
      if (data.acceptUrl) setLastInvite({ email: data.invite.email, url: data.acceptUrl });
      setInviteEmail("");
      setInviteRole("member");
      await loadInvites();
    }
  }

  async function handleResend(id: string) {
    const { data, error: err } = await sfetch<{ emailSent?: boolean; emailError?: string }>(
      `/api/settings/members/invites/${id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
        errorMessage: "Failed to resend invitation",
      },
    );
    if (!err && data) {
      toast(data.emailSent ? "Invitation resent" : `Resend failed: ${data.emailError ?? "unknown"}`,
        data.emailSent ? "success" : "warning");
      await loadInvites();
    }
  }

  // Copy a fresh accept link for a pending invite (rotates the token; the
  // previously-shared link stops working). No email is sent.
  async function handleCopyLink(id: string) {
    const { data, error: err } = await sfetch<{ acceptUrl?: string }>(
      `/api/settings/members/invites/${id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link" }),
        errorMessage: "Failed to generate link",
      },
    );
    if (!err && data?.acceptUrl) {
      const ok = await copyToClipboard(data.acceptUrl);
      const inv = invites.find((i) => i.id === id);
      // Show + auto-select the link (the effect selects it) so a manual
      // Ctrl/Cmd+C works whenever the programmatic copy was blocked.
      if (inv) setLastInvite({ email: inv.email, url: data.acceptUrl });
      toast(
        ok ? "Invite link copied to clipboard" : "Press Ctrl/Cmd+C to copy the selected link below",
        ok ? "success" : "warning",
      );
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

  // Revoke a member's workspace access. The DELETE deactivates them: login is
  // blocked and live sessions are revoked, and they DROP OFF this list — they
  // are no longer a member. Their account itself isn't deleted; re-inviting the
  // same email restores access. Routed through ConfirmDialog so the member is
  // named before the action.
  const [removeMember, setRemoveMember] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  async function confirmRemove() {
    if (!removeMember) return;
    setRemoving(true);
    const { error: err } = await sfetch("/api/settings/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: removeMember.id }),
      errorMessage: "Failed to remove access",
    });
    setRemoving(false);
    const id = removeMember.id;
    setRemoveMember(null);
    if (!err) {
      // Removed members are no longer members — drop them from the list.
      setMembers((prev) => prev.filter((m) => m.id !== id));
      toast("Member removed", "success");
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

      {/* Hidden picker for your own profile photo (the "Add photo" /
          "Change photo" action on your row below). */}
      <input
        ref={photoInputRef}
        type="file"
        accept={LOGO_FILE_ACCEPT}
        className="hidden"
        onChange={onPhotoFilePicked}
      />

      {canInvite && (
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
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
              options={[
                { value: "member", label: "Member" },
                { value: "viewer", label: "Viewer" },
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

          {lastInvite && (
            <div
              className="mt-3 rounded-lg p-3"
              style={{ background: "var(--color-bg-muted)", border: "1px solid var(--color-border-default)" }}
            >
              <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                Or share this invite link with <strong>{lastInvite.email}</strong> directly — it works even if the email lands in spam.
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  ref={linkInputRef}
                  readOnly
                  value={lastInvite.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-md px-2 py-1.5 text-[12px]"
                  style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await copyToClipboard(lastInvite.url);
                    if (!ok && linkInputRef.current) {
                      linkInputRef.current.focus();
                      linkInputRef.current.select();
                    }
                    toast(ok ? "Invite link copied" : "Press Ctrl/Cmd+C to copy the selected link", ok ? "success" : "warning");
                  }}
                >
                  Copy link
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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
                          <Badge variant={inv.role === "admin" ? "warning" : inv.role === "viewer" ? "neutral" : "info"} size="sm">
                            {inv.role}
                          </Badge>
                          {expired && <Badge variant="error" size="sm">expired</Badge>}
                        </div>
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                          Sent {new Date(inv.lastSentAt).toLocaleDateString()} · expires {expires.toLocaleDateString()}
                          {inv.resendCount > 0 && ` · resent ${inv.resendCount}×`}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyLink(inv.id)}
                            title="Copy a fresh invite link to share directly"
                          >
                            Copy link
                          </Button>
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
                      )}
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
        ) : loadError ? (
          <div role="alert" className="rounded-lg p-4 text-[13px]" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-error, #b91c1c)", color: "var(--color-text-secondary)" }}>
            Couldn&apos;t load the member roster — this is not an empty workspace.{" "}
            <button onClick={() => void loadAll()} className="font-medium underline" style={{ color: "var(--color-accent)" }}>Retry</button>
          </div>
        ) : (
          members.map((member) => (
            <Card key={member.id}>
              <CardBody>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar src={member.avatarUrl} name={member.name} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {member.name}
                        </p>
                        {member.isSelf && (
                          <Badge variant="neutral" size="sm">You</Badge>
                        )}
                      </div>
                      <p className="truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {member.isSelf && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={photoSaving}
                          title="Shown next to your name in the sidebar and on this list"
                        >
                          {photoSaving ? "Saving..." : member.avatarUrl ? "Change photo" : "Add photo"}
                        </Button>
                        {member.avatarUrl && !photoSaving && (
                          <Button variant="ghost" size="sm" onClick={() => savePhoto(null)}>
                            Remove photo
                          </Button>
                        )}
                      </>
                    )}
                    {canManage ? (
                      <Select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        options={[
                          { value: "member", label: "Member" },
                          { value: "viewer", label: "Viewer" },
                          { value: "admin", label: "Admin" },
                        ]}
                      />
                    ) : (
                      <Badge variant={roleBadgeVariant(member.role)} size="sm">
                        {member.role}
                      </Badge>
                    )}
                    {canManage && !member.isSelf && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveMember({ id: member.id, name: member.name })}
                        title="Remove this member from the workspace"
                        style={{ color: "var(--color-error)" }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
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

      <ConfirmDialog
        open={removeMember !== null}
        title={removeMember ? `Remove ${removeMember.name} from the workspace?` : "Remove member?"}
        description="They'll immediately lose access to this workspace's data and actions, their active sessions are signed out, and they'll be removed from your members list. Their account isn't deleted — re-invite the same email to add them back."
        confirmLabel="Remove member"
        cancelLabel="Keep member"
        variant="destructive"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveMember(null)}
        busy={removing}
      />
    </>
  );
}
