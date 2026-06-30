"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ProviderLogo } from "@/components/ui/provider-logo";
import { SalesNavSourcing } from "./_salesnav-sourcing";

/**
 * Spec 36 (T6) — connect a LinkedIn / Sales-Navigator seat from WITHIN Elevay.
 * "Connect LinkedIn" calls /api/linkedin/connect, opens the Unipile hosted-auth
 * URL in a new tab (never an iframe — the captcha breaks framed), and the
 * callback flips the seat to connected. We refresh on window focus so the badge
 * updates when the founder returns from the sign-in tab. The founder never
 * touches the Unipile dashboard.
 */
interface LinkedInSeat {
  id: string;
  status: string;
  displayName: string | null;
  profileUrl: string | null;
  seatType: string;
}

interface StatusPayload {
  configured: boolean;
  account: LinkedInSeat | null;
}

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  pending: "Awaiting sign-in",
  reconnect_required: "Reconnect needed",
  checkpoint: "Security checkpoint",
  disabled: "Disabled",
};

export function LinkedInConnect({ origin }: { origin?: "onboarding" | "settings" } = {}) {
  const { toast } = useToast();
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/connect");
      if (res.ok) setData((await res.json()) as StatusPayload);
    } catch {
      /* ignore — keeps the card silent on a transient fetch error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The hosted-auth login happens in another tab; refresh when we regain focus.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const connect = useCallback(
    async (reconnectAccountId?: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/linkedin/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(reconnectAccountId ? { reconnectAccountId } : {}),
            ...(origin ? { origin } : {}),
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !body.url) {
          toast(body.error ?? "Couldn't start the LinkedIn connection", "error");
          return;
        }
        window.open(body.url, "_blank", "noopener,noreferrer");
        toast("Opened LinkedIn sign-in in a new tab — finish there, then come back.", "success");
      } catch {
        toast("Couldn't start the LinkedIn connection", "error");
      } finally {
        setBusy(false);
      }
    },
    [toast, origin],
  );

  const account = data?.account ?? null;
  const connected = account?.status === "connected";
  const needsReconnect = account?.status === "reconnect_required" || account?.status === "checkpoint";

  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-2">
          <ProviderLogo name="linkedin" size={18} style={{ marginTop: 1 }} />
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Connect LinkedIn (Sales Navigator)
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Connect your LinkedIn seat to run connection + message campaigns, build the warm-path
              graph, and source from Sales Navigator. You sign in on LinkedIn&apos;s secure page in a new
              tab — your password never touches Elevay. Sales Navigator is detected automatically.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {loading ? (
            // Footprint skeleton for the status badge / source form area.
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-40 rounded" />
              </div>
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ) : !data?.configured ? (
            <div
              className="rounded-md p-3 text-[12px]"
              style={{ background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.3)" }}
            >
              <span style={{ color: "rgb(133,77,14)" }}>
                Unipile isn&apos;t configured yet. Add UNIPILE_API_KEY and UNIPILE_DSN (plus
                UNIPILE_WEBHOOK_SECRET) to enable connecting.
              </span>
            </div>
          ) : connected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: "rgba(22,163,74,.1)", color: "rgb(22,163,74)" }}
                >
                  {STATUS_LABEL.connected}
                </span>
                <span className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  {account?.displayName ?? account?.profileUrl ?? "LinkedIn seat"}
                  {account?.seatType && account.seatType !== "classic" ? ` · ${account.seatType.replace("_", " ")}` : ""}
                </span>
                <Button size="sm" variant="outline" onClick={() => void connect(account?.id)} disabled={busy}>
                  Reconnect
                </Button>
              </div>

              <SalesNavSourcing />
            </div>
          ) : needsReconnect ? (
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: "rgba(234,179,8,.12)", color: "rgb(133,77,14)" }}
              >
                {STATUS_LABEL[account!.status]}
              </span>
              <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                The LinkedIn session expired — reconnect to resume sending.
              </span>
              <Button size="sm" onClick={() => void connect(account?.id)} disabled={busy}>
                Reconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {account?.status === "pending" && (
                <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {STATUS_LABEL.pending} — open the sign-in tab to finish.
                </span>
              )}
              <Button size="sm" onClick={() => void connect()} disabled={busy}>
                <ProviderLogo name="linkedin" size={14} /> Connect LinkedIn
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
