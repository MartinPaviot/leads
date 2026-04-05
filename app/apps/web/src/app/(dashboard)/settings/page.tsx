"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { signIn } from "next-auth/react";
import { Mail, CheckCircle2 } from "lucide-react";

interface ConnectedMailbox {
  emailAddress: string;
  provider: string;
  status: string;
}

export default function ProfileSettingsPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [connectedMailboxes, setConnectedMailboxes] = useState<ConnectedMailbox[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings/profile")
      .then((r) => r.json())
      .then((data) => {
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setEmail(data.email || "");
        setConnectedMailboxes(data.connectedMailboxes || []);
        setLoaded(true);
      })
      .catch(() => { setError("Failed to load profile"); setLoaded(true); });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      if (res.ok) {
        setSaved(true);
        setError("");
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save profile");
      }
    } catch {
      setError("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <>
      <h1
        className="text-[24px] font-bold"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
      >
        Profile
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Manage settings for your personal profile.
      </p>

      <div className="mt-8 space-y-5">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Input label="Email" value={email} disabled />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="solid" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Update"}
          </Button>
          {saved && <Badge variant="success">Saved</Badge>}
          {error && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
        </div>
      </div>

      {/* Email & Calendar section */}
      <section className="mt-12">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Email & Calendar
        </h2>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Connect your email to automatically capture all interactions.
        </p>

        {connectedMailboxes.length > 0 ? (
          <div className="mt-4 space-y-2">
            {connectedMailboxes.map((mb, i) => {
              const providerName = mb.provider === "gmail" ? "Google" : mb.provider === "outlook" ? "Microsoft" : mb.provider;
              const hasEmail = !!mb.emailAddress;
              const statusLabel = mb.status === "active" ? "Active"
                : mb.status === "warming_up" ? "Warming up"
                : mb.status === "linked" ? "Linked"
                : mb.status;

              return (
                <Card key={mb.emailAddress || `${mb.provider}-${i}`}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full"
                          style={{ background: "var(--color-success-soft)" }}
                        >
                          {mb.provider === "gmail" ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                          ) : mb.provider === "outlook" ? (
                            <svg className="h-4 w-4" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                          ) : (
                            <Mail size={14} style={{ color: "var(--color-success)" }} />
                          )}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {hasEmail ? mb.emailAddress : `${providerName} account`}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            {providerName} &middot; {statusLabel}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={14} style={{ color: "var(--color-success)" }} />
                        <span className="text-[12px] font-medium" style={{ color: "var(--color-success)" }}>
                          Connected
                        </span>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => signIn("google")}
                className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all"
                style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Connect Gmail
              </button>
              <button
                onClick={() => signIn("microsoft-entra-id")}
                className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all"
                style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                Connect Outlook
              </button>
            </div>
          </div>
        ) : (
          <Card className="mt-4">
            <CardBody>
              <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                Connect your email to capture interactions automatically.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => signIn("google")}
                  className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all"
                  style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Connect Gmail
                </button>
                <button
                  onClick={() => signIn("microsoft-entra-id")}
                  className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all"
                  style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                  Connect Outlook
                </button>
              </div>
            </CardBody>
          </Card>
        )}
      </section>
    </>
  );
}
