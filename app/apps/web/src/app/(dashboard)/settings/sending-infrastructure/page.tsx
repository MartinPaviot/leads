"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, Loader2, Save, Plug, Phone } from "lucide-react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/locale";
import { InstantlyMailboxes } from "./_instantly-mailboxes";
import { LinkedInConnect } from "./_linkedin-connect";
// (VoiceSection uses Card, Button, Input, useToast above — useCallback +
// useEffect + useState are already imported for the parent page.)

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

  // Pull every mailbox on the connected Instantly workspace into this user's
  // unified inbox (Settings → ... → Inbox rail). Idempotent — re-running only
  // adds boxes not yet imported.
  async function runInstantlyImport() {
    setSaving(true);
    try {
      const res = await fetch(
        "/api/settings/sending-infra/providers/instantly/import",
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        imported?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        toast(data.error ?? "Import failed", "error");
        return;
      }
      toast(
        `Imported ${data.imported ?? 0} new of ${data.total ?? 0} Instantly mailboxes`,
        "success",
      );
    } catch (err) {
      console.warn("sending-infra: instantly import failed", err);
      toast("Couldn't import from Instantly", "error");
    } finally {
      setSaving(false);
    }
  }

  // Pull the Instantly Unibox (replies) into the inbox now. The 15-min cron
  // runs the same path; this is the on-demand trigger.
  async function runInstantlyUniboxSync() {
    setSaving(true);
    try {
      const res = await fetch(
        "/api/settings/sending-infra/providers/instantly/sync",
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        inserted?: number;
        inbound?: number;
        error?: string;
      };
      if (!res.ok) {
        toast(data.error ?? "Sync failed", "error");
        return;
      }
      const n = data.inserted ?? 0;
      toast(`Synced — ${n} new repl${n === 1 ? "y" : "ies"} pulled into the inbox`, "success");
    } catch (err) {
      console.warn("sending-infra: instantly unibox sync failed", err);
      toast("Couldn't sync the Instantly inbox", "error");
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
          : "Request sent to Orion ops",
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
        <SettingsHeader
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
      <SettingsHeader
        title="Sending infrastructure"
        subtitle="Where outbound emails leave from, and the protections around your primary domain."
      />

      <div className="space-y-4">
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
                    onClick={() => void runInstantlyImport()}
                    disabled={saving}
                  >
                    Import mailboxes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void runInstantlyUniboxSync()}
                    disabled={saving}
                  >
                    Sync inbox
                  </Button>
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

            {/* Assign imported Instantly boxes to reps (one shared workspace). */}
            {payload?.providers.instantly.connected && <InstantlyMailboxes />}
          </CardBody>
        </Card>

        {/* ── LinkedIn / Sales Navigator connect (spec 36, T6) ── */}
        <LinkedInConnect />

        {/* ── Voice (Twilio + Deepgram) — voice-cold-call Phase 1 ── */}
        <VoiceSection />

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

interface VoiceConfigPayload {
  configured: boolean;
  ready: boolean;
  pool: Array<{ e164: string; countryCode: string; areaCode: string | null }>;
  usage: {
    yearMonth: string;
    minutesUsed: number;
    minutesIncluded: number;
    hardCeiling: number;
    capReached: boolean;
    hardCeilingReached: boolean;
  } | null;
}

function VoiceSection() {
  const { toast } = useToast();
  const t = useT();
  const [data, setData] = useState<VoiceConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [country, setCountry] = useState("FR");
  const [areaCode, setAreaCode] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/calls/config");
      if (!res.ok) return;
      const json = (await res.json()) as VoiceConfigPayload;
      setData(json);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleBuy = useCallback(async () => {
    if (buying) return;
    setBuying(true);
    try {
      const res = await fetch("/api/calls/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: country,
          areaCode: areaCode.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body?.code ?? "unknown";
        toast(
          code === "no_inventory"
            ? t("voice.noInventory")
            : code === "voice_not_configured"
              ? t("voice.notConfiguredEnv")
              : t("voice.buyFailed", { code }),
          "error",
        );
      } else {
        toast(t("voice.provisioned"), "success");
        setAreaCode("");
        await refresh();
      }
    } catch (err) {
      toast(
        t("voice.buyError", { msg: err instanceof Error ? err.message : String(err) }),
        "error",
      );
    } finally {
      setBuying(false);
    }
  }, [buying, country, areaCode, toast, refresh]);

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2">
          <Phone size={16} style={{ color: "var(--color-text-tertiary)" }} />
          <h2
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {t("voice.title")}
          </h2>
        </div>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {t("voice.desc")}
        </p>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Loader2 size={12} className="animate-spin" />
            {t("voice.loadingConfig")}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div
              className="rounded-md p-3 text-[12px]"
              style={{
                background: data?.configured
                  ? "rgba(34,197,94,.08)"
                  : "rgba(234,179,8,.08)",
                border: data?.configured
                  ? "1px solid rgba(34,197,94,.3)"
                  : "1px solid rgba(234,179,8,.3)",
              }}
            >
              <div className="font-medium" style={{
                color: data?.configured ? "rgb(21,128,61)" : "rgb(133,77,14)",
              }}>
                {data?.configured
                  ? t("voice.connected")
                  : t("voice.notConfigured")}
              </div>
              <div className="mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                {data?.configured
                  ? data.ready
                    ? t("voice.poolActive", { n: data.pool.length })
                    : t("voice.noOutbound")
                  : t("voice.addCreds")}
              </div>
            </div>

            {data?.usage && (
              <div
                className="rounded-md p-3 text-[12px]"
                style={{
                  background: "var(--color-bg-hover)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {t("voice.usageLabel", { month: data.usage.yearMonth })}
                </div>
                <div className="mt-1" style={{ color: "var(--color-text-tertiary)" }}>
                  {t("voice.usageMinutes", { used: data.usage.minutesUsed, included: data.usage.minutesIncluded })}
                  {data.usage.capReached &&
                    !data.usage.hardCeilingReached &&
                    t("voice.usageOverage")}
                  {data.usage.hardCeilingReached && t("voice.usageCeiling")}
                </div>
              </div>
            )}

            {data?.pool && data.pool.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
                  {t("voice.provisionedNumbers")}
                </div>
                <ul className="mt-1 space-y-0.5 text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  {data.pool.map((n) => (
                    <li key={n.e164}>
                      {n.e164}{" "}
                      <span style={{ color: "var(--color-text-tertiary)" }}>
                        ({n.countryCode}{n.areaCode ? ` · ${n.areaCode}` : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data?.configured && (
              <div className="pt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
                  {t("voice.buyNumber")}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-8 rounded-md border px-2 text-[12px]"
                    style={{
                      background: "var(--color-bg-card)",
                      borderColor: "var(--color-border-default)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <option value="FR">FR · France</option>
                    <option value="US">US · United States</option>
                    <option value="GB">GB · United Kingdom</option>
                    <option value="BE">BE · Belgique</option>
                    <option value="CH">CH · Suisse</option>
                    <option value="CA">CA · Canada</option>
                  </select>
                  <Input
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value)}
                    placeholder={t("voice.areaPlaceholder")}
                    className="h-8 max-w-[200px] text-[12px]"
                  />
                  <Button size="sm" onClick={() => void handleBuy()} disabled={buying}>
                    {buying ? t("voice.buying") : t("voice.buy")}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {t("voice.buyHelper")}
                </p>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
