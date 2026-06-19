"use client";

import { useState, useEffect } from "react";
import { useSafeFetch } from "@/lib/infra/use-safe-fetch";
import { SettingsHeader } from "@/components/ui/settings-header";
import {
  Mail,
  Plus,
  Trash2,
  Shield,
  RefreshCw,
  Calendar,
  Send,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, Tag } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConnectedAccount {
  id: string;
  emailAddress: string;
  provider: string;
  providerLabel: string;
  // Connection
  oauthConnected: boolean;
  mailboxConnected: boolean;
  calendarConnected: boolean;
  status: string;
  // Sync
  lastEmailSyncAt: string | null;
  lastCalSyncAt: string | null;
  // Sending
  dailyLimit: number;
  sentToday: number;
  sentTotal: number;
  healthScore: number;
  // Warmup
  warmupStartedAt: string | null;
  warmupDailyTarget: number;
  warmupCompletedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CREATION_MODES = [
  { value: "disabled", label: "Disabled", desc: "Never create contacts from emails" },
  { value: "selective", label: "Selective", desc: "Only create contacts when they match your ICP" },
  { value: "always", label: "Always", desc: "Create a contact for every new email address" },
];

const BACKSYNC_OPTIONS = [
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

const DEFAULT_IGNORED_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com",
  "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "icloud.com",
  "aol.com", "protonmail.com", "proton.me", "me.com", "mail.com",
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MailCalendarPage() {
  // Accounts
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [showSetup, setShowSetup] = useState(false);

  // "Other provider" — connect any IMAP/SMTP mailbox (Zimbra, Infomaniak, OVH…).
  const [customMode, setCustomMode] = useState(false);
  const [cust, setCust] = useState({ email: "", imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "465", password: "", caldavUrl: "" });
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState("");
  // A1: result of the OAuth-LINK round-trip (?linked=ok|cancelled|error).
  const [linkedNotice, setLinkedNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Sync preferences
  const [contactCreationMode, setContactCreationMode] = useState("selective");
  const [backsyncRange, setBacksyncRange] = useState("3m");
  const [doNotTrackDomains, setDoNotTrackDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const sfetch = useSafeFetch();

  /* ---- Data loading ---- */

  async function loadData() {
    type Resp = {
      accounts?: ConnectedAccount[];
      syncPreferences?: {
        contactCreationMode?: string;
        backsyncRange?: string;
        doNotTrackDomains?: string[];
      };
    };
    const { data, error: err } = await sfetch<Resp>("/api/settings/mail-calendar", {
      errorMessage: "Failed to load settings",
    });
    if (data) {
      setAccounts(data.accounts || []);
      setContactCreationMode(data.syncPreferences?.contactCreationMode || "selective");
      setBacksyncRange(data.syncPreferences?.backsyncRange || "3m");
      setDoNotTrackDomains(data.syncPreferences?.doNotTrackDomains || []);
    } else if (err) {
      setError(err);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // A1: surface the OAuth-LINK result and strip the query param so a refresh
  // doesn't re-show it. On success, reload so the new mailbox appears.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    if (!linked) return;
    if (linked === "ok") {
      setLinkedNotice({ ok: true, text: "Mailbox connected." });
      loadData();
    } else if (linked === "cancelled") {
      setLinkedNotice({ ok: false, text: "Connection cancelled." });
    } else {
      setLinkedNotice({ ok: false, text: "Couldn't connect that mailbox. Please try again." });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("linked");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Actions ---- */

  // A1: ADD-a-mailbox via the OAuth-LINK flow (attaches to the current user),
  // NOT next-auth signIn (which would swap the session identity). The route
  // 302s to the provider and the callback returns to ?linked=ok|cancelled|error.
  function connectGoogle() {
    window.location.href = "/api/settings/mailboxes/oauth-link?provider=gmail";
  }

  function connectMicrosoft() {
    window.location.href = "/api/settings/mailboxes/oauth-link?provider=outlook";
  }

  async function connectCustom() {
    setConnectErr("");
    if (!cust.email.trim() || !cust.imapHost.trim() || !cust.smtpHost.trim() || !cust.password) {
      setConnectErr("Email, IMAP server, SMTP server and password are all required.");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/settings/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cust.email.trim(),
          provider: "smtp_custom",
          imapHost: cust.imapHost.trim(),
          imapPort: Number(cust.imapPort) || 993,
          smtpHost: cust.smtpHost.trim(),
          smtpPort: Number(cust.smtpPort) || 465,
          password: cust.password,
          caldavUrl: cust.caldavUrl.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowSetup(false);
        setCustomMode(false);
        setCust({ email: "", imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "465", password: "", caldavUrl: "" });
        loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        setConnectErr(data.error || "Couldn't connect the mailbox — double-check the server, port and password.");
      }
    } catch {
      setConnectErr("Couldn't reach that server. Check the host and try again.");
    } finally {
      setConnecting(false);
    }
  }

  // E5 — mailbox removal now routes through ConfirmDialog instead of
  // `window.confirm`. Pending id lives in state so the dialog knows
  // which row the user is confirming; `null` closes it.
  const [removeMailboxId, setRemoveMailboxId] = useState<string | null>(null);
  const [removingMailbox, setRemovingMailbox] = useState(false);

  function deleteAccount(id: string) {
    setRemoveMailboxId(id);
  }

  async function confirmDeleteAccount() {
    if (!removeMailboxId) return;
    setRemovingMailbox(true);
    const { error: err } = await sfetch(
      `/api/settings/mailboxes?id=${removeMailboxId}`,
      {
        method: "DELETE",
        errorMessage: "Failed to remove account",
      }
    );
    setRemovingMailbox(false);
    setRemoveMailboxId(null);
    if (!err) loadData();
  }

  // N15 — OAuth-only accounts (Google/Microsoft calendar + Gmail sync
  // without a sending mailbox) get a "Disconnect" action that wipes
  // the auth_account row. Stored as { email, provider } so the dialog
  // can tell the user exactly which integration is about to stop
  // syncing. `null` closes.
  const [disconnectOauth, setDisconnectOauth] = useState<
    { email: string; provider: "google" | "microsoft-entra-id" } | null
  >(null);
  const [disconnectingOauth, setDisconnectingOauth] = useState(false);

  async function confirmDisconnectOauth() {
    if (!disconnectOauth) return;
    setDisconnectingOauth(true);
    const { error: err } = await sfetch(
      `/api/settings/oauth?provider=${disconnectOauth.provider}`,
      {
        method: "DELETE",
        errorMessage: "Failed to disconnect",
      }
    );
    setDisconnectingOauth(false);
    setDisconnectOauth(null);
    if (!err) loadData();
  }

  async function skipWarmup(id: string) {
    const { error: err } = await sfetch(`/api/settings/mailboxes?id=${id}&action=skip-warmup`, {
      method: "PATCH",
      errorMessage: "Failed to skip warm-up",
    });
    if (!err) loadData();
  }

  async function forceSync() {
    setSyncing(true);
    await sfetch("/api/email/sync", {
      method: "POST",
      errorMessage: "Failed to start sync",
    });
    setTimeout(() => { setSyncing(false); loadData(); }, 2000);
  }

  async function handleSavePreferences() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/mail-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactCreationMode, backsyncRange, doNotTrackDomains }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save preferences");
      }
    } catch {
      setError("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d || doNotTrackDomains.includes(d)) return;
    setDoNotTrackDomains([...doNotTrackDomains, d]);
    setNewDomain("");
  }

  function removeDomain(domain: string) {
    setDoNotTrackDomains(doNotTrackDomains.filter((d) => d !== domain));
  }

  /* ---- Helpers ---- */

  function warmupProgress(account: ConnectedAccount) {
    if (account.status !== "warming_up" || !account.warmupStartedAt) return null;
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(account.warmupStartedAt).getTime()) / 86400000
    );
    return { daysSinceStart, progress: Math.min(100, (daysSinceStart / 21) * 100) };
  }

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return "never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  /* ---- Render ---- */

  if (loading) {
    return (
      <>
        <SettingsHeader title="Mail & Calendar" />
        <div className="mt-4 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton-row rounded-lg p-5" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
              <div className="flex items-center gap-3">
                <div className="skeleton h-9 w-9 rounded-lg" />
                <div><div className="skeleton h-4 w-32 rounded" /><div className="skeleton mt-1 h-3 w-48 rounded" /></div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <SettingsHeader
        title="Mail & Calendar"
        subtitle="Manage your connected email accounts, sync preferences, and sending settings."
      />

      {linkedNotice && (
        <div
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px]"
          style={{
            borderColor: linkedNotice.ok ? "var(--color-success)" : "var(--color-border-default)",
            background: linkedNotice.ok ? "var(--color-accent-soft)" : "var(--color-bg-card)",
            color: linkedNotice.ok ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          }}
        >
          <span>{linkedNotice.text}</span>
          <button onClick={() => setLinkedNotice(null)} style={{ color: "var(--color-text-muted)" }} aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/*  SECTION 1 — Connected accounts                              */}
      {/* ============================================================ */}

      <section className="mt-8">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Connected accounts
        </h2>

        {accounts.length > 0 && (
          <div className="mt-3 space-y-2">
            {accounts.map((acct) => {
              const wp = warmupProgress(acct);
              const isGmail = acct.providerLabel === "gmail" || acct.provider === "google";
              const isOutlook = acct.providerLabel === "outlook" || acct.provider === "microsoft-entra-id";
              const providerName = isGmail ? "Google" : isOutlook ? "Microsoft" : acct.provider === "smtp_custom" ? "IMAP / SMTP" : acct.provider;

              // Status logic: needs_reauth (dead OAuth token) wins; else
              // OAuth-only = "syncing", mailbox active = "active", etc.
              const displayStatus = acct.status === "needs_reauth"
                ? "needs_reauth"
                : acct.oauthConnected && !acct.mailboxConnected
                ? "syncing"
                : acct.status;
              const statusVariant = displayStatus === "active" ? "success" as const
                : displayStatus === "warming_up" ? "warning" as const
                : displayStatus === "syncing" ? "info" as const
                : displayStatus === "needs_reauth" ? "error" as const
                : displayStatus === "error" ? "error" as const
                : "neutral" as const;
              const statusLabel = displayStatus === "syncing" ? "Syncing emails"
                : displayStatus === "warming_up" ? `Warming up${wp ? ` — Day ${wp.daysSinceStart}/21` : ""}`
                : displayStatus === "active" ? "Active"
                : displayStatus === "needs_reauth" ? "Reconnect needed"
                : displayStatus;

              return (
                <Card key={acct.id}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Provider icon */}
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ background: "var(--color-bg-hover)" }}>
                          {isGmail ? (
                            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                              <path d="M1.5 14h3V6.8L0 4.5V12.5A1.5 1.5 0 001.5 14z" fill="#4285F4"/>
                              <path d="M13.5 14h3a1.5 1.5 0 001.5-1.5V4.5l-4.5 2.3V14z" fill="#34A853"/>
                              <path d="M13.5 1.5V6.8L18 4.5V2a2 2 0 00-3.2-1.6L13.5 1.5z" fill="#FBBC05"/>
                              <path d="M4.5 6.8V1.5L9 5l4.5-3.5V6.8L9 9.1 4.5 6.8z" fill="#EA4335"/>
                              <path d="M0 2v2.5l4.5 2.3V1.5L3.2.4A2 2 0 000 2z" fill="#C5221F"/>
                            </svg>
                          ) : isOutlook ? (
                            <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
                              <rect width="10" height="10" fill="#F25022"/>
                              <rect x="11" width="10" height="10" fill="#7FBA00"/>
                              <rect y="11" width="10" height="10" fill="#00A4EF"/>
                              <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
                            </svg>
                          ) : (
                            <Mail size={16} style={{ color: "var(--color-text-secondary)" }} />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {acct.emailAddress}
                            </span>
                            <Badge variant={statusVariant} size="sm">
                              {statusLabel}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-4 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            <span>{providerName}</span>
                            {acct.oauthConnected && (
                              <span className="flex items-center gap-1">
                                <Mail size={10} />
                                Email sync {acct.lastEmailSyncAt ? timeAgo(acct.lastEmailSyncAt) : "active"}
                              </span>
                            )}
                            {acct.calendarConnected && (
                              <span className="flex items-center gap-1">
                                <Calendar size={10} />
                                Calendar connected
                              </span>
                            )}
                            {acct.mailboxConnected && (
                              <>
                                <span className="flex items-center gap-1">
                                  <Send size={10} />
                                  {acct.sentToday}/{acct.dailyLimit} today
                                </span>
                                <span>
                                  Health: <span style={{
                                    color: acct.healthScore >= 80 ? "var(--color-success)"
                                      : acct.healthScore >= 50 ? "var(--color-warning)"
                                      : "var(--color-error)"
                                  }}>{acct.healthScore}%</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {acct.oauthConnected && acct.status === "needs_reauth" && (
                          <Button
                            variant="solid"
                            size="sm"
                            onClick={() => (isOutlook ? connectMicrosoft() : connectGoogle())}
                          >
                            Reconnect
                          </Button>
                        )}
                        {acct.status === "warming_up" && acct.mailboxConnected && (
                          <Button variant="ghost" size="sm" onClick={() => skipWarmup(acct.id)}>
                            Skip warm-up
                          </Button>
                        )}
                        {acct.mailboxConnected && (
                          <Button variant="icon" size="sm" onClick={() => deleteAccount(acct.id)}>
                            <Trash2 size={14} />
                          </Button>
                        )}
                        {/* N15 — OAuth-only: sync is active but there's no
                             sending mailbox, so the mailbox-delete path
                             doesn't apply. Offer a Disconnect to revoke
                             the access + refresh tokens and stop the
                             cron. Infer provider from emailProvider or
                             the account shape. */}
                        {acct.oauthConnected && !acct.mailboxConnected && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDisconnectOauth({
                                email: acct.emailAddress,
                                provider:
                                  providerName.toLowerCase().includes("microsoft")
                                    ? "microsoft-entra-id"
                                    : "google",
                              })
                            }
                          >
                            Disconnect
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Warmup progress bar */}
                    {wp && acct.mailboxConnected && (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 rounded-full" style={{ background: "var(--color-bg-hover)" }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${wp.progress}%`, background: "var(--color-warning)" }} />
                        </div>
                        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                          {acct.warmupDailyTarget}/day target
                        </span>
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}

            {/* Force sync button */}
            <div className="mt-2">
              <Button variant="ghost" size="sm" onClick={forceSync} disabled={syncing}>
                <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing..." : "Force sync now"}
              </Button>
            </div>
          </div>
        )}

        {/* Add account / empty state */}
        {accounts.length === 0 && !showSetup && (
          <div className="mt-4 text-center py-8">
            <Mail size={32} className="mx-auto" style={{ color: "var(--color-text-muted)" }} />
            <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              No accounts connected
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Connect your email to automatically capture interactions and send outbound sequences.
            </p>
            <Button variant="outline" size="md" icon={<Plus size={14} />} onClick={() => setShowSetup(true)} className="mt-4">
              Add account
            </Button>
          </div>
        )}

        {accounts.length > 0 && !showSetup && (
          <Button variant="outline" size="md" icon={<Plus size={14} />} onClick={() => setShowSetup(true)} className="mt-3">
            Add account
          </Button>
        )}

        {/* Setup form */}
        {showSetup && (
          <Card className="mt-3">
            <CardBody className="p-5">
              {!customMode ? (
                <>
                  <div className="flex flex-wrap items-center gap-2" style={{ borderBottom: "1px solid var(--color-border-default)", paddingBottom: "16px" }}>
                    <Button variant="outline" size="md" onClick={() => setShowSetup(false)}>
                      Cancel
                    </Button>
                    <button onClick={connectGoogle}
                      className="flex h-9 items-center gap-2 rounded-md px-4 text-[12px] font-medium text-white transition-colors"
                      style={{ background: "#4285F4" }}>
                      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                      </svg>
                      Continue with Google
                    </button>
                    <button onClick={connectMicrosoft}
                      className="flex h-9 items-center gap-2 rounded-md px-4 text-[12px] font-medium transition-colors"
                      style={{ background: "#2F2F2F", color: "white" }}>
                      <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
                        <rect width="10" height="10" fill="#F25022"/>
                        <rect x="11" width="10" height="10" fill="#7FBA00"/>
                        <rect y="11" width="10" height="10" fill="#00A4EF"/>
                        <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
                      </svg>
                      Continue with Microsoft
                    </button>
                    <button onClick={() => { setCustomMode(true); setConnectErr(""); }}
                      className="flex h-9 items-center gap-2 rounded-md px-4 text-[12px] font-medium transition-colors"
                      style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
                      <Mail size={14} style={{ color: "var(--color-text-secondary)" }} />
                      Other provider (IMAP/SMTP)
                    </button>
                  </div>

                  <div className="mt-4 flex items-start gap-2 rounded-md px-3 py-2"
                    style={{ background: "var(--color-bg-hover)" }}>
                    <Shield size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} />
                    <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      Google and Microsoft connect with OAuth — we never see your password. For Zimbra, Infomaniak, OVH or any other mailbox, use &quot;Other provider&quot; and enter your IMAP/SMTP details.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border-default)", paddingBottom: "12px" }}>
                    <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      Connect via IMAP / SMTP
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setCustomMode(false)}>Back</Button>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-text-tertiary)" }}>
                    Works with Zimbra, Infomaniak, OVH, Gandi and any mailbox that supports IMAP + SMTP. You&apos;ll find these in your webmail under &quot;IMAP/POP &amp; SMTP&quot; settings, or your mail administrator can give them to you. We also auto-detect your calendar over CalDAV with the same login.
                  </p>

                  <LabeledField label="Email address" hint="The mailbox you're connecting">
                    <Input type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="you@yourorg.ch" />
                  </LabeledField>

                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <LabeledField label="IMAP server (incoming)" hint="Usually mail.yourdomain.com — Zimbra: mail.yourorg.ch · Infomaniak: mail.infomaniak.com · OVH: ssl0.ovh.net">
                      <Input value={cust.imapHost} onChange={(e) => setCust({ ...cust, imapHost: e.target.value })} placeholder="mail.yourorg.ch" />
                    </LabeledField>
                    <LabeledField label="Port" hint="993 (SSL)">
                      <Input value={cust.imapPort} onChange={(e) => setCust({ ...cust, imapPort: e.target.value })} inputMode="numeric" />
                    </LabeledField>
                  </div>

                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <LabeledField label="SMTP server (outgoing)" hint="Often the same host as IMAP">
                      <Input value={cust.smtpHost} onChange={(e) => setCust({ ...cust, smtpHost: e.target.value })} placeholder="mail.yourorg.ch" />
                    </LabeledField>
                    <LabeledField label="Port" hint="465 (SSL) or 587">
                      <Input value={cust.smtpPort} onChange={(e) => setCust({ ...cust, smtpPort: e.target.value })} inputMode="numeric" />
                    </LabeledField>
                  </div>

                  <LabeledField label="Password" hint="Your mailbox password — or an app-specific password if 2FA is on">
                    <Input type="password" value={cust.password} onChange={(e) => setCust({ ...cust, password: e.target.value })} placeholder="••••••••" />
                  </LabeledField>

                  <LabeledField label="Calendar (CalDAV) URL — optional" hint="Leave blank to auto-detect. Set it if your calendar lives elsewhere — Infomaniak: https://sync.infomaniak.com · Zimbra: https://mail.yourorg.ch/dav">
                    <Input value={cust.caldavUrl} onChange={(e) => setCust({ ...cust, caldavUrl: e.target.value })} placeholder="(auto-detected)" />
                  </LabeledField>

                  {connectErr && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{connectErr}</p>}

                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="solid" onClick={connectCustom} disabled={connecting}>
                      {connecting ? "Connecting…" : "Connect mailbox"}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowSetup(false); setCustomMode(false); }}>Cancel</Button>
                  </div>

                  <div className="flex items-start gap-2 rounded-md px-3 py-2" style={{ background: "var(--color-bg-hover)" }}>
                    <Shield size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} />
                    <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      Credentials are stored encrypted and used only to sync and send from this mailbox. Remove it any time to revoke access.
                    </p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </section>

      {/* ============================================================ */}
      {/*  SECTION 2 — Sync preferences                                */}
      {/* ============================================================ */}

      <section className="mt-10">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Sync preferences
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          Control how Elevay captures and processes your email data.
        </p>

        <div className="mt-4 space-y-6">
          {/* Contact creation mode */}
          <div>
            <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Contact creation
            </label>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              When new email addresses are detected, how should Elevay handle them?
            </p>
            <div className="mt-2 space-y-1.5">
              {CREATION_MODES.map((mode) => {
                const selected = contactCreationMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setContactCreationMode(mode.value)}
                    className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors"
                    style={{
                      background: selected ? "var(--color-accent-soft)" : "var(--color-bg-card)",
                      border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border-default)"}`,
                    }}
                  >
                    <div
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                      style={{ border: `2px solid ${selected ? "var(--color-accent)" : "var(--color-border-strong)"}` }}
                    >
                      {selected && (
                        <div className="h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} />
                      )}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {mode.label}
                      </div>
                      <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {mode.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Backsync range */}
          <div>
            <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Email sync lookback
            </label>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              How far back should Elevay import your email history when connecting a new account?
            </p>
            <div className="relative mt-2">
              <select
                value={backsyncRange}
                onChange={(e) => setBacksyncRange(e.target.value)}
                className="h-8 w-48 appearance-none rounded-md px-3 pr-8 text-[12px] outline-none"
                style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
              >
                {BACKSYNC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5" style={{ color: "var(--color-text-muted)" }} />
            </div>
          </div>

          {/* Do not track domains */}
          <div>
            <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Ignored domains
            </label>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              No company will be auto-created for these domains. Contacts and activities are still tracked.
            </p>

            {doNotTrackDomains.filter((d) => !DEFAULT_IGNORED_DOMAINS.includes(d)).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {doNotTrackDomains
                  .filter((d) => !DEFAULT_IGNORED_DOMAINS.includes(d))
                  .map((d) => (
                    <Tag key={d} onRemove={() => removeDomain(d)}>{d}</Tag>
                  ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDomain()}
                placeholder="Add domain (e.g. newsletter.com)"
                className="flex-1"
              />
              <Button variant="solid" onClick={addDomain} disabled={!newDomain.trim()}>
                Add
              </Button>
            </div>
            <p className="mt-2 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {DEFAULT_IGNORED_DOMAINS.length} personal email providers (gmail.com, outlook.com, yahoo.com...) are automatically ignored for company creation.
            </p>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="solid" onClick={handleSavePreferences} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
            {saved && <Badge variant="success">Saved</Badge>}
            {error && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={removeMailboxId !== null}
        title="Remove this account?"
        description="Email sync and sending will stop for this account. You can reconnect it later."
        confirmLabel="Remove account"
        variant="destructive"
        onConfirm={confirmDeleteAccount}
        onCancel={() => setRemoveMailboxId(null)}
        busy={removingMailbox}
      />

      <ConfirmDialog
        open={disconnectOauth !== null}
        title="Disconnect this account?"
        description={
          disconnectOauth
            ? `Calendar and email sync for ${disconnectOauth.email} will stop. To fully revoke access you'll also want to remove Elevay from your ${disconnectOauth.provider === "google" ? "Google" : "Microsoft"} account security settings.`
            : ""
        }
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={confirmDisconnectOauth}
        onCancel={() => setDisconnectOauth(null)}
        busy={disconnectingOauth}
      />
    </>
  );
}

/* Label + input + a "where to find this" hint — for the IMAP/SMTP form. The
   arbitrary variant forces the wrapped Input to fill its column. */
function LabeledField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{label}</label>
      <div className="mt-1 [&_input]:w-full">{children}</div>
      {hint && <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--color-text-tertiary)" }}>{hint}</p>}
    </div>
  );
}
