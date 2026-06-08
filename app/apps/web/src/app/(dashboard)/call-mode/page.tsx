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
  Loader2,
  Sparkles,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CompanyLogo } from "@/components/ui/company-logo";
import { useToast } from "@/components/ui/toast";
import {
  PreCallBrief,
  AccountBrainPanel,
  LiveTranscript,
  InCallContext,
  type ContactBrainJSON,
} from "./_panels";
import { CallModeOnboarding } from "./_onboarding";
import { EditCampaignModal } from "./_edit-campaign-modal";
import { CampaignFunnelBar } from "./_funnel-bar";
import { CallScriptPanel } from "./_call-script";

interface QueueItem {
  contactId: string;
  contactName: string;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
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
  const [enriching, setEnriching] = useState(false);
  // When the queue was pushed from an Accounts selection, how many
  // accounts it was scoped to — drives the filter banner.
  const [accountScope, setAccountScope] = useState<number>(0);
  // Goal-driven campaign drives the daily list; first visit (no campaign yet)
  // shows the onboarding.
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [campaign, setCampaign] = useState<{ id: string; name: string; dailyQuota: number; maxAttempts: number; windowDays: number; targetFilter?: unknown } | null>(null);
  // Editing the plan (goal + cadence) after onboarding. planVersion remounts the
  // funnel bar so its stats reload once the plan changes.
  const [editingPlan, setEditingPlan] = useState(false);
  const [planVersion, setPlanVersion] = useState(0);
  // Phase 3 — live coaching cards. Each card auto-dismisses after 12s
  // unless the user manually closes it. Newest on top, max 5 visible.
  const [coachingCards, setCoachingCards] = useState<CoachingCardData[]>([]);
  // Full, non-dismissing history of objections raised — surfaced in the
  // transcript view after the call for review.
  const [coachingHistory, setCoachingHistory] = useState<CoachingCardData[]>([]);

  // SSE subscription handle so we can tear down on unmount / hangup.
  const eventSourceRef = useRef<EventSource | null>(null);
  // Twilio Device handle — typed loosely because the SDK is lazy-loaded.
  const deviceRef = useRef<{ disconnectAll: () => void } | null>(null);

  // Bootstrap: load voice config + queue in parallel.
  useEffect(() => {
    let cancelled = false;
    // Read ?accounts= straight off the URL — keeps this a plain client
    // component without a Suspense boundary around useSearchParams.
    const accountsParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("accounts")
        : null;
    const scopeIds = accountsParam
      ? accountsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setAccountScope(scopeIds.length);
    (async () => {
      try {
        const cfgP = fetch("/api/calls/config");
        if (scopeIds.length > 0) {
          // Manual scoped queue pushed from an Accounts selection — skip the
          // campaign/onboarding and dial exactly those accounts.
          const [cfgRes, qRes] = await Promise.all([
            cfgP,
            fetch(`/api/calls/queue?limit=50&accounts=${encodeURIComponent(scopeIds.join(","))}`),
          ]);
          if (cancelled) return;
          if (cfgRes.ok) setConfig(await cfgRes.json());
          if (qRes.ok) {
            const data = await qRes.json();
            setQueue(data.calls ?? []);
            if ((data.calls ?? []).length > 0) setSelectedId(data.calls[0].contactId);
          }
        } else {
          // Default: the goal-driven campaign drives today's list. No campaign
          // yet -> first-visit onboarding.
          const [cfgRes, campRes] = await Promise.all([cfgP, fetch("/api/calls/campaign")]);
          if (cancelled) return;
          if (cfgRes.ok) setConfig(await cfgRes.json());
          if (campRes.ok) {
            const data = await campRes.json();
            if (data.needsOnboarding) {
              setNeedsOnboarding(true);
            } else {
              setCampaign(data.campaign ?? null);
              setQueue(data.calls ?? []);
              if ((data.calls ?? []).length > 0) setSelectedId(data.calls[0].contactId);
            }
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

  // Per-contact brain cache. Fetched lazily when a contact is selected so
  // the rep sees the full "remise en contexte" before dialling. `null`
  // means fetched-but-empty (no company), distinct from "not yet fetched".
  const [brainByContact, setBrainByContact] = useState<
    Record<string, ContactBrainJSON | null>
  >({});
  const fetchedBrainRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedId) return;
    if (fetchedBrainRef.current.has(selectedId)) return;
    fetchedBrainRef.current.add(selectedId);
    const id = selectedId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/brain/contact/${id}`);
        const data = res.ok ? ((await res.json()) as ContactBrainJSON) : null;
        if (!cancelled) setBrainByContact((p) => ({ ...p, [id]: data }));
      } catch {
        if (!cancelled) setBrainByContact((p) => ({ ...p, [id]: null }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => queue.find((q) => q.contactId === selectedId) ?? null,
    [queue, selectedId],
  );

  const brain = selectedId ? brainByContact[selectedId] : undefined;
  const brainLoading = selectedId != null && !(selectedId in brainByContact);

  // On-demand deep enrichment (Zeliq, async) for the focal contact —
  // surfaced from the brief's "à enrichir" section. The contact updates
  // when Zeliq posts back to its webhook, so we re-fetch the brain after
  // a short delay to pick up freshly resolved email / phone.
  const handleEnrich = useCallback(
    async (contactId: string) => {
      setEnriching(true);
      try {
        const res = await fetch(`/api/contacts/${contactId}/zeliq-enrich`, {
          method: "POST",
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          toast(
            "Enrichment started — Zeliq is completing email and phone in the background.",
            "info",
          );
          // Invalidate the cache so the next selection re-pulls the brain.
          fetchedBrainRef.current.delete(contactId);
        } else {
          toast(
            body?.error ??
              "Enrichment unavailable (ZELIQ_API_KEY not configured?).",
            "error",
          );
        }
      } catch {
        toast("Failed to enrich the contact.", "error");
      } finally {
        setEnriching(false);
      }
    },
    [toast],
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
      setCoachingHistory([]);
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
              ? "Configure Twilio in Settings → Voice before calling."
              : code === "dnc"
                ? "This contact is on the workspace Do Not Call list."
                : code === "quiet_hours"
                  ? `Outside calling hours — timezone ${body.timezone} (${body.localTime}). Try again later.`
                  : code === "usage_cap"
                    ? "Monthly cap reached. See Settings → Voice."
                    : code === "no_pool_number"
                      ? "No outbound number provisioned. Buy one in Settings → Voice."
                      : `Failed to start call (${code}).`,
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
            setCoachingHistory((prev) => [...prev, card]);
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
            "Browser audio unavailable — the call started server-side, hang up if needed.",
            "info",
          );
        }
      } catch (err) {
        console.warn("call-mode: start error", err);
        toast(`Call start error: ${err instanceof Error ? err.message : String(err)}`, "error");
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
              ? "No voicemail template or VOICE_VOICEMAIL_DEFAULT_URL configured."
              : code === "ended"
                ? "The call has already ended."
                : code === "no_sid"
                  ? "The call isn't attached to Twilio yet."
                  : `Failed to drop voicemail (${code}).`,
            "error",
          );
          setVoicemailDropping(false);
          return;
        }
        // SSE will fire voicemail_dropped to confirm; we keep the
        // dropping flag true until then to avoid double-click races.
      } catch (err) {
        toast(
          `Voicemail drop error: ${err instanceof Error ? err.message : String(err)}`,
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

  // One-tap disposition at hang-up: log the outcome (cadence + CRM run server-
  // side), drop the contact from today's list, and auto-advance to the next.
  const handleDisposition = useCallback(
    async (outcome: string) => {
      const callId = "callId" in softphone ? softphone.callId : "";
      let captured: { dealAction?: string | null; tasksCreated?: number } | null = null;
      if (callId) {
        try {
          const res = await fetch(`/api/calls/${callId}/disposition`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ outcome }),
          });
          captured = await res.json().catch(() => null);
        } catch {
          /* non-fatal — the async post-call worker still classifies it */
        }
      }
      // Post-call wrap: one line on what the autopilot just captured in the
      // CRM (deal + tasks), so the rep trusts the logging and moves on — no
      // form, no pause. Auto-advance to the next prospect immediately.
      const OUTCOME_LABEL: Record<string, string> = {
        connected: "Connected",
        meeting_booked: "Meeting booked",
        callback_requested: "Callback requested",
        no_answer: "No answer",
        voicemail_left: "Voicemail",
        not_interested: "Not interested",
      };
      const head = OUTCOME_LABEL[outcome] ?? outcome.replace(/_/g, " ");
      const parts: string[] = [];
      if (captured?.dealAction === "created") parts.push("deal created");
      else if (captured?.dealAction === "updated") parts.push("deal updated");
      else if (captured?.dealAction === "closed_lost") parts.push("deal closed (lost)");
      const tasks = captured?.tasksCreated ?? 0;
      if (tasks > 0) parts.push(`${tasks} task${tasks > 1 ? "s" : ""}`);
      toast(parts.length ? `${head} · captured: ${parts.join(", ")}` : `${head} · cadence updated`, "success");
      const idx = queue.findIndex((q) => q.contactId === selectedId);
      const remaining = queue.filter((q) => q.contactId !== selectedId);
      setQueue(remaining);
      const next = remaining[idx] ?? remaining[idx - 1] ?? remaining[0] ?? null;
      setSelectedId(next ? next.contactId : null);
      setSoftphone({ kind: "idle" });
    },
    [softphone, queue, selectedId, toast],
  );

  // ── Render ────────────────────────────────────────────────────
  // Every state lives inside the same shell as the other tabs: a flush
  // PageHeader bar (height var(--header-height)) above a flex-1 body.
  // Loading / not-configured bodies center their content on both axes so
  // the empty screen reads as deliberate, not top-anchored.

  if (loading) {
    return (
      <CallModeShell>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      </CallModeShell>
    );
  }

  // First visit (no active campaign): set the goal before anything else, even
  // if Twilio isn't configured yet — the plan is saved and dialing activates
  // once a number is connected.
  if (needsOnboarding) {
    return (
      <CallModeShell>
        <div className="relative flex flex-1 min-h-0">
          <CallModeOnboarding
            onCreated={(c, calls) => {
              setCampaign(c);
              setNeedsOnboarding(false);
              setQueue(calls as unknown as QueueItem[]);
              if (calls.length > 0) setSelectedId(calls[0].contactId);
            }}
          />
        </div>
      </CallModeShell>
    );
  }

  if (!config?.configured) {
    return (
      <CallModeShell>
        <div className="flex flex-1 items-center justify-center px-6">
          <EmptyState
            icon={<Phone size={20} />}
            title="Voice isn't configured yet"
            description="To enable Call Mode, configure Twilio in Settings → Voice. You'll need an Account SID, an Auth Token, and at least one provisioned outbound number."
            actionLabel="Go to Settings → Voice"
            onAction={() => {
              window.location.href = "/settings/sending-infrastructure";
            }}
          />
        </div>
      </CallModeShell>
    );
  }

  if (!config.ready) {
    return (
      <CallModeShell>
        <div className="flex flex-1 items-center justify-center px-6">
          <EmptyState
            icon={<Phone size={20} />}
            title="No outbound number provisioned"
            description="Twilio is connected but no number has been purchased yet. Go to Settings → Voice to provision one (one per target country, ideally per US area code if you call the US)."
            actionLabel="Provision a number"
            onAction={() => {
              window.location.href = "/settings/sending-infrastructure";
            }}
          />
        </div>
      </CallModeShell>
    );
  }

  // Live focus mode: from dial to connected the cockpit collapses the queue and
  // turns the right rail into call context, so the transcript takes the stage.
  const inCall = softphone.kind === "dialing" || softphone.kind === "ringing" || softphone.kind === "connected";
  // Who auto-advance lands on after this call — shown in the collapsed strip so
  // the rep always knows the queue is alive without it competing for attention.
  const nextUp = (() => {
    if (!selectedId) return filteredQueue[0] ?? null;
    const i = filteredQueue.findIndex((q) => q.contactId === selectedId);
    return i >= 0 ? filteredQueue[i + 1] ?? null : filteredQueue[0] ?? null;
  })();

  return (
    <CallModeShell
      subtitle={campaign ? `Goal: ${campaign.name} - ${campaign.dailyQuota} calls/day, retry up to ${campaign.maxAttempts}x over ${campaign.windowDays}d` : undefined}
      headerAction={
        campaign && !inCall ? (
          <Button variant="outline" size="sm" onClick={() => setEditingPlan(true)}>
            <SlidersHorizontal size={14} /> Edit plan
          </Button>
        ) : undefined
      }
    >
      {campaign && editingPlan && (
        <EditCampaignModal
          campaign={campaign}
          onClose={() => setEditingPlan(false)}
          onUpdated={({ campaign: updated, calls }) => {
            setCampaign(updated);
            setQueue(calls as unknown as QueueItem[]);
            if (calls.length > 0) setSelectedId(calls[0].contactId);
            setPlanVersion((v) => v + 1);
          }}
        />
      )}
      {campaign && (
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
            inCall ? "max-h-0 opacity-0" : "max-h-48 opacity-100"
          }`}
        >
          <CampaignFunnelBar key={planVersion} />
        </div>
      )}
      <div className="flex flex-1 min-h-0 w-full relative">
      {/* Phase 3 — live coaching overlay. Bottom-right, peripheral. */}
      {coachingCards.length > 0 && (
        <CoachingCardsOverlay
          cards={coachingCards}
          onDismiss={(ts) =>
            setCoachingCards((prev) => prev.filter((c) => c.ts !== ts))
          }
        />
      )}

      {/* ───── LEFT — Queue: full in prep, thin strip when live ───── */}
      <aside
        className={`relative shrink-0 overflow-hidden border-r border-zinc-200 dark:border-zinc-800 transition-[width] duration-300 ease-out ${
          inCall ? "w-16" : "w-80"
        }`}
      >
        {/* Full queue (prep) — fixed 320px so it slides out cleanly under the clip */}
        <div
          className={`absolute inset-y-0 left-0 flex w-80 flex-col transition-opacity duration-200 ${
            inCall ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            To call now
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {filteredQueue.length} contact{filteredQueue.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(
              [
                ["all", "All"],
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
        {accountScope > 0 && (
          <div className="flex items-center justify-between gap-2 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2 text-[12px] dark:border-indigo-900/40 dark:bg-indigo-950/30">
            <span className="text-indigo-700 dark:text-indigo-300">
              Filtered to {accountScope} account{accountScope === 1 ? "" : "s"}
            </span>
            <a
              href="/call-mode"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Show all
            </a>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {filteredQueue.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">
              Queue is empty. Import or enrich contacts to get started.
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
                    <div className="flex min-w-0 items-start gap-2.5">
                      <CompanyLogo
                        domain={item.companyDomain}
                        name={item.companyName ?? item.contactName}
                        size={28}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {item.contactName}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {item.title ?? "—"} · {item.companyName ?? "—"}
                        </div>
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
        </div>
        {/* Thin strip (live) — count + who's next, calm and glanceable */}
        <div
          className={`absolute inset-0 flex flex-col items-center gap-4 px-2 py-4 transition-opacity duration-200 ${
            inCall ? "opacity-100 delay-150" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="text-center">
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {filteredQueue.length}
            </div>
            <div className="text-[9px] font-medium uppercase tracking-wide text-zinc-400">
              en file
            </div>
          </div>
          {nextUp && (
            <div className="flex flex-col items-center gap-1">
              <div className="h-px w-6 bg-zinc-200 dark:bg-zinc-800" />
              <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-zinc-400">
                après
              </span>
              <CompanyLogo
                domain={nextUp.companyDomain}
                name={nextUp.companyName ?? nextUp.contactName}
                size={32}
              />
              <span
                className="w-12 truncate text-center text-[10px] text-zinc-500"
                title={nextUp.contactName}
              >
                {nextUp.contactName.split(" ")[0]}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* ───── CENTER — Brief + softphone (flex-1) ───── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {selected ? (
          <>
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <CompanyLogo
                    domain={selected.companyDomain}
                    name={selected.companyName ?? selected.contactName}
                    size={40}
                  />
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                      {selected.contactName}
                    </h1>
                    <p className="text-sm text-zinc-500 mt-0.5 truncate">
                      {selected.title ?? "—"} · {selected.companyName ?? "—"} ·{" "}
                      {selected.phone}
                    </p>
                  </div>
                </div>
                <SoftphoneControls
                  state={softphone}
                  selected={selected}
                  onCall={handleAppeler}
                  onHangup={handleHangup}
                  onDropVoicemail={handleDropVoicemail}
                  onDisposition={handleDisposition}
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
                    Answering machine detected ({amdDetected}). Drop the voicemail or hang up.
                  </span>
                  {"callId" in softphone && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleDropVoicemail(softphone.callId)}
                      disabled={voicemailDropping}
                    >
                      <Voicemail className="h-3.5 w-3.5" />
                      {voicemailDropping ? "Dropping…" : "Drop voicemail"}
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
                  Voicemail dropped. The line hangs up automatically.
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0">
              {softphone.kind === "connected" || softphone.kind === "ended" ? (
                <LiveTranscript
                  chunks={transcript}
                  ended={softphone.kind === "ended"}
                  connectedAtMs={
                    softphone.kind === "connected" ? softphone.connectedAtMs : null
                  }
                  coaching={coachingHistory}
                />
              ) : (
                <div className="h-full overflow-y-auto">
                  <PreCallBrief
                    selected={selected}
                    brain={brain}
                    brainLoading={brainLoading}
                    onEnrich={() => handleEnrich(selected.contactId)}
                    enriching={enriching}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
            Select a contact from the queue.
          </div>
        )}
      </main>

      {/* ───── RIGHT — Account brain (prep) / call context (live) ───── */}
      <aside className="w-96 shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto">
        {selected ? (
          <>
            <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
              <CallScriptPanel contactName={selected.contactName} />
            </div>
            {inCall ? (
              <InCallContext selected={selected} brain={brain} coaching={coachingHistory} />
            ) : (
              <AccountBrainPanel
                brain={brain}
                brainLoading={brainLoading}
                focalContactId={selected.contactId}
              />
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center p-6 text-sm text-zinc-500">
            Select a contact to see the account.
          </div>
        )}
      </aside>
      </div>
    </CallModeShell>
  );
}

/**
 * Shared page shell — identical structure to every other dashboard tab
 * (flush PageHeader bar above a flex-1 body) so Call Mode lines up with
 * the rest of the app instead of floating its own header inside padding.
 */
function CallModeShell({ children, subtitle, headerAction }: { children: React.ReactNode; subtitle?: string; headerAction?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader
        icon={<Phone size={15} />}
        title="Call Mode"
        subtitle={subtitle ?? "Autonomous cold calling from Elevay"}
      >
        {headerAction}
      </PageHeader>
      {children}
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
  onDisposition: (outcome: string) => void;
  voicemailDropping: boolean;
  voicemailDropped: boolean;
}) {
  const { state, selected, onCall, onHangup, onDropVoicemail, onDisposition, voicemailDropping, voicemailDropped } = props;
  switch (state.kind) {
    case "idle":
      return (
        <Button onClick={() => onCall(selected.contactId)} className="gap-2">
          <Phone className="h-4 w-4" />
          Call
        </Button>
      );
    case "starting":
      return (
        <Button disabled className="gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing…
        </Button>
      );
    case "dialing":
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Dialing {state.toNumber}…</span>
          <Button variant="outline" onClick={onHangup} className="gap-2">
            <PhoneOff className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      );
    case "ringing": {
      const sec = Math.floor((Date.now() - state.ringingSinceMs) / 1000);
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Ringing for {sec}s</span>
          <Button variant="outline" onClick={onHangup} className="gap-2">
            <PhoneOff className="h-4 w-4" />
            Hang up
          </Button>
          {sec >= 8 && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onDropVoicemail(state.callId)}
              disabled={voicemailDropping || voicemailDropped}
            >
              <Voicemail className="h-4 w-4" />
              {voicemailDropped ? "Voicemail dropped" : voicemailDropping ? "Dropping…" : "Drop voicemail"}
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
            {voicemailDropped ? "Voicemail dropped" : voicemailDropping ? "Drop…" : "Drop voicemail"}
          </Button>
          <Button onClick={onHangup} className="gap-2 bg-red-600 hover:bg-red-700">
            <PhoneOff className="h-4 w-4" />
            Hang up
          </Button>
        </div>
      );
    }
    case "ended": {
      const suggested = state.outcome;
      const opts: { key: string; label: string }[] = [
        { key: "connected", label: "Connected" },
        { key: "meeting_booked", label: "Meeting booked" },
        { key: "callback_requested", label: "Callback" },
        { key: "no_answer", label: "No answer" },
        { key: "voicemail_left", label: "Voicemail" },
        { key: "not_interested", label: "Not interested" },
      ];
      return (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-zinc-500">
            How did it go?{suggested ? ` (suggested: ${suggested.replace(/_/g, " ")})` : ""}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {opts.map((o) => (
              <Button
                key={o.key}
                variant={suggested === o.key ? "solid" : "outline"}
                size="sm"
                onClick={() => onDisposition(o.key)}
              >
                {o.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => onCall(selected.contactId)} className="gap-1">
              <Phone className="h-3.5 w-3.5" /> Call again
            </Button>
          </div>
        </div>
      );
    }
  }
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
