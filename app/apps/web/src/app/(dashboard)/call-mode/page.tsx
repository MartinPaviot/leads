"use client";

/**
 * /call-mode — three-column cold-call cockpit.
 *
 * Phase 1 ships: queue + brief + softphone states (idle / dialing /
 * ringing / connected / ended). Live transcription rendering is wired
 * to /api/calls/[id]/events SSE; the streaming WS that pipes Twilio
 * Media Streams → Deepgram lands in Phase 1.5 (the SSE channel itself
 * is here today so the UI plumbing is settled).
 *
 * No emoji per the brand rule — Lucide `Phone`, `MicOff`, `PhoneOff`
 * carry the visual semantics.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  MicOff,
  Mic,
  Voicemail,
  AlertCircle,
  Loader2,
  Sparkles,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

interface QueueItem {
  contactId: string;
  contactName: string;
  title: string | null;
  companyName: string | null;
  phone: string;
  score: number;
  intentScore: number;
  accessibilityScore: number;
  dealValueWeight: number;
  localTime: string;
  localTimezone: string;
  latestSignal: { type: string; label: string } | null;
}

interface VoiceConfig {
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

type SoftphoneState =
  | { kind: "idle" }
  | { kind: "starting"; contactId: string }
  | { kind: "dialing"; callId: string; toNumber: string }
  | { kind: "ringing"; callId: string; toNumber: string; ringingSinceMs: number }
  | { kind: "connected"; callId: string; toNumber: string; connectedAtMs: number; muted: boolean }
  | { kind: "ended"; callId: string; outcome: string | null };

interface CoachingCardData {
  ts: number;
  objectionClass: string;
  label: string;
  prospectQuote: string;
  suggestedResponses: string[];
}

interface TranscriptChunk {
  speaker: "agent" | "prospect" | string;
  text: string;
  tsMs?: number;
}

export default function CallModePage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [filter, setFilter] = useState<"all" | "high_intent" | "trial_expiring" | "reply_received">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [softphone, setSoftphone] = useState<SoftphoneState>({ kind: "idle" });
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [amdDetected, setAmdDetected] = useState<string | null>(null);
  const [voicemailDropping, setVoicemailDropping] = useState(false);
  const [voicemailDropped, setVoicemailDropped] = useState(false);
  // Phase 3 — live coaching cards. Each card auto-dismisses after 12s
  // unless the user manually closes it. Newest on top, max 5 visible.
  const [coachingCards, setCoachingCards] = useState<CoachingCardData[]>([]);

  // SSE subscription handle so we can tear down on unmount / hangup.
  const eventSourceRef = useRef<EventSource | null>(null);
  // Twilio Device handle — typed loosely because the SDK is lazy-loaded.
  const deviceRef = useRef<{ disconnectAll: () => void } | null>(null);

  // Bootstrap: load voice config + queue in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfgRes, qRes] = await Promise.all([
          fetch("/api/calls/config"),
          fetch("/api/calls/queue?limit=50"),
        ]);
        if (cancelled) return;
        if (cfgRes.ok) setConfig(await cfgRes.json());
        if (qRes.ok) {
          const data = await qRes.json();
          setQueue(data.calls ?? []);
          if ((data.calls ?? []).length > 0) {
            setSelectedId(data.calls[0].contactId);
          }
        }
      } catch (err) {
        console.warn("call-mode bootstrap failed", err);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
    };
  }, []);

  const selected = useMemo(
    () => queue.find((q) => q.contactId === selectedId) ?? null,
    [queue, selectedId],
  );

  const filteredQueue = useMemo(() => {
    if (filter === "all") return queue;
    if (filter === "high_intent") {
      return queue.filter((q) => q.intentScore >= 0.7);
    }
    // Other filters are placeholders for Phase 2 chips — return the
    // full list rather than empty so the UX is never broken when a
    // tenant has no qualifying signal yet.
    return queue;
  }, [queue, filter]);

  const handleAppeler = useCallback(
    async (contactId: string) => {
      setSoftphone({ kind: "starting", contactId });
      setTranscript([]);
      setAmdDetected(null);
      setVoicemailDropping(false);
      setVoicemailDropped(false);
      setCoachingCards([]);
      try {
        const res = await fetch("/api/calls/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const code = body?.code ?? "unknown";
          toast(
            code === "voice_not_configured"
              ? "Configurez Twilio dans Settings → Voice avant d'appeler."
              : code === "dnc"
                ? "Ce contact est sur la liste DNC du workspace."
                : code === "quiet_hours"
                  ? `Hors plages d'appel — fuseau ${body.timezone} (${body.localTime}). Réessayez plus tard.`
                  : code === "usage_cap"
                    ? "Plafond mensuel atteint. Voir Settings → Voice."
                    : code === "no_pool_number"
                      ? "Aucun numéro sortant provisionné. Achetez-en un dans Settings → Voice."
                      : `Échec démarrage appel (${code}).`,
            "error",
          );
          setSoftphone({ kind: "idle" });
          return;
        }
        const data = await res.json();
        setSoftphone({
          kind: "dialing",
          callId: data.callId,
          toNumber: data.toNumber,
        });

        // Subscribe to per-call SSE — transcript chunks + state updates.
        // The endpoint is implemented but only emits final-state events
        // in Phase 1; streaming chunks plug in here once Media Streams
        // ships in Phase 1.5.
        eventSourceRef.current?.close();
        const es = new EventSource(`/api/calls/${data.callId}/events`);
        eventSourceRef.current = es;
        es.addEventListener("ringing", () => {
          setSoftphone((s) =>
            s.kind === "dialing"
              ? {
                  kind: "ringing",
                  callId: s.callId,
                  toNumber: s.toNumber,
                  ringingSinceMs: Date.now(),
                }
              : s,
          );
        });
        es.addEventListener("connected", () => {
          setSoftphone((s) =>
            s.kind === "ringing" || s.kind === "dialing"
              ? {
                  kind: "connected",
                  callId: s.callId,
                  toNumber: s.toNumber,
                  connectedAtMs: Date.now(),
                  muted: false,
                }
              : s,
          );
        });
        es.addEventListener("amd_detected", (evt) => {
          try {
            const payload = JSON.parse((evt as MessageEvent).data) as {
              answeredBy?: string;
            };
            setAmdDetected(payload.answeredBy ?? "machine");
          } catch {
            setAmdDetected("machine");
          }
        });
        es.addEventListener("human_detected", () => {
          setAmdDetected(null);
        });
        es.addEventListener("voicemail_dropped", () => {
          setVoicemailDropped(true);
          setVoicemailDropping(false);
        });
        es.addEventListener("coaching_card", (evt) => {
          try {
            const card = JSON.parse(
              (evt as MessageEvent).data,
            ) as CoachingCardData;
            setCoachingCards((prev) => [card, ...prev].slice(0, 5));
            // Auto-dismiss after 12s — peripheral signal, not a TODO list.
            setTimeout(() => {
              setCoachingCards((prev) => prev.filter((c) => c.ts !== card.ts));
            }, 12_000);
          } catch {
            /* ignore malformed card */
          }
        });
        es.addEventListener("transcript", (evt) => {
          try {
            const chunk = JSON.parse((evt as MessageEvent).data) as TranscriptChunk;
            setTranscript((prev) => [...prev, chunk]);
          } catch {
            // ignore malformed chunk
          }
        });
        es.addEventListener("ended", (evt) => {
          try {
            const payload = JSON.parse((evt as MessageEvent).data) as {
              outcome?: string;
            };
            setSoftphone((s) =>
              s.kind === "idle"
                ? s
                : {
                    kind: "ended",
                    callId: "callId" in s ? s.callId : data.callId,
                    outcome: payload.outcome ?? null,
                  },
            );
          } catch {
            setSoftphone((s) =>
              s.kind === "idle"
                ? s
                : { kind: "ended", callId: "callId" in s ? s.callId : data.callId, outcome: null },
            );
          }
          es.close();
          eventSourceRef.current = null;
        });

        // Twilio Voice SDK Device — lazy-loaded so the chunk only ships
        // on this page. `device.connect()` actually attaches the local
        // mic/speakers to the bridged Twilio leg.
        try {
          const mod = await import("@twilio/voice-sdk");
          const Device = (mod as { Device: new (token: string) => unknown }).Device;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const device: any = new Device(data.capabilityToken);
          deviceRef.current = device;
          await device.register?.();
          // The `params` carry the Elevay call id back into the TwiML
          // webhook, which already knows about it via the query string,
          // but we duplicate here for the conference path Phase 2 needs.
          await device.connect?.({
            params: { callId: data.callId, toNumber: data.toNumber },
          });
        } catch (err) {
          console.warn(
            "call-mode: @twilio/voice-sdk load/connect failed (browser RTC unavailable). Bridge will still proceed server-side.",
            err,
          );
          // Server-side bridge keeps running even if the browser leg
          // failed to attach — the prospect just hears silence. We
          // surface a non-fatal warning toast and the user can hang up.
          toast(
            "Audio navigateur indisponible — l'appel a démarré côté serveur, raccrochez si nécessaire.",
            "info",
          );
        }
      } catch (err) {
        console.warn("call-mode: start error", err);
        toast(`Erreur démarrage appel: ${err instanceof Error ? err.message : String(err)}`, "error");
        setSoftphone({ kind: "idle" });
      }
    },
    [toast],
  );

  const handleDropVoicemail = useCallback(
    async (callId: string) => {
      if (voicemailDropping || voicemailDropped) return;
      setVoicemailDropping(true);
      try {
        const res = await fetch(`/api/calls/${callId}/voicemail-drop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const code = body?.code ?? "unknown";
          toast(
            code === "no_voicemail_source"
              ? "Aucun voicemail template ou VOICE_VOICEMAIL_DEFAULT_URL configuré."
              : code === "ended"
                ? "L'appel est déjà terminé."
                : code === "no_sid"
                  ? "L'appel n'est pas encore attaché à Twilio."
                  : `Échec drop voicemail (${code}).`,
            "error",
          );
          setVoicemailDropping(false);
          return;
        }
        // SSE will fire voicemail_dropped to confirm; we keep the
        // dropping flag true until then to avoid double-click races.
      } catch (err) {
        toast(
          `Erreur drop voicemail: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
        setVoicemailDropping(false);
      }
    },
    [toast, voicemailDropping, voicemailDropped],
  );

  const handleHangup = useCallback(async () => {
    try {
      deviceRef.current?.disconnectAll();
    } catch {
      /* ignore */
    }
    deviceRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setSoftphone((s) =>
      s.kind === "idle" || s.kind === "ended"
        ? s
        : { kind: "ended", callId: "callId" in s ? s.callId : "", outcome: null },
    );
  }, []);

  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!config?.configured) {
    return (
      <div className="p-8">
        <PageHeader title="Call Mode" subtitle="Cold call autonome depuis Elevay" />
        <EmptyState
          icon={<Phone size={20} />}
          title="Voice n'est pas encore configuré"
          description="Pour activer Call Mode, configurez Twilio dans Settings → Voice. Vous aurez besoin d'un Account SID, d'un Auth Token et d'au moins un numéro sortant provisionné."
          actionLabel="Aller dans Settings → Voice"
          onAction={() => {
            window.location.href = "/settings/sending-infrastructure";
          }}
        />
      </div>
    );
  }

  if (!config.ready) {
    return (
      <div className="p-8">
        <PageHeader title="Call Mode" subtitle="Cold call autonome depuis Elevay" />
        <EmptyState
          icon={<Phone size={20} />}
          title="Aucun numéro sortant provisionné"
          description="Twilio est connecté mais aucun numéro n'est encore acheté. Allez dans Settings → Voice pour en provisionner un (un par pays cible, idéalement par area code US si vous appelez les US)."
          actionLabel="Provisionner un numéro"
          onAction={() => {
            window.location.href = "/settings/sending-infrastructure";
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] w-full relative">
      {/* Phase 3 — live coaching overlay. Bottom-right, peripheral. */}
      {coachingCards.length > 0 && (
        <CoachingCardsOverlay
          cards={coachingCards}
          onDismiss={(ts) =>
            setCoachingCards((prev) => prev.filter((c) => c.ts !== ts))
          }
        />
      )}

      {/* ───── LEFT — Queue (320px) ───── */}
      <aside className="w-80 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            À appeler maintenant
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {filteredQueue.length} contact{filteredQueue.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(
              [
                ["all", "Tous"],
                ["high_intent", "High intent"],
                ["trial_expiring", "Trial expiring"],
                ["reply_received", "Reply received"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition ${
                  filter === k
                    ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                    : "bg-transparent text-zinc-600 border-zinc-200 dark:text-zinc-400 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredQueue.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">
              File vide. Importez ou enrichissez des contacts pour démarrer.
            </div>
          ) : (
            filteredQueue.map((item) => {
              const active = item.contactId === selectedId;
              return (
                <button
                  key={item.contactId}
                  onClick={() => setSelectedId(item.contactId)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 transition ${
                    active
                      ? "bg-zinc-50 dark:bg-zinc-900/50"
                      : "hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {item.contactName}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        {item.title ?? "—"} · {item.companyName ?? "—"}
                      </div>
                    </div>
                    <Badge className="shrink-0">
                      {Math.round(item.score * 100)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-500">
                    <Clock className="h-3 w-3" />
                    <span>
                      {item.localTime} {item.localTimezone.split("/")[1] ?? ""}
                    </span>
                    {item.latestSignal && (
                      <>
                        <span>·</span>
                        <Sparkles className="h-3 w-3" />
                        <span className="truncate">{item.latestSignal.label}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ───── CENTER — Brief + softphone (flex-1) ───── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {selected ? (
          <>
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {selected.contactName}
                  </h1>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {selected.title ?? "—"} · {selected.companyName ?? "—"} ·{" "}
                    {selected.phone}
                  </p>
                </div>
                <SoftphoneControls
                  state={softphone}
                  selected={selected}
                  onCall={handleAppeler}
                  onHangup={handleHangup}
                  onDropVoicemail={handleDropVoicemail}
                  voicemailDropping={voicemailDropping}
                  voicemailDropped={voicemailDropped}
                />
              </div>
              {amdDetected && !voicemailDropped && (
                <div
                  className="mt-3 rounded-md p-2.5 text-[12px] flex items-center justify-between"
                  style={{
                    background: "rgba(234,179,8,.08)",
                    border: "1px solid rgba(234,179,8,.3)",
                    color: "rgb(133,77,14)",
                  }}
                >
                  <span>
                    Répondeur détecté ({amdDetected}). Drop le voicemail ou raccroche.
                  </span>
                  {"callId" in softphone && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleDropVoicemail(softphone.callId)}
                      disabled={voicemailDropping}
                    >
                      <Voicemail className="h-3.5 w-3.5" />
                      {voicemailDropping ? "Drop en cours…" : "Drop voicemail"}
                    </Button>
                  )}
                </div>
              )}
              {voicemailDropped && (
                <div
                  className="mt-3 rounded-md p-2.5 text-[12px]"
                  style={{
                    background: "rgba(34,197,94,.08)",
                    border: "1px solid rgba(34,197,94,.3)",
                    color: "rgb(21,128,61)",
                  }}
                >
                  Voicemail droppé. La ligne raccroche automatiquement.
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {softphone.kind === "connected" || softphone.kind === "ended" ? (
                <LiveTranscript chunks={transcript} state={softphone} />
              ) : (
                <BriefPreview selected={selected} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
            Sélectionnez un contact dans la file.
          </div>
        )}
      </main>

      {/* ───── RIGHT — Account brain (380px) ───── */}
      <aside className="w-96 shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto">
        {selected ? (
          <AccountBrainPanel contactId={selected.contactId} />
        ) : (
          <div className="p-6 text-sm text-zinc-500">—</div>
        )}
      </aside>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────

function SoftphoneControls(props: {
  state: SoftphoneState;
  selected: QueueItem;
  onCall: (contactId: string) => void;
  onHangup: () => void;
  onDropVoicemail: (callId: string) => void;
  voicemailDropping: boolean;
  voicemailDropped: boolean;
}) {
  const { state, selected, onCall, onHangup, onDropVoicemail, voicemailDropping, voicemailDropped } = props;
  switch (state.kind) {
    case "idle":
      return (
        <Button onClick={() => onCall(selected.contactId)} className="gap-2">
          <Phone className="h-4 w-4" />
          Appeler
        </Button>
      );
    case "starting":
      return (
        <Button disabled className="gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Préparation…
        </Button>
      );
    case "dialing":
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Composing {state.toNumber}…</span>
          <Button variant="outline" onClick={onHangup} className="gap-2">
            <PhoneOff className="h-4 w-4" />
            Annuler
          </Button>
        </div>
      );
    case "ringing": {
      const sec = Math.floor((Date.now() - state.ringingSinceMs) / 1000);
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Sonne depuis {sec}s</span>
          <Button variant="outline" onClick={onHangup} className="gap-2">
            <PhoneOff className="h-4 w-4" />
            Raccrocher
          </Button>
          {sec >= 8 && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onDropVoicemail(state.callId)}
              disabled={voicemailDropping || voicemailDropped}
            >
              <Voicemail className="h-4 w-4" />
              {voicemailDropped ? "Voicemail droppé" : voicemailDropping ? "Drop en cours…" : "Drop voicemail"}
            </Button>
          )}
        </div>
      );
    }
    case "connected": {
      const sec = Math.floor((Date.now() - state.connectedAtMs) / 1000);
      const mm = Math.floor(sec / 60).toString().padStart(2, "0");
      const ss = (sec % 60).toString().padStart(2, "0");
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-red-600 dark:text-red-400">
            {mm}:{ss}
          </span>
          <Button variant="outline" className="gap-2" disabled>
            {state.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {state.muted ? "Unmute" : "Mute"}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => onDropVoicemail(state.callId)}
            disabled={voicemailDropping || voicemailDropped}
          >
            <Voicemail className="h-4 w-4" />
            {voicemailDropped ? "Voicemail droppé" : voicemailDropping ? "Drop…" : "Drop voicemail"}
          </Button>
          <Button onClick={onHangup} className="gap-2 bg-red-600 hover:bg-red-700">
            <PhoneOff className="h-4 w-4" />
            Raccrocher
          </Button>
        </div>
      );
    }
    case "ended":
      return (
        <div className="flex items-center gap-3">
          <Badge>{state.outcome ?? "ended"}</Badge>
          <Button onClick={() => onCall(selected.contactId)} className="gap-2">
            <Phone className="h-4 w-4" />
            Rappeler
          </Button>
        </div>
      );
  }
}

function BriefPreview(props: { selected: QueueItem }) {
  const { selected } = props;
  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <BriefCard
          icon={Sparkles}
          title="Pourquoi maintenant"
          body={
            selected.latestSignal
              ? selected.latestSignal.label
              : "Score d'intent élevé — sans signal récent identifié."
          }
        />
        <BriefCard
          icon={AlertCircle}
          title="Score composite"
          body={`${Math.round(selected.score * 100)}/100 (intent ${Math.round(selected.intentScore * 100)}, accès ${Math.round(selected.accessibilityScore * 100)}, deal ×${selected.dealValueWeight.toFixed(1)})`}
        />
        <BriefCard
          icon={Clock}
          title="Heure locale"
          body={`${selected.localTime} (${selected.localTimezone})`}
        />
        <BriefCard
          icon={Phone}
          title="Numéro"
          body={selected.phone}
        />
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Playbook
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ouverture: <em>« Bonjour {selected.contactName.split(" ")[0]}, Martin de Elevay — j'ai 30 secondes ? »</em>
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Playbook live (objections → réponses) arrive en Phase 3.
        </p>
      </div>
    </div>
  );
}

function BriefCard(props: {
  icon: typeof Phone;
  title: string;
  body: string;
}) {
  const Icon = props.icon;
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
        <Icon className="h-3 w-3" />
        {props.title}
      </div>
      <div className="text-sm text-zinc-900 dark:text-zinc-100 mt-1">
        {props.body}
      </div>
    </div>
  );
}

function LiveTranscript(props: {
  chunks: TranscriptChunk[];
  state: SoftphoneState;
}) {
  const { chunks, state } = props;
  if (chunks.length === 0) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        {state.kind === "ended"
          ? "Aucune transcription captée — l'appel n'a pas connecté ou la fonction streaming n'est pas encore active (Phase 1.5)."
          : "Conversation en cours. La transcription live arrive en Phase 1.5."}
      </div>
    );
  }
  return (
    <div className="p-6 space-y-2">
      {chunks.map((c, i) => (
        <div key={i} className="flex gap-3 text-sm">
          <span
            className={`shrink-0 w-16 text-[11px] uppercase tracking-wide ${
              c.speaker === "agent"
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-500"
            }`}
          >
            {c.speaker === "agent" ? "Vous" : "Prospect"}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">{c.text}</span>
        </div>
      ))}
    </div>
  );
}

function AccountBrainPanel(props: { contactId: string }) {
  // Reuse the existing contact-brain endpoint if it exists; Phase 1
  // simply shows a stub. Phase 2 wires the live brain (last touches,
  // notes, deal stage, MRR) via /api/contacts/[id]/brain.
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500">
          Cette personne
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          Connecter `/api/contacts/{props.contactId}/brain` en Phase 2 pour
          afficher les derniers touches, la position dans le deal, les notes
          existantes.
        </p>
      </div>
      <div>
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500">
          Prochains pas suggérés
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          Après l'appel — apparaîtront : booker meeting, draft follow-up, créer
          tâche de rappel.
        </p>
      </div>
    </div>
  );
}

function CoachingCardsOverlay(props: {
  cards: CoachingCardData[];
  onDismiss: (ts: number) => void;
}) {
  return (
    <div className="absolute right-6 bottom-6 z-30 flex flex-col gap-2 max-w-sm pointer-events-none">
      {props.cards.map((card) => (
        <div
          key={card.ts}
          className="pointer-events-auto rounded-md border bg-white dark:bg-zinc-900 shadow-md p-3 text-[12px]"
          style={{
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
              Objection · {card.label}
            </div>
            <button
              onClick={() => props.onDismiss(card.ts)}
              className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-100"
            >
              ×
            </button>
          </div>
          <div className="mt-1 italic text-zinc-600 dark:text-zinc-400">
            « {card.prospectQuote} »
          </div>
          <ul className="mt-2 space-y-1.5">
            {card.suggestedResponses.map((r, i) => (
              <li
                key={i}
                className="rounded-sm bg-zinc-50 dark:bg-zinc-800/50 px-2 py-1.5 leading-snug"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
