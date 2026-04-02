"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { Mail, Plus, ChevronDown, Trash2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Mailbox {
  id: string;
  emailAddress: string;
  displayName: string;
  provider: string;
  domain: string;
  status: string;
  dailyLimit: number;
  sentToday: number;
  sentTotal: number;
  healthScore: number;
  warmupStartedAt: string | null;
  warmupDailyTarget: number;
  warmupCompletedAt: string | null;
  createdAt: string;
}

const BACKSYNC_OPTIONS = [
  { label: "1 month", value: "1m" },
  { label: "3 months", value: "3m" },
  { label: "6 months", value: "6m" },
  { label: "12 months", value: "12m" },
];

const CREATION_OPTIONS = [
  { label: "Disabled", value: "disabled", desc: "No records created from emails" },
  { label: "Selective", value: "selective", desc: "Records from sent emails and organized meetings (recommended)" },
  { label: "Always", value: "always", desc: "Records always created from all emails and meetings" },
];

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);

  // Pre-connection settings
  const [backsyncRange, setBacksyncRange] = useState("1m");
  const [contactCreation, setContactCreation] = useState("selective");
  const [doNotTrack, setDoNotTrack] = useState("");

  async function loadMailboxes() {
    try {
      const res = await fetch("/api/settings/mailboxes");
      const data = await res.json();
      setMailboxes(data.mailboxes || []);
    } catch { /* */ } finally { setLoading(false); }
  }

  useEffect(() => { loadMailboxes(); }, []);

  async function connectGoogle() {
    // Store pre-connection settings in sessionStorage for post-OAuth callback
    sessionStorage.setItem("mailbox-setup", JSON.stringify({
      backsyncRange, contactCreation, doNotTrack,
    }));
    signIn("google", { callbackUrl: "/settings/mailboxes" });
  }

  async function deleteMailbox(id: string) {
    if (!confirm("Remove this mailbox? This will stop all outbound emails from this account.")) return;
    try {
      await fetch(`/api/settings/mailboxes?id=${id}`, { method: "DELETE" });
      loadMailboxes();
    } catch { /* */ }
  }

  async function skipWarmup(id: string) {
    try {
      await fetch(`/api/settings/mailboxes?id=${id}&action=skip-warmup`, { method: "PATCH" });
      loadMailboxes();
    } catch { /* */ }
  }

  function warmupProgress(mailbox: Mailbox) {
    if (mailbox.status !== "warming_up" || !mailbox.warmupStartedAt) return null;
    const daysSinceStart = Math.floor((Date.now() - new Date(mailbox.warmupStartedAt).getTime()) / 86400000);
    return { daysSinceStart, progress: Math.min(100, (daysSinceStart / 21) * 100) };
  }

  if (loading) {
    return (
      <>
        <h1 className="text-[24px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
          Mail and Calendar
        </h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>Loading...</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[24px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
        Mail and Calendar
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Manage settings for emails and meetings from your connected accounts
      </p>

      {/* Connected accounts */}
      {mailboxes.length > 0 && (
        <div className="mt-6 space-y-2">
          {mailboxes.map((mb) => {
            const wp = warmupProgress(mb);
            const statusVariant = mb.status === "active" ? "success" as const
              : mb.status === "warming_up" ? "warning" as const
              : mb.status === "error" ? "error" as const
              : "neutral" as const;
            const statusColor = mb.status === "active" ? "var(--color-success)"
              : mb.status === "warming_up" ? "var(--color-warning)"
              : mb.status === "error" ? "var(--color-error)"
              : "var(--color-text-tertiary)";

            return (
              <Card key={mb.id}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Provider icon */}
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg"
                        style={{ background: "var(--color-bg-hover)" }}>
                        {mb.provider === "gmail" ? (
                          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                            <path d="M1.5 14h3V6.8L0 4.5V12.5A1.5 1.5 0 001.5 14z" fill="#4285F4"/>
                            <path d="M13.5 14h3a1.5 1.5 0 001.5-1.5V4.5l-4.5 2.3V14z" fill="#34A853"/>
                            <path d="M13.5 1.5V6.8L18 4.5V2a2 2 0 00-3.2-1.6L13.5 1.5z" fill="#FBBC05"/>
                            <path d="M4.5 6.8V1.5L9 5l4.5-3.5V6.8L9 9.1 4.5 6.8z" fill="#EA4335"/>
                            <path d="M0 2v2.5l4.5 2.3V1.5L3.2.4A2 2 0 000 2z" fill="#C5221F"/>
                          </svg>
                        ) : (
                          <Mail size={16} style={{ color: "var(--color-text-secondary)" }} />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {mb.emailAddress}
                          </span>
                          <Badge variant={statusVariant} size="sm">
                            {mb.status === "warming_up" ? `Warming up${wp ? ` — Day ${wp.daysSinceStart}/21` : ""}` : mb.status}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex items-center gap-4 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                          <span>{mb.provider}</span>
                          <span>{mb.sentToday}/{mb.dailyLimit} today</span>
                          <span>{mb.sentTotal} total sent</span>
                          <span>
                            Health: <span style={{
                              color: mb.healthScore >= 80 ? "var(--color-success)"
                                : mb.healthScore >= 50 ? "var(--color-warning)"
                                : "var(--color-error)"
                            }}>{mb.healthScore}%</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {mb.status === "warming_up" && (
                        <Button variant="ghost" size="sm" onClick={() => skipWarmup(mb.id)}>
                          Skip warm-up
                        </Button>
                      )}
                      <Button variant="icon" size="sm" onClick={() => deleteMailbox(mb.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>

                  {/* Warmup progress bar */}
                  {wp && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 flex-1 rounded-full" style={{ background: "var(--color-bg-hover)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${wp.progress}%`, background: "var(--color-warning)" }} />
                      </div>
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        {mb.warmupDailyTarget}/day target
                      </span>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add account button / setup form */}
      {!showSetup ? (
        <Button variant="outline" size="md" icon={<Plus size={14} />} onClick={() => setShowSetup(true)} className="mt-6">
          Add account
        </Button>
      ) : (
        <Card className="mt-6">
          <CardBody className="p-5">
            {/* Pre-connection settings */}
            <div className="space-y-5">
              {/* Account & contact creation */}
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  Account & contact creation
                </label>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Control how records are automatically created from meetings and emails
                </p>
                <div className="mt-2 space-y-1.5">
                  {CREATION_OPTIONS.map((opt) => (
                    <label key={opt.value}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md px-3 py-2 transition-colors"
                      style={{
                        background: contactCreation === opt.value ? "var(--color-accent-muted)" : "transparent",
                        border: contactCreation === opt.value ? "1px solid var(--color-accent)" : "1px solid transparent",
                      }}>
                      <input type="radio" name="creation" value={opt.value}
                        checked={contactCreation === opt.value}
                        onChange={(e) => setContactCreation(e.target.value)}
                        className="mt-0.5 accent-[var(--color-accent)]" />
                      <div>
                        <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {opt.label}
                        </span>
                        <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Backsync range */}
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  Backsync range
                </label>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  How far back to sync your mail and calendar from today
                </p>
                <div className="relative mt-2">
                  <select value={backsyncRange} onChange={(e) => setBacksyncRange(e.target.value)}
                    className="h-8 w-48 appearance-none rounded-md px-3 pr-8 text-[12px] outline-none"
                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
                    {BACKSYNC_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5" style={{ color: "var(--color-text-muted)" }} />
                </div>
              </div>

              {/* Do not track */}
              <div>
                <Input
                  label="Do not track"
                  value={doNotTrack}
                  onChange={(e) => setDoNotTrack(e.target.value)}
                  placeholder="example.com user@example.com"
                />
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Domains and emails that you don't want LeadSens to track
                </p>
              </div>
            </div>

            {/* OAuth connect buttons */}
            <div className="mt-6 flex items-center gap-2" style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: "20px" }}>
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
              <button disabled
                className="flex h-9 items-center gap-2 rounded-md px-4 text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: "#2F2F2F", color: "white" }}>
                <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
                  <rect width="10" height="10" fill="#F25022"/>
                  <rect x="11" width="10" height="10" fill="#7FBA00"/>
                  <rect y="11" width="10" height="10" fill="#00A4EF"/>
                  <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
                </svg>
                Continue with Microsoft
                <Badge variant="neutral">Soon</Badge>
              </button>
            </div>

            {/* Security note */}
            <div className="mt-4 flex items-start gap-2 rounded-md px-3 py-2"
              style={{ background: "var(--color-bg-hover)" }}>
              <Shield size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} />
              <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                LeadSens uses OAuth to connect securely. We never store your password. You can revoke access at any time from your Google or Microsoft account settings.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Empty state when no accounts and not setting up */}
      {mailboxes.length === 0 && !showSetup && (
        <div className="mt-8 text-center">
          <Mail size={32} className="mx-auto" style={{ color: "var(--color-text-muted)" }} />
          <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            No accounts connected
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Connect your email to automatically capture interactions and send outbound sequences.
          </p>
        </div>
      )}
    </>
  );
}
