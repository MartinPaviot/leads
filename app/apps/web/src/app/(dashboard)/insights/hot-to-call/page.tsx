"use client";

/**
 * /insights/hot-to-call — callable hot leads list.
 *
 * Polls /api/dashboard/hot-to-call every 30s. Each card surfaces a
 * contact with a phone number plus the most-impactful recent signal
 * (click > visit > open) and a "speed-to-lead" badge when the last
 * signal is < 5 minutes old.
 *
 * The Call button is currently disabled with a tooltip — the Twilio +
 * Deepgram dialer lives on `feat/voice-cold-call` and isn't on main
 * yet. The page is wired so a 1-line change activates calling once
 * that branch merges.
 */

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Phone, MousePointerClick, Eye, Globe, Flame } from "lucide-react";

type SignalKind = "click" | "visit" | "open";

type Item = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
  hotness: number;
  isSpeedWindow: boolean;
  lastSignal: {
    kind: SignalKind;
    at: string;
    minutesAgo: number;
    detail: string | null;
  };
  signals: Array<{
    kind: SignalKind;
    at: string;
    detail: string | null;
  }>;
};

type Response = {
  items: Item[];
  windowHours: number;
  generatedAt: string;
};

const POLL_MS = 30_000;
const DEFAULT_HOURS = 168;

export default function HotToCallPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [windowHours, setWindowHours] = useState(DEFAULT_HOURS);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [dialingContactId, setDialingContactId] = useState<string | null>(null);

  const startCall = useCallback(
    async (contactId: string) => {
      setDialingContactId(contactId);
      try {
        const res = await fetch("/api/calls/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          callId?: string;
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          if (data.code === "voice_not_configured") {
            toast(
              "Voice not configured — add Twilio creds in Settings → Voice.",
              "error",
            );
          } else if (data.code === "no_phone") {
            toast("Contact has no phone number.", "error");
          } else if (data.code === "dnc") {
            toast("Contact is on the Do Not Call list.", "error");
          } else if (data.code === "quiet_hours") {
            toast(
              "Outside quiet-hours window for this contact's timezone.",
              "error",
            );
          } else {
            toast(data.error ?? `Call failed (${res.status})`, "error");
          }
          return;
        }
        toast(`Call initiated — ringing…`, "success");
        router.push("/call-mode");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Network error", "error");
      } finally {
        setDialingContactId(null);
      }
    },
    [toast, router],
  );

  const fetchItems = useCallback(async (windowH: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/hot-to-call?hours=${windowH}&limit=100`,
      );
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      const data: Response = await res.json();
      setItems(data.items);
      setWindowHours(data.windowHours);
      setGeneratedAt(data.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(hours);
    const id = setInterval(() => fetchItems(hours), POLL_MS);
    return () => clearInterval(id);
  }, [hours, fetchItems]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Hot to call"
        subtitle="Contacts who opened, clicked, or visited recently — sorted by how hot. Polls every 30s."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            <WindowChip
              active={hours === 1}
              label="Last hour"
              onClick={() => setHours(1)}
            />
            <WindowChip
              active={hours === 24}
              label="Last 24h"
              onClick={() => setHours(24)}
            />
            <WindowChip
              active={hours === 168}
              label="Last 7d"
              onClick={() => setHours(168)}
            />
          </div>
          <div
            className="text-[11px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {generatedAt ? (
              <>
                {items.length} contacts · last refresh{" "}
                {new Date(generatedAt).toLocaleTimeString()} · window{" "}
                {windowHours}h
              </>
            ) : (
              "Loading…"
            )}
          </div>
        </div>

        {error && (
          <div
            className="mb-3 rounded border p-3 text-[12px]"
            style={{
              borderColor: "var(--color-error)",
              color: "var(--color-error)",
              background: "var(--color-bg-card)",
            }}
          >
            {error}
          </div>
        )}

        {!loading && items.length === 0 && (
          <EmptyState hours={windowHours} />
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <HotCard
              key={item.contactId}
              item={item}
              onCall={startCall}
              dialing={dialingContactId === item.contactId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WindowChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active ? "var(--color-accent)" : "var(--color-bg-card)",
        color: active ? "#fff" : "var(--color-text-secondary)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {label}
    </button>
  );
}

function HotCard({
  item,
  onCall,
  dialing,
}: {
  item: Item;
  onCall: (contactId: string) => void;
  dialing: boolean;
}) {
  const SignalIcon = SIGNAL_ICON[item.lastSignal.kind];
  const signalLabel = SIGNAL_LABEL[item.lastSignal.kind];
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className="truncate text-[14px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {item.name}
              </p>
              {item.isSpeedWindow && (
                <span
                  className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: "var(--color-error)",
                    color: "#fff",
                  }}
                >
                  <Flame size={10} /> Speed window
                </span>
              )}
              <span
                className="ml-auto text-[11px] font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Hotness {item.hotness.toFixed(1)}
              </span>
            </div>
            <p
              className="mt-0.5 text-[11px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {item.title && <span>{item.title} · </span>}
              {item.companyName || item.companyDomain || "—"}
            </p>
            <div
              className="mt-2 flex items-center gap-2 text-[12px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <SignalIcon size={12} />
              <span style={{ color: "var(--color-text-primary)" }}>
                {signalLabel} · {item.lastSignal.minutesAgo} min ago
              </span>
              {item.lastSignal.detail && (
                <span className="truncate" style={{ opacity: 0.7 }}>
                  · {item.lastSignal.detail}
                </span>
              )}
            </div>
            {item.signals.length > 1 && (
              <div
                className="mt-2 flex flex-wrap gap-1 text-[10px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {item.signals.slice(0, 8).map((s, i) => {
                  const Icon = SIGNAL_ICON[s.kind];
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                      style={{
                        background: "var(--color-bg-card)",
                        border: "1px solid var(--color-border-default)",
                      }}
                    >
                      <Icon size={9} /> {SIGNAL_LABEL[s.kind]}
                    </span>
                  );
                })}
                {item.signals.length > 8 && (
                  <span className="px-1">+{item.signals.length - 8}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p
              className="text-[11px] font-mono"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {item.phone}
            </p>
            <button
              onClick={() => onCall(item.contactId)}
              disabled={dialing}
              title="Dial via Twilio + Deepgram softphone"
              className="flex items-center gap-1 rounded px-3 py-1 text-[12px] font-medium"
              style={{
                color: "#fff",
                background: "var(--color-accent)",
                border: "1px solid var(--color-accent)",
                cursor: dialing ? "not-allowed" : "pointer",
                opacity: dialing ? 0.6 : 1,
              }}
            >
              <Phone size={12} /> {dialing ? "Dialing…" : "Call"}
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

const SIGNAL_ICON: Record<SignalKind, typeof Phone> = {
  click: MousePointerClick,
  visit: Globe,
  open: Eye,
};

const SIGNAL_LABEL: Record<SignalKind, string> = {
  click: "Clicked",
  visit: "Visited",
  open: "Opened",
};

function EmptyState({ hours }: { hours: number }) {
  return (
    <div
      className="rounded border p-6 text-center text-[12px]"
      style={{
        borderColor: "var(--color-border-default)",
        color: "var(--color-text-tertiary)",
      }}
    >
      No callable hot leads in the last {hours}h. Either no engagement signals
      have fired yet, or the engaged contacts don't have a phone number on
      file. Phone numbers are added automatically when contacts are enriched.
    </div>
  );
}
