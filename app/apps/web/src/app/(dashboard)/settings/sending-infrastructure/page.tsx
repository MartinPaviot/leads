"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Shield, Loader2, Save, Plug } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type SendingMode =
  | "primary-with-caps"
  | "external-connected"
  | "elevay-managed-requested"
  | "elevay-managed-active";

interface SendingInfraPayload {
  mode: SendingMode;
  sendingDailyCapPrimary: number;
  sendingAllowColdOnPrimary: boolean;
  providers: { instantly: { connected: boolean } };
  pendingManagedRequest: {
    id: string;
    status: string;
    requestedAt: string;
    assigneeEmail: string | null;
    notes: string | null;
  } | null;
}

export default function SendingInfrastructurePage() {
  const { toast } = useToast();
  const [payload, setPayload] = useState<SendingInfraPayload | null>(null);
  const [capInput, setCapInput] = useState<string>("20");
  const [coldAllowed, setColdAllowed] = useState(false);
  const [instantlyKey, setInstantlyKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/sending-infra");
      if (!res.ok) {
        toast("Couldn't load sending infrastructure", "error");
        return;
      }
      const data = (await res.json()) as SendingInfraPayload;
      setPayload(data);
      setCapInput(String(data.sendingDailyCapPrimary));
      setColdAllowed(data.sendingAllowColdOnPrimary);
    } catch (err) {
      console.warn("sending-infra: load failed", err);
      toast("Couldn't load sending infrastructure", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCaps() {
    const capNum = Number(capInput);
    if (!Number.isFinite(capNum) || capNum < 0 || capNum > 10_000) {
      toast("Daily cap must be a number between 0 and 10000", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sending-infra", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sendingDailyCapPrimary: capNum,
          sendingAllowColdOnPrimary: coldAllowed,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Saved", "success");
      await load();
    } catch (err) {
      console.warn("sending-infra: save failed", err);
      toast("Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function connectInstantly() {
    if (instantlyKey.trim().length < 20) {
      toast("API key must be at least 20 characters", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        "/api/settings/sending-infra/providers/instantly/connect",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: instantlyKey.trim() }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) {
        toast(
          data.error ?? "Instantly rejected the key",
          "error",
        );
        return;
      }
      toast("Instantly connected", "success");
      setInstantlyKey("");
      await load();
    } catch (err) {
      console.warn("sending-infra: connect failed", err);
      toast("Couldn't connect Instantly", "error");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectInstantly() {
    setSaving(true);
    try {
      const res = await fetch(
        "/api/settings/sending-infra/providers/instantly/disconnect",
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Instantly disconnected", "success");
      await load();
    } catch (err) {
      console.warn("sending-infra: disconnect failed", err);
      toast("Couldn't disconnect", "error");
    } finally {
      setSaving(false);
    }
  }

  async function requestManaged() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sending-infra/request-managed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        alreadyRequested?: boolean;
      };
      if (!res.ok) throw new Error("Request failed");
      toast(
        data.alreadyRequested
          ? "You already have an active request"
          : "Request sent to Elevay ops",
        "success",
      );
      await load();
    } catch (err) {
      console.warn("sending-infra: request failed", err);
      toast("Couldn't send request", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !payload) {
    return (
      <>
        <PageHeader
          icon={<Mail size={18} />}
          title="Sending infrastructure"
          subtitle="Loading…"
        />
        <div className="flex items-center gap-2 p-4 text-[12px]">
          <Loader2 size={14} className="animate-spin" /> Loading
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={<Mail size={18} />}
        title="Sending infrastructure"
        subtitle="Where outbound emails leave from, and the protections around your primary domain."
      />

      <div className="space-y-4 p-4">
        {/* ── Primary inbox caps ── */}
        <Card>
          <CardBody>
            <div className="flex items-start gap-2">
              <Shield size={16} style={{ color: "var(--color-accent)", marginTop: 2 }} />
              <div className="flex-1">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Primary inbox protections
                </h2>
                <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Sends leave from your connected Gmail or Outlook. We cap daily volume and block cold
                  outreach unless you explicitly allow it — cold sends from a primary domain can damage
                  deliverability within weeks.
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Daily cap (sends per day)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10_000}
                  value={capInput}
                  onChange={(e) => setCapInput(e.target.value)}
                  disabled={saving}
                  style={{ maxWidth: 120 }}
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={coldAllowed}
                  onChange={(e) => setColdAllowed(e.target.checked)}
                  disabled={saving}
                />
                <span className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  Allow cold outreach from primary inbox (not recommended)
                </span>
              </label>

              <Button size="sm" onClick={() => void saveCaps()} disabled={saving}>
                <Save size={13} /> Save caps
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* ── Instantly connect ── */}
        <Card>
          <CardBody>
            <div className="flex items-start gap-2">
              <Plug size={16} style={{ color: "var(--color-accent)", marginTop: 2 }} />
              <div className="flex-1">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Connect Instantly
                </h2>
                <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Route outbound email through your own Instantly Hypergrowth account. Your API key is
                  encrypted at rest with AES-GCM; we never log it or return it in responses.
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {payload?.providers.instantly.connected ? (
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px]"
                    style={{
                      background: "rgba(22,163,74,.1)",
                      color: "rgb(22,163,74)",
                    }}
                  >
                    Connected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void disconnectInstantly()}
                    disabled={saving}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label
                      className="text-[11px] font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Instantly API key
                    </label>
                    <Input
                      type="password"
                      value={instantlyKey}
                      onChange={(e) => setInstantlyKey(e.target.value)}
                      disabled={saving}
                      placeholder="Paste your Instantly Hypergrowth API key"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void connectInstantly()}
                    disabled={saving}
                  >
                    Connect
                  </Button>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* ── Elevay-managed setup request ── */}
        <Card>
          <CardBody>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Elevay-managed sending domain
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Our ops team sets up a dedicated, warmed domain for you. Production-ready sends typically
              2-3 weeks after warmup. Reach out when you&apos;re ready to scale cold outreach safely.
            </p>

            {payload?.pendingManagedRequest ? (
              <div
                className="mt-3 rounded-md p-3 text-[12px]"
                style={{
                  background: "rgba(234,179,8,.08)",
                  border: "1px solid rgba(234,179,8,.3)",
                }}
              >
                <div className="font-medium" style={{ color: "rgb(133,77,14)" }}>
                  Request in progress
                </div>
                <div className="mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                  Status: {payload.pendingManagedRequest.status} · Requested{" "}
                  {new Date(payload.pendingManagedRequest.requestedAt).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                className="mt-3"
                onClick={() => void requestManaged()}
                disabled={saving}
              >
                Request managed setup
              </Button>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
