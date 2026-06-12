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
  ChevronDown,
  Check,
  Plus,
  ClipboardList,
  MoveHorizontal,
  History,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { CompanyLogo } from "@/components/ui/company-logo";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/role-provider";
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
import { isVoiceableSignal, mergeTechStacks } from "@/lib/call-mode/live-script";
import { speakableGeo } from "@/lib/call-mode/geo";
import { pickReplaceableTools } from "@/lib/tech-detect/replaceable";
import type { ScriptContext } from "@/lib/voice/script-context";
import { CallActions } from "./_call-actions";

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
  lastEnrichedAt?: string | null;
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

interface TranscriptChunk {
  speaker: "agent" | "prospect" | string;
  text: string;
  tsMs?: number;
}

type PoolNumber = VoiceConfig["pool"][number];

const FROM_NUMBER_STORAGE_KEY = "elevay.callmode.fromNumber";
// Rep-adjustable widths (px) for the cockpit columns, persisted so the layout
// sticks across sessions. The centre brief flexes; only the left queue + right
// script/account rails carry an explicit width.
const COCKPIT_W_KEY = "elevay.callmode.colWidths";
const clampPx = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Countries we let a rep buy a local number in straight from Call Mode. Kept to
// the francophone wedge + common targets; Twilio inventory is checked at buy.
const BUY_COUNTRIES: Array<[code: string, label: string]> = [
  ["FR", "France"],
  ["CH", "Switzerland"],
  ["BE", "Belgium"],
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["DE", "Germany"],
];

// Map the E.164 dialing prefix to an ISO country tag for the small label
// beside each number. Mirrors the prefixes the server-side parser knows.
function countryOf(n: PoolNumber): string {
  if (n.countryCode) return n.countryCode;
  const d = n.e164.replace(/[^\d]/g, "");
  if (d.startsWith("1")) return "US";
  if (d.startsWith("33")) return "FR";
  if (d.startsWith("44")) return "GB";
  if (d.startsWith("41")) return "CH";
  if (d.startsWith("32")) return "BE";
  if (d.startsWith("49")) return "DE";
  return "";
}

// Client-side mirror of the server's parseE164 (lib/voice/number-selector)
// — just enough to predict which pool number local-presence would pick, so
// the header always shows the *actual* caller ID even in Automatic mode.
function parseProspect(e164: string): { country: string | null; area: string | null } {
  if (!e164.startsWith("+")) return { country: null, area: null };
  const d = e164.slice(1);
  if (d.startsWith("1") && d.length === 11) return { country: "US", area: d.slice(1, 4) };
  if (d.startsWith("33") && d.length === 11) return { country: "FR", area: d.slice(2, 3) };
  if (d.startsWith("44")) return { country: "GB", area: null };
  if (d.startsWith("32")) return { country: "BE", area: null };
  if (d.startsWith("41")) return { country: "CH", area: null };
  if (d.startsWith("49")) return { country: "DE", area: null };
  return { country: null, area: null };
}

// Predict the local-presence pick for a prospect, mirroring selectFromNumber's
// preference order: exact country+area, then same country, then any number.
function autoPick(pool: PoolNumber[], prospectE164: string | null | undefined): PoolNumber | null {
  if (pool.length === 0) return null;
  if (!prospectE164) return pool[0];
  const { country, area } = parseProspect(prospectE164);
  if (country && area) {
    const exact = pool.find((p) => p.countryCode === country && p.areaCode === area);
    if (exact) return exact;
  }
  if (country) {
    const same = pool.find((p) => p.countryCode === country);
    if (same) return same;
  }
  return pool[0];
}

// Light, country-aware grouping purely for readability — never alters the
// E.164 value we send to the API.
function formatE164(e164: string): string {
  const m = e164.match(/^\+(\d+)$/);
  if (!m) return e164;
  const d = m[1];
  // FR: +33 6 38 34 52 31
  if (d.startsWith("33") && d.length === 11) {
    const r = d.slice(2);
    return `+33 ${r[0]} ${r.slice(1, 3)} ${r.slice(3, 5)} ${r.slice(5, 7)} ${r.slice(7, 9)}`;
  }
  // US/CA: +1 (415) 555-0123
  if (d.startsWith("1") && d.length === 11) {
    const r = d.slice(1);
    return `+1 (${r.slice(0, 3)}) ${r.slice(3, 6)}-${r.slice(6)}`;
  }
  // CH: +41 22 555 55 55
  if (d.startsWith("41") && d.length === 11) {
    const r = d.slice(2);
    return `+41 ${r.slice(0, 2)} ${r.slice(2, 5)} ${r.slice(5, 7)} ${r.slice(7)}`;
  }
  return e164;
}

/**
 * Draggable divider between two cockpit columns. Drag horizontally to resize the
 * adjacent rail; a double-arrow handle appears on hover. Pointer listeners are
 * bound once and read the latest onDelta through a ref.
 *
 * Zero layout width: the visible line IS the adjacent panel's border (border-r
 * on the left rail, border-l on the right rail) — the handle only overlays an
 * invisible grab zone plus a hover highlight on that exact pixel. `side` says
 * which side of the handle the panel border sits on.
 */
function ResizeHandle({ onDelta, side }: { onDelta: (dx: number) => void; side: "left" | "right" }) {
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;
  const startX = useRef<number | null>(null);
  useEffect(() => {
    function move(e: PointerEvent) {
      if (startX.current === null) return;
      const dx = e.clientX - startX.current;
      startX.current = e.clientX;
      onDeltaRef.current(dx);
    }
    function up() {
      if (startX.current === null) return;
      startX.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  return (
    <div
      onPointerDown={(e) => {
        startX.current = e.clientX;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
      }}
      className="group relative z-10 w-0 shrink-0 select-none"
      title="Glisser pour redimensionner"
    >
      <div className="absolute inset-y-0 -left-1 w-2 cursor-col-resize" />
      <div
        className={`pointer-events-none absolute inset-y-0 w-px bg-transparent transition-colors group-hover:bg-indigo-400 ${
          side === "left" ? "-left-px" : "left-0"
        }`}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-7 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-zinc-200 bg-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900">
        <MoveHorizontal size={12} className="text-zinc-400" />
      </div>
    </div>
  );
}

export default function CallModePage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  // Outbound number the rep chose in the header. `null` = automatic
  // local-presence selection (the default). Persisted so a rep who always
  // dials from one number doesn't re-pick every session.
  const [fromNumberOverride, setFromNumberOverride] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(FROM_NUMBER_STORAGE_KEY) || null;
    },
  );
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
  // Rep-adjustable column widths — drag the dividers between the queue, the
  // brief and the script rail. The centre flexes; these two carry the width.
  const [colW, setColW] = useState<{ left: number; right: number }>(() => {
    if (typeof window === "undefined") return { left: 224, right: 480 };
    try {
      const s = JSON.parse(window.localStorage.getItem(COCKPIT_W_KEY) || "null");
      if (s && typeof s.left === "number" && typeof s.right === "number") {
        return { left: clampPx(s.left, 180, 420), right: clampPx(s.right, 300, 680) };
      }
    } catch { /* ignore malformed */ }
    return { left: 224, right: 480 };
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(COCKPIT_W_KEY, JSON.stringify(colW));
  }, [colW]);
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
  // In-call coaching is intentionally NOT surfaced during a call — the call
  // stays a human exchange (no live nudging). The review happens AFTER the
  // call via the post-call debrief in the ended view.

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

  // Persist the rep's number choice and self-heal a stale one: if the
  // saved number is no longer in the active pool (released in Settings),
  // fall back to automatic selection rather than 409 on the next dial.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (fromNumberOverride === null) {
      window.localStorage.removeItem(FROM_NUMBER_STORAGE_KEY);
      return;
    }
    if (config && !config.pool.some((p) => p.e164 === fromNumberOverride)) {
      setFromNumberOverride(null);
      return;
    }
    window.localStorage.setItem(FROM_NUMBER_STORAGE_KEY, fromNumberOverride);
  }, [fromNumberOverride, config]);

  const selected = useMemo(
    () => queue.find((q) => q.contactId === selectedId) ?? null,
    [queue, selectedId],
  );

  const brain = selectedId ? brainByContact[selectedId] : undefined;
  const brainLoading = selectedId != null && !(selectedId in brainByContact);
  // Merged stack (dossier ∪ enriched) + the first catalog-replaceable tool —
  // feeds the script's trigger matching and its {tool} enjeu interpolation.
  const mergedStack = useMemo(
    () => mergeTechStacks(brain?.cachedDossier?.techStack, brain?.enrichedTechnologies),
    [brain],
  );
  const replaceableTool = useMemo(() => pickReplaceableTools(mergedStack)[0] ?? null, [mergedStack]);

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
    if (filter === "high_intent") {
      return queue.filter((q) => q.intentScore >= 0.7);
    }
    return queue;
  }, [queue, filter]);

  // Last script context the panel reported — stamped on the call at dial time
  // so outcomes can be segmented by script variant (ref: no re-renders).
  const scriptCtxRef = useRef<ScriptContext | null>(null);

  const handleAppeler = useCallback(
    async (contactId: string) => {
      setSoftphone({ kind: "starting", contactId });
      setTranscript([]);
      setAmdDetected(null);
      setVoicemailDropping(false);
      setVoicemailDropped(false);
      try {
        const res = await fetch("/api/calls/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId,
            fromNumber: fromNumberOverride ?? undefined,
            scriptContext: scriptCtxRef.current ?? undefined,
          }),
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
                      : code === "invalid_from_number"
                        ? "That outbound number is no longer active. Pick another in the header."
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
        // NOTE: the server may still emit "coaching_card" events, but we
        // deliberately do not listen for them — no AI interaction during the
        // call. The post-call debrief covers the review afterwards.
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
          // The browser leg IS the agent: these params reach the App-SID
          // voiceUrl (/api/calls/agent-twiml), which dials the prospect with
          // our caller-id and bridges the two — the rep's mic ↔ the prospect.
          await device.connect?.({
            params: {
              callId: data.callId,
              To: data.toNumber,
              From: data.fromNumber,
            },
          });
        } catch (err) {
          console.warn(
            "call-mode: @twilio/voice-sdk load/connect failed (browser mic/RTC unavailable).",
            err,
          );
          // The browser leg IS the call now — if it can't attach (no mic /
          // permission denied), there is no call. Surface it and reset.
          toast(
            "Microphone unavailable — allow mic access to place the call.",
            "error",
          );
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          setSoftphone({ kind: "idle" });
        }
      } catch (err) {
        console.warn("call-mode: start error", err);
        toast(`Call start error: ${err instanceof Error ? err.message : String(err)}`, "error");
        setSoftphone({ kind: "idle" });
      }
    },
    [toast, fromNumberOverride],
  );

  // Provision a new outbound number straight from the header picker: buy it
  // via Twilio (POST /api/calls/numbers searches inventory + purchases), then
  // append it to the live pool and pin it as the active caller ID — no detour
  // through Settings or the Twilio Console. Returns ok so the picker can close.
  const handleBuyNumber = useCallback(
    async (countryCode: string, areaCode?: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/calls/numbers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countryCode, areaCode: areaCode || undefined }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = body?.code ?? "unknown";
          toast(
            code === "no_inventory"
              ? `No Twilio number available for ${countryCode}${areaCode ? ` area ${areaCode}` : ""}. Try another area code.`
              : code === "voice_not_configured"
                ? "Configure Twilio in Settings → Voice first."
                : `Couldn't buy a number (${code}).`,
            "error",
          );
          return false;
        }
        const num = body.number as {
          e164: string;
          countryCode: string;
          areaCode: string | null;
        };
        // Splice into the live config pool so the picker updates instantly,
        // and flip `ready` true in case this was the first number.
        setConfig((c) =>
          c
            ? {
                ...c,
                ready: true,
                pool: [
                  ...c.pool,
                  { e164: num.e164, countryCode: num.countryCode, areaCode: num.areaCode },
                ],
              }
            : c,
        );
        setFromNumberOverride(num.e164);
        toast(`Number ${formatE164(num.e164)} added and selected.`, "success");
        return true;
      } catch {
        toast("Failed to buy a number.", "error");
        return false;
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
        !inCall ? (
          <div className="flex items-center gap-2">
            {config && config.pool.length > 0 && (
              <FromNumberPicker
                pool={config.pool}
                value={fromNumberOverride}
                onChange={setFromNumberOverride}
                prospectE164={selected?.phone}
                onBuyNumber={handleBuyNumber}
              />
            )}
            {campaign && (
              <Button variant="outline" size="sm" onClick={() => setEditingPlan(true)}>
                <SlidersHorizontal size={14} /> Edit plan
              </Button>
            )}
          </div>
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
      <DispositionModal
        open={softphone.kind === "ended"}
        suggested={softphone.kind === "ended" ? softphone.outcome : null}
        contactName={selected?.contactName ?? null}
        onDispose={handleDisposition}
        onCallAgain={() => {
          if (selected) handleAppeler(selected.contactId);
        }}
        onClose={() => setSoftphone({ kind: "idle" })}
      />
      {campaign && (
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
            inCall ? "max-h-0 opacity-0" : "max-h-20 opacity-100"
          }`}
        >
          <CampaignFunnelBar key={planVersion} />
        </div>
      )}
      <div className="flex flex-1 min-h-0 w-full relative">
      {/* No in-call coaching overlay — the call stays a human exchange. */}

      {/* ───── LEFT — Queue: full in prep, thin strip when live ───── */}
      <aside
        className={`relative shrink-0 overflow-hidden border-r border-zinc-200 dark:border-zinc-800 ${inCall ? "transition-[width] duration-300 ease-out" : ""}`}
        style={{ width: inCall ? 64 : colW.left }}
      >
        {/* Full queue (prep) — fixed 320px so it slides out cleanly under the clip */}
        <div
          className={`absolute inset-y-0 left-0 flex flex-col transition-opacity duration-200 ${
            inCall ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          style={{ width: colW.left }}
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
              // Only the fields we actually hold are worth a line — an empty
              // local time or an uncomputed (0) score render as noise that make
              // the row look broken, so each is gated on real data.
              const scorePct = Math.round(item.score * 100);
              const hasMeta = Boolean(item.localTime) || Boolean(item.latestSignal);
              return (
                <button
                  key={item.contactId}
                  onClick={() => setSelectedId(item.contactId)}
                  className={`relative w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 transition ${
                    active
                      ? "bg-[var(--color-bg-selected)]"
                      : "hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute inset-y-0 left-0 w-[2px] rounded-r"
                      style={{ background: "var(--color-accent)" }}
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <CompanyLogo
                        domain={item.companyDomain}
                        name={item.companyName ?? item.contactName}
                        size={28}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {item.contactName}
                        </div>
                        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {item.title ?? "—"} · {item.companyName ?? "—"}
                        </div>
                      </div>
                    </div>
                    {scorePct > 0 && <Badge className="shrink-0">{scorePct}</Badge>}
                  </div>
                  {hasMeta && (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {item.localTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {item.localTime} {item.localTimezone.split("/")[1] ?? ""}
                        </span>
                      )}
                      {item.localTime && item.latestSignal && <span>·</span>}
                      {item.latestSignal && (
                        <span className="flex min-w-0 items-center gap-1">
                          {/* Sparkles ONLY for a real, voiceable buying signal —
                              the campaign queue also carries a cadence breadcrumb
                              ({type:"call"}, "Attempt N · outcome") which renders
                              as neutral history, never dressed up as a signal. */}
                          {isVoiceableSignal(item.latestSignal.type) ? (
                            <Sparkles className="h-3 w-3 shrink-0" />
                          ) : (
                            <History className="h-3 w-3 shrink-0" />
                          )}
                          <span className="truncate">{item.latestSignal.label}</span>
                        </span>
                      )}
                    </div>
                  )}
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

      {!inCall && (
        <ResizeHandle side="left" onDelta={(dx) => setColW((w) => ({ ...w, left: clampPx(w.left + dx, 180, 420) }))} />
      )}

      {/* ───── CENTER — Brief + softphone (flex-1) ───── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {selected ? (
          <>
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-2.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo
                    domain={selected.companyDomain}
                    name={selected.companyName ?? selected.contactName}
                    size={36}
                  />
                  <div className="min-w-0">
                    <h1 className="truncate text-[17px] font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
                      {selected.contactName}
                    </h1>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12.5px] text-zinc-500 dark:text-zinc-400">
                      <span className="truncate">
                        {selected.title ?? "—"}
                        {selected.companyName ? ` · ${selected.companyName}` : ""}
                      </span>
                      {selected.phone && (
                        <span className="flex shrink-0 items-center gap-1 font-medium text-zinc-600 dark:text-zinc-300">
                          <Phone className="h-3 w-3 text-zinc-400" />
                          <span className="tabular-nums tracking-tight">{selected.phone}</span>
                        </span>
                      )}
                    </div>
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
                <div className="flex h-full flex-col">
                  <div className="min-h-0 flex-1">
                    <LiveTranscript
                      chunks={transcript}
                      ended={softphone.kind === "ended"}
                      connectedAtMs={
                        softphone.kind === "connected" ? softphone.connectedAtMs : null
                      }
                      coaching={[]}
                    />
                  </div>
                  {/* After the call: the debrief (what worked / to improve),
                      then write the follow-up + book the meeting the prospect
                      just agreed to, without leaving the cockpit. */}
                  {softphone.kind === "ended" && (
                    <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800">
                      <CallDebrief callId={softphone.callId} />
                      <CallActions
                        contactId={selected.contactId}
                        contactName={selected.contactName}
                        email={brain?.focalContact?.email ?? null}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full overflow-y-auto">
                  <PreCallBrief
                    selected={selected}
                    brain={brain}
                    brainLoading={brainLoading}
                    onEnrich={() => handleEnrich(selected.contactId)}
                    enriching={enriching}
                    onRoleObsolete={(contactId) => {
                      const remaining = queue.filter((q) => q.contactId !== contactId);
                      setQueue(remaining);
                      if (selectedId === contactId) {
                        setSelectedId(remaining[0]?.contactId ?? null);
                      }
                      toast("Contact retiré de la liste : poste signalé obsolète.", "success");
                    }}
                  />
                  {/* Act on the prospect without leaving the cockpit: AI email + book the meeting. */}
                  <CallActions
                    contactId={selected.contactId}
                    contactName={selected.contactName}
                    email={brain?.focalContact?.email ?? null}
                  />
                  {/* Company + buying committee live WITH the prospect (linked),
                      not under the independent script panel on the right. */}
                  <div className="border-t border-zinc-200 dark:border-zinc-800">
                    <AccountBrainPanel
                      brain={brain}
                      brainLoading={brainLoading}
                      focalContactId={selected.contactId}
                    />
                  </div>
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

      {!inCall && (
        <ResizeHandle side="right" onDelta={(dx) => setColW((w) => ({ ...w, right: clampPx(w.right - dx, 300, 680) }))} />
      )}

      {/* ───── RIGHT — Account brain (prep) / call context (live) ───── */}
      <aside
        className="shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto"
        style={{ width: colW.right }}
      >
        {selected ? (
          <>
            <div className="p-3">
              <CallScriptPanel
                contactName={selected.contactName}
                contactId={selected.contactId}
                defaultSector={brain?.companyBrain?.company?.industry}
                defaultGeo={speakableGeo(brain?.companyBrain?.company?.location, selected.localTimezone)}
                reasonInput={{
                  signal: selected.latestSignal,
                  hiringRole: brain?.cachedDossier?.hiringSignals?.[0]?.role,
                  fundingLastRound: brain?.cachedDossier?.funding?.lastRound,
                  fundingDate: brain?.cachedDossier?.funding?.date,
                }}
                triggerText={[
                  ...mergedStack,
                  selected.latestSignal && isVoiceableSignal(selected.latestSignal.type)
                    ? selected.latestSignal.label
                    : null,
                ].filter(Boolean).join(" ")}
                replaceableTool={replaceableTool}
                onContext={(c) => { scriptCtxRef.current = c; }}
              />
            </div>
            {inCall && (
              <InCallContext selected={selected} brain={brain} coaching={[]} />
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
      // The disposition picker now lives in a focused modal (DispositionModal,
      // rendered by the page) so the options don't sprawl across the wide
      // header. Here we just show a calm "ended" marker.
      return (
        <span className="flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
          <PhoneOff className="h-4 w-4" />
          Call ended
        </span>
      );
    }
  }
}

const DISPOSITION_OPTIONS: { key: string; label: string }[] = [
  { key: "connected", label: "Connected" },
  { key: "meeting_booked", label: "Meeting booked" },
  { key: "callback_requested", label: "Callback" },
  { key: "no_answer", label: "No answer" },
  { key: "voicemail_left", label: "Voicemail" },
  { key: "not_interested", label: "Not interested" },
];

/**
 * Post-call disposition — a focused modal instead of a row of buttons sprawled
 * across the header. One tap logs the outcome (cadence + CRM run server-side),
 * advances to the next prospect, and closes. The suggested outcome (from the
 * provider's call result) is pre-highlighted.
 */
function DispositionModal(props: {
  open: boolean;
  suggested: string | null;
  contactName: string | null;
  onDispose: (outcome: string) => void;
  onCallAgain: () => void;
  onClose: () => void;
}) {
  const { open, suggested, contactName, onDispose, onCallAgain, onClose } = props;
  return (
    <Modal open={open} onClose={onClose} title="How did it go?" size="sm">
      <div className="flex flex-col gap-3">
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          {contactName ? `Call with ${contactName} ended.` : "Call ended."} Log the
          outcome — the cadence and CRM update on their own.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DISPOSITION_OPTIONS.map((o) => {
            const isSuggested = suggested === o.key;
            return (
              <Button
                key={o.key}
                variant={isSuggested ? "solid" : "outline"}
                onClick={() => onDispose(o.key)}
                className="justify-center"
              >
                {o.label}
                {isSuggested && (
                  <span className="ml-1 text-[10px] uppercase tracking-wide opacity-80">
                    suggested
                  </span>
                )}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border-default)" }}>
          <Button variant="ghost" size="sm" onClick={onCallAgain} className="gap-1.5">
            <Phone className="h-3.5 w-3.5" /> Call again
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Skip
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Header control to choose the outbound caller ID. `null` means automatic
 * local-presence selection (the server matches the prospect's country / area
 * code); any other value pins every dial to that specific pool number.
 *
 * Self-contained dropdown — click-outside + Escape to dismiss, a check on the
 * active row — styled with the app's CSS variables so it reads as part of the
 * header, not a bolt-on.
 */
function FromNumberPicker(props: {
  pool: PoolNumber[];
  value: string | null;
  onChange: (value: string | null) => void;
  prospectE164?: string | null;
  onBuyNumber: (countryCode: string, areaCode?: string) => Promise<boolean>;
}) {
  const { pool, value, onChange, prospectE164, onBuyNumber } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Inline "buy a number" mini-form, revealed under the list.
  const [adding, setAdding] = useState(false);
  const [buyCountry, setBuyCountry] = useState<string>(
    () => parseProspect(prospectE164 ?? "").country ?? "FR",
  );
  const [buyArea, setBuyArea] = useState("");
  const [buying, setBuying] = useState(false);
  // Buying a Twilio number is a money action — admin-only (billing:manage).
  // Non-admins still pick from the existing pool; they just can't add one.
  const canBuy = useCan("billing:manage");

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = value ? pool.find((p) => p.e164 === value) ?? null : null;
  // The number actually dialed-from: the pinned choice, or the local-presence
  // pick for this prospect. Always a real number so the caller ID is visible.
  const effective = active ?? autoPick(pool, prospectE164);
  const isAuto = value === null;

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  // Collapse the buy form whenever the menu closes so it reopens clean.
  useEffect(() => {
    if (!open) {
      setAdding(false);
      setBuyArea("");
    }
  }, [open]);

  async function submitBuy() {
    if (buying) return;
    setBuying(true);
    const ok = await onBuyNumber(buyCountry, buyArea.trim() || undefined);
    setBuying(false);
    if (ok) setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Choose the number you call from"
        className="flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors"
        style={{
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-secondary)",
          background: "var(--color-bg-card)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-bg-card)"; }}
      >
        <span className="text-[11px] font-normal" style={{ color: "var(--color-text-tertiary)" }}>
          From
        </span>
        <Phone size={13} style={{ color: "var(--color-text-tertiary)" }} />
        <span className="tabular-nums tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          {effective ? formatE164(effective.e164) : "No number"}
        </span>
        <span
          className="rounded-sm px-1 text-[10px] font-semibold"
          style={{ background: "var(--color-bg-muted)", color: "var(--color-text-tertiary)" }}
        >
          {isAuto ? "AUTO" : effective ? countryOf(effective) : ""}
        </span>
        <ChevronDown size={13} style={{ color: "var(--color-text-tertiary)" }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[240px] rounded-lg py-1"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          <FromNumberRow
            checked={value === null}
            primary="Automatic"
            secondary={
              effective && isAuto
                ? `Local presence — ${formatE164(effective.e164)} for this prospect`
                : "Local presence — match the prospect"
            }
            onClick={() => pick(null)}
          />
          <div className="my-1" style={{ borderTop: "1px solid var(--color-border-default)" }} />
          {pool.map((p) => (
            <FromNumberRow
              key={p.e164}
              checked={value === p.e164}
              primary={formatE164(p.e164)}
              secondary={[countryOf(p), p.areaCode ? `area ${p.areaCode}` : null]
                .filter(Boolean)
                .join(" · ")}
              tabular
              onClick={() => pick(p.e164)}
            />
          ))}

          {canBuy && (<>
          <div className="my-1" style={{ borderTop: "1px solid var(--color-border-default)" }} />
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Plus size={14} style={{ color: "var(--color-text-tertiary)" }} />
              Add a number…
            </button>
          ) : (
            <div className="px-3 py-2">
              <div className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                Buy a new outbound number
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <select
                  value={buyCountry}
                  onChange={(e) => setBuyCountry(e.target.value)}
                  disabled={buying}
                  className="h-7 rounded-md border bg-transparent px-1.5 text-[12px]"
                  style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
                >
                  {BUY_COUNTRIES.map(([code, label]) => (
                    <option key={code} value={code}>{code} · {label}</option>
                  ))}
                </select>
                <input
                  value={buyArea}
                  onChange={(e) => setBuyArea(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Area (opt.)"
                  inputMode="numeric"
                  disabled={buying}
                  className="h-7 w-[5.5rem] rounded-md border bg-transparent px-2 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-primary)" }}
                />
              </div>
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={buying}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void submitBuy()} disabled={buying} className="gap-1.5">
                  {buying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                  {buying ? "Buying…" : "Buy"}
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug" style={{ color: "var(--color-text-tertiary)" }}>
                Buys a real Twilio number and adds it here automatically.
              </p>
            </div>
          )}
          </>)}
        </div>
      )}
    </div>
  );
}

function FromNumberRow(props: {
  checked: boolean;
  primary: string;
  secondary: string;
  tabular?: boolean;
  onClick: () => void;
}) {
  const { checked, primary, secondary, tabular, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Check
        size={14}
        className={checked ? "opacity-100" : "opacity-0"}
        style={{ color: "var(--color-accent)" }}
      />
      <span className="min-w-0">
        <span
          className={`block text-[13px] leading-tight ${tabular ? "tabular-nums tracking-tight" : ""}`}
          style={{ color: "var(--color-text-primary)" }}
        >
          {primary}
        </span>
        {secondary && (
          <span className="block text-[11px] leading-tight" style={{ color: "var(--color-text-tertiary)" }}>
            {secondary}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Post-call debrief — the "ce qui a marché / à améliorer" review, shown only
 * AFTER the call (never during it). The notes are produced asynchronously by
 * the call post-processor, so we poll /api/calls/[id] until they land.
 */
function CallDebrief({ callId }: { callId: string | null }) {
  const [debrief, setDebrief] = useState<{ wentWell: string[]; toImprove: string[] } | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    if (!callId) {
      setPhase("none");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/calls/${callId}`);
        if (res.ok && !cancelled) {
          const d = (await res.json()) as {
            processingState?: string;
            debrief?: { wentWell?: string[]; toImprove?: string[] } | null;
          };
          const db = d.debrief;
          const count = (db?.wentWell?.length ?? 0) + (db?.toImprove?.length ?? 0);
          if (count > 0) {
            setDebrief({ wentWell: db?.wentWell ?? [], toImprove: db?.toImprove ?? [] });
            setPhase("ready");
            return;
          }
          // Processed but nothing to debrief (voicemail / no-answer) → hide.
          if (d.processingState === "done") {
            setPhase("none");
            return;
          }
        }
      } catch {
        /* transient — keep polling */
      }
      if (!cancelled && tries++ < 20) {
        timer = setTimeout(poll, 3000);
      } else if (!cancelled) {
        setPhase("none");
      }
    };
    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [callId]);

  if (phase === "none") return null;

  return (
    <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-1.5 mb-2">
        <ClipboardList size={13} className="text-zinc-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Débrief de l&apos;appel
        </span>
      </div>
      {phase === "loading" ? (
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <Loader2 size={12} className="animate-spin" />
          Analyse de l&apos;appel en cours…
        </div>
      ) : debrief ? (
        <div className="space-y-2.5">
          {debrief.wentWell.length > 0 && (
            <div>
              <p className="text-[11px] font-medium mb-1 text-emerald-600 dark:text-emerald-400">Ce qui a marché</p>
              <ul className="space-y-1">
                {debrief.wentWell.map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {debrief.toImprove.length > 0 && (
            <div>
              <p className="text-[11px] font-medium mb-1 text-amber-600 dark:text-amber-400">À améliorer</p>
              <ul className="space-y-1">
                {debrief.toImprove.map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

