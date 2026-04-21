"use client";

import { useState } from "react";
import { ShieldAlert, Plug, Mail, X, Loader2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/**
 * WS-6 scaling-path prompt — surfaces when a user's send is blocked
 * by the WS-1 `primary-with-caps` rail (cold attempt OR daily cap
 * hit). Framed as a protective recommendation, not an error.
 *
 * Two options:
 *  A. Elevay-managed setup (POST /api/settings/sending-infra/request-managed).
 *  B. Connect Instantly (POST .../providers/instantly/connect).
 *
 * Plus a tertiary "remind me later" that dismisses the prompt
 * without blocking the user's ability to keep working on warm leads.
 *
 * Copy tone is deliberately protective + premium — brief §3 WS-6
 * note "if the copy sounds like a paywall or a friction point in
 * review, rewrite it."
 */

export interface ScalingPathPromptProps {
  reason: "cold-on-primary-blocked" | "primary-cap-hit";
  onDismiss?: () => void;
  /** Invoked after a successful option pick (managed request OR
   *  Instantly connection) so the parent can re-render without the
   *  prompt + retry the blocked send. */
  onResolved?: (mode: "elevay-managed-requested" | "external-connected") => void;
}

const HEADLINE_BY_REASON: Record<ScalingPathPromptProps["reason"], string> = {
  "cold-on-primary-blocked":
    "I'm not sending this from your primary inbox.",
  "primary-cap-hit":
    "You've hit today's send cap on your primary inbox.",
};

const SUBLINE_BY_REASON: Record<ScalingPathPromptProps["reason"], string> = {
  "cold-on-primary-blocked":
    "This is cold outreach to a contact we haven't spoken with — sending cold from your primary domain can damage your deliverability within weeks. Two ways to scale this properly:",
  "primary-cap-hit":
    "We cap your primary inbox at a daily limit to protect your deliverability. To keep sending today, scale through a dedicated sender:",
};

export function ScalingPathPrompt({
  reason,
  onDismiss,
  onResolved,
}: ScalingPathPromptProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"managed" | "instantly" | null>(null);
  const [showInstantlyForm, setShowInstantlyForm] = useState(false);
  const [apiKey, setApiKey] = useState("");

  async function requestManaged() {
    setBusy("managed");
    try {
      const res = await fetch("/api/settings/sending-infra/request-managed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: `Triggered from scaling-path prompt (${reason})`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(
        "We'll reach out within 24 hours to set up your dedicated sending domain.",
        "success",
      );
      onResolved?.("elevay-managed-requested");
    } catch (err) {
      console.warn("scaling-path: request-managed failed", err);
      toast("Couldn't submit request — retry?", "error");
    } finally {
      setBusy(null);
    }
  }

  async function connectInstantly() {
    if (apiKey.trim().length < 20) {
      toast("API key must be at least 20 characters", "error");
      return;
    }
    setBusy("instantly");
    try {
      const res = await fetch(
        "/api/settings/sending-infra/providers/instantly/connect",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey.trim() }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Instantly rejected the key", "error");
        return;
      }
      toast("Connected — your send is routing through Instantly now.", "success");
      onResolved?.("external-connected");
    } catch (err) {
      console.warn("scaling-path: instantly connect failed", err);
      toast("Couldn't connect Instantly", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      style={{
        border: "1px solid var(--color-accent)",
        background: "var(--color-accent-soft)",
      }}
    >
      <CardBody>
        <div className="flex items-start gap-2">
          <ShieldAlert size={18} style={{ color: "var(--color-accent)", marginTop: 2 }} />
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {HEADLINE_BY_REASON[reason]}
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {SUBLINE_BY_REASON[reason]}
            </p>
          </div>
          {onDismiss && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-tertiary)",
                padding: 0,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {/* Option A */}
          <div
            className="rounded-md p-3"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <div className="flex items-start gap-2">
              <Mail size={16} style={{ color: "var(--color-accent)", marginTop: 2 }} />
              <div className="flex-1">
                <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  Let us handle it
                </div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Our team sets up a dedicated, warmed sending domain for you. Production-ready in 2-3 weeks after warmup.
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => void requestManaged()}
                disabled={busy !== null}
              >
                {busy === "managed" ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Requesting…
                  </>
                ) : (
                  "Request setup"
                )}
              </Button>
            </div>
          </div>

          {/* Option B */}
          <div
            className="rounded-md p-3"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <div className="flex items-start gap-2">
              <Plug size={16} style={{ color: "var(--color-accent)", marginTop: 2 }} />
              <div className="flex-1">
                <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  I already have Instantly
                </div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Connect your Hypergrowth API key. Encrypted at rest; we never log it.
                </div>
                {showInstantlyForm && (
                  <div className="mt-2 flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Instantly API key"
                        disabled={busy !== null}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void connectInstantly()}
                      disabled={busy !== null}
                    >
                      {busy === "instantly" ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Connecting…
                        </>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                )}
              </div>
              {!showInstantlyForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowInstantlyForm(true)}
                  disabled={busy !== null}
                >
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 text-[11px]"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              textDecoration: "underline",
            }}
          >
            Not ready yet — remind me later
          </button>
        )}
      </CardBody>
    </Card>
  );
}
