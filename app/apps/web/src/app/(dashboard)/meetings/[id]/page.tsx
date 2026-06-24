"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { formatSecondsAsTimestamp } from "@/lib/coaching/citation-parser";
import { TranscriptChunks } from "@/components/coaching/transcript-chunks";
import { TranscriptVideoPlayer } from "@/components/coaching/transcript-video-player";
import {
  ArrowLeft, Calendar, Clock, MapPin, Users, ExternalLink,
  FileText, Upload, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, Send, Plus, Loader2, MessageSquare,
  Edit2, Check, X, Trash2, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveExtraction } from "@/components/live-extraction";
import { MeddpiccScorecard, AccountCallIntel, ContactCallProfile } from "@/components/call-intel";
import { MeetingRecorder } from "./_meeting-recorder";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/locale";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/**
 * CLE-14 — the meeting IDs we INTENTIONALLY do NOT register. The in-browser
 * recorder (mic getUserMedia + MediaRecorder) and the transcript upload (a
 * native file-picker dialog) are HUMAN-BOUND: the agent cannot grant mic
 * permission, capture audio, or pick a file off the user's disk (README §2 —
 * "l'agent prépare et navigue, l'humain exécute"). The agent operates on a
 * meeting that ALREADY has a transcript; producing the transcript is the
 * human's job. A boundary test asserts the registered id set is disjoint from
 * this — registering any of these would be a breach.
 */
// MEETINGS_EXCLUDED_IDS moved to ./_excluded-ids (a Next page.tsx may only export
// the default component + route config).

/** E-9 helper — does the meeting's CRM bag carry a PENDING intel proposal for
 *  this entity type? The post-call pipeline writes pending facts to a `pending*`
 *  key (call-intel.tsx). Read-only; the /api/call-intel/review endpoint is
 *  idempotent, so this is a best-effort guard, not a hard gate. */
function hasPendingIntel(
  crm: MeetingData["crm"] | undefined,
  entityType: "deal" | "company" | "contact",
): boolean {
  const props =
    entityType === "deal" ? crm?.deal?.properties
    : entityType === "company" ? crm?.company?.properties
    : crm?.contact?.properties;
  if (!props) return false;
  const key =
    entityType === "deal" ? "pendingMeddic"
    : entityType === "company" ? "pendingCallIntel"
    : "pendingCallProfile";
  const pending = (props as Record<string, unknown>)[key];
  return pending != null && typeof pending === "object";
}

interface MeetingNotes {
  summary: string;
  keyPoints: string[];
  actionItems: Array<{ owner: string; task: string; deadline: string | null }>;
  decisions: string[];
  participants: Array<{ name: string; role: string | null }>;
  buyingSignals: {
    budget: string | null;
    timeline: string | null;
    currentStack: string[];
    painPoints: string[];
    objections: string[];
    nextSteps: string[];
    competitors: string[];
    teamSize: string | null;
  };
  sentiment: "positive" | "neutral" | "negative";
}

interface MeetingData {
  meeting: {
    id: string;
    title: string;
    date: string;
    endTime: string;
    attendees: Array<{ email: string; displayName?: string; contactId?: string }>;
    location: string | null;
    meetingLink: string | null;
    calendarSource: string;
    /** P0-4 follow-up — surfaced from activity.metadata so the
     *  TranscriptVideoPlayer can render the recording inline. */
    recordingUrl?: string | null;
    recordingStatus?: string | null;
  };
  hasTranscript: boolean;
  transcriptSource: string | null;
  notes: MeetingNotes | null;
  followUpDraft: { subject: string; body: string } | null;
  followUpSentAt: string | null;
  tasks: Array<{ id: string; title: string; status: string }>;
  matchedContacts: Array<{ name: string; contactId: string | null }>;
  crm?: {
    deal: { id: string; properties: Record<string, unknown> } | null;
    company: { id: string; properties: Record<string, unknown> } | null;
    contact: { id: string; properties: Record<string, unknown> } | null;
  };
  coaching?: {
    score: number | null;
    category: string;
    summary: string;
    detail: string;
    suggestion: string | null;
    createdAt: string;
  } | null;
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const colors = {
    positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    neutral: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    negative: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[sentiment as keyof typeof colors] || colors.neutral}`}>
      {sentiment}
    </span>
  );
}

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          <Icon className="h-4 w-4 text-gray-500" />
          {title}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function BuyingSignalCard({ label, value }: { label: string; value: string | string[] | null }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-sm text-gray-900 dark:text-gray-100">
        {Array.isArray(value) ? value.join(", ") : value}
      </div>
    </div>
  );
}

/**
 * Post-meeting coaching debrief — surfaces the `coachingInsights` row that
 * scoreInteraction wrote for this meeting (orphaned until now). Read-only:
 * how the rep ran the meeting, distinct from the prospect-side CRM intel above.
 */
function CoachingSection({ coaching }: { coaching: NonNullable<MeetingData["coaching"]> }) {
  const pct = typeof coaching.score === "number" ? Math.round(coaching.score * 100) : null;
  const tone =
    pct == null
      ? "var(--color-text-tertiary)"
      : pct >= 75
        ? "var(--color-success)"
        : pct >= 50
          ? "var(--color-warning)"
          : "var(--color-error)";
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
          Coaching debrief
        </h3>
        {pct != null && (
          <span
            className="ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ background: "var(--color-bg-page)", color: tone, border: `1px solid ${tone}` }}
          >
            {pct}/100
          </span>
        )}
      </div>
      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{coaching.summary}</p>
      {coaching.detail && (
        <div className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {coaching.detail}
        </div>
      )}
      {coaching.suggestion && (
        <div className="mt-3 rounded-md p-2.5" style={{ background: "var(--color-accent-soft, rgba(37,99,235,0.08))", border: "1px solid var(--color-border-default)" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Suggested next move</p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{coaching.suggestion}</p>
        </div>
      )}
    </div>
  );
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useT();
  const meetingId = params.id as string;

  // MONACO-PARITY-05: when a coaching citation chip links here, it
  // appends `?t=<seconds>`. Until we ship a recording player, we
  // surface a banner showing the deep-link target so the founder sees
  // the round-trip works and can later jump to the transcript section
  // (or the player, once it lands).
  const seekSecondsRaw = searchParams?.get("t");
  const seekSeconds = seekSecondsRaw && /^\d+$/.test(seekSecondsRaw)
    ? Math.min(86400, Math.max(0, parseInt(seekSecondsRaw, 10)))
    : null;

  const [data, setData] = useState<MeetingData | null>(null);
  // CLE-14: live ref so the registered page-actions' run()s read the current
  // meeting without re-registering on every data change.
  const dataRef = useRef<MeetingData | null>(null);
  dataRef.current = data;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingPostCall, setProcessingPostCall] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [meetingPrep, setMeetingPrep] = useState<string | null>(null);
  const [generatingPrep, setGeneratingPrep] = useState(false);

  // M1 — inline edit state for summary + key points.
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [editingKeyPoints, setEditingKeyPoints] = useState(false);
  const [keyPointsDraft, setKeyPointsDraft] = useState<string[]>([]);
  const [savingKeyPoints, setSavingKeyPoints] = useState(false);
  // M1 — decisions inline edit, same list-of-strings shape as keyPoints.
  const [editingDecisions, setEditingDecisions] = useState(false);
  const [decisionsDraft, setDecisionsDraft] = useState<string[]>([]);
  const [savingDecisions, setSavingDecisions] = useState(false);

  // M1 — follow-up draft edit state.
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);

  // M2 — send follow-up.
  const [sendingFollowUp, setSendingFollowUp] = useState(false);

  // Share the summary to Slack (reuses the workspace Slack webhook).
  const [sharingSlack, setSharingSlack] = useState(false);

  const fetchMeeting = useCallback(async () => {
    try {
      setLoadError(false);
      const res = await fetch(`/api/meetings/${meetingId}/notes`);
      if (res.ok) setData(await res.json());
      // A 5xx / non-404 response is a real error (show a retry); only a 404 is a
      // genuine "not found". Previously both rendered "Meeting not found".
      else if (res.status !== 404) setLoadError(true);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, [meetingId]);

  useEffect(() => { fetchMeeting(); }, [fetchMeeting]);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("meetingId", meetingId);
      formData.append("overwrite", "true");

      const res = await fetch("/api/meetings/upload-transcript", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        await fetchMeeting();
        // Auto-trigger post-call
        await triggerPostCall();
      }
    } catch { /* silent */ }
    setUploading(false);
  };

  const handlePasteSubmit = async () => {
    if (pasteText.trim().length < 50) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("text", pasteText);
      formData.append("meetingId", meetingId);
      formData.append("overwrite", "true");

      const res = await fetch("/api/meetings/upload-transcript", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setPasteText("");
        await fetchMeeting();
        await triggerPostCall();
      }
    } catch { /* silent */ }
    setUploading(false);
  };

  // CLE-14: returns a result so the meetings.postCallConfirm action can read it;
  // the existing buttons call it via onClick and ignore the return.
  const triggerPostCall = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setProcessingPostCall(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/post-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchMeeting();
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { ok: false, error: (errBody as { error?: string }).error || "Post-call failed." };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error." };
    } finally {
      setProcessingPostCall(false);
    }
  }, [meetingId, fetchMeeting]);

  // CLE-14: the SINGLE PATCH /api/meetings/:id/notes copy. Every save handler
  // (summary / key points / decisions / follow-up draft) and the
  // meetings.editNotesSection action build their `partial` and call this — so
  // the button path and the agent path issue one identical request.
  //  - a `structuredNotes` partial (summary/keyPoints/decisions) merges onto the
  //    live notes (legacy behavior).
  //  - a `followUpEmailDraft` partial is sent as its own top-level key.
  const patchNotes = useCallback(
    async (
      partial: Partial<MeetingNotes> | { followUpEmailDraft: { subject: string; body: string } },
    ): Promise<{ ok: boolean; error?: string }> => {
      let body: Record<string, unknown>;
      if ("followUpEmailDraft" in partial) {
        body = { followUpEmailDraft: partial.followUpEmailDraft };
      } else {
        const base = dataRef.current?.notes;
        if (!base) return { ok: false, error: "No notes to edit on this meeting yet." };
        body = { structuredNotes: { ...base, ...partial } };
      }
      const res = await fetch(`/api/meetings/${meetingId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const error = (errBody as { error?: string }).error || "Failed to save notes.";
        toast(error, "error");
        return { ok: false, error };
      }
      return { ok: true };
    },
    [meetingId, toast],
  );

  async function saveSummary() {
    if (!data?.notes) return;
    const trimmed = summaryDraft.trim();
    if (trimmed === data.notes.summary) {
      setEditingSummary(false);
      return;
    }
    setSavingSummary(true);
    const { ok } = await patchNotes({ summary: trimmed });
    setSavingSummary(false);
    if (ok) {
      toast("Summary updated.", "success");
      setEditingSummary(false);
      await fetchMeeting();
    }
  }

  async function saveKeyPoints() {
    if (!data?.notes) return;
    const cleaned = keyPointsDraft.map((p) => p.trim()).filter(Boolean);
    if (JSON.stringify(cleaned) === JSON.stringify(data.notes.keyPoints)) {
      setEditingKeyPoints(false);
      return;
    }
    setSavingKeyPoints(true);
    const { ok } = await patchNotes({ keyPoints: cleaned });
    setSavingKeyPoints(false);
    if (ok) {
      toast("Key points updated.", "success");
      setEditingKeyPoints(false);
      await fetchMeeting();
    }
  }

  // M1 — decisions persist via the same PATCH path as keyPoints. No
  // diff → no request; same "clean empty strings out" policy.
  async function saveDecisions() {
    if (!data?.notes) return;
    const cleaned = decisionsDraft.map((d) => d.trim()).filter(Boolean);
    if (JSON.stringify(cleaned) === JSON.stringify(data.notes.decisions)) {
      setEditingDecisions(false);
      return;
    }
    setSavingDecisions(true);
    const { ok } = await patchNotes({ decisions: cleaned });
    setSavingDecisions(false);
    if (ok) {
      toast("Decisions updated.", "success");
      setEditingDecisions(false);
      await fetchMeeting();
    }
  }

  async function saveFollowUpDraft() {
    const subject = draftSubject.trim();
    const body = draftBody.trim();
    if (!subject || !body) {
      toast("Subject and body are both required.", "info");
      return;
    }
    setSavingDraft(true);
    try {
      const { ok } = await patchNotes({ followUpEmailDraft: { subject, body } });
      if (!ok) return; // patchNotes already toasted the error
      toast("Follow-up draft saved.", "success");
      setEditingDraft(false);
      await fetchMeeting();
    } catch (e) {
      console.warn("meeting-detail: saveFollowUpDraft failed", e);
      toast("Failed to save draft — network error.", "error");
    } finally {
      setSavingDraft(false);
    }
  }

  // CLE-14: returns a result so the meetings.sendFollowUp action can read it;
  // the existing button calls it via onClick and ignores the return.
  async function sendFollowUp(): Promise<{ ok: boolean; error?: string; recipients?: string[] }> {
    if (!dataRef.current) return { ok: false, error: "Meeting not loaded." };
    if (dataRef.current.followUpSentAt) {
      toast("Follow-up has already been sent.", "info");
      return { ok: false, error: "Follow-up has already been sent." };
    }
    setSendingFollowUp(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/notes/send-follow-up`, {
        method: "POST",
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const error = (errBody as { error?: string }).error || "Failed to send follow-up.";
        toast(error, "error");
        return { ok: false, error };
      }
      const result = (await res.json()) as { recipients: string[] };
      toast(`Follow-up sent to ${result.recipients.length} recipient${result.recipients.length === 1 ? "" : "s"}.`, "success");
      await fetchMeeting();
      return { ok: true, recipients: result.recipients };
    } catch (e) {
      console.warn("meeting-detail: sendFollowUp failed", e);
      toast("Failed to send follow-up — network error.", "error");
      return { ok: false, error: "Network error." };
    } finally {
      setSendingFollowUp(false);
    }
  }

  // CLE-14: returns a result so the meetings.shareSlack action can read it; the
  // existing button calls it via onClick and ignores the return.
  async function shareToSlack(): Promise<{ ok: boolean; error?: string }> {
    setSharingSlack(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/share-slack`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = (body as { error?: string }).error || "Couldn't share to Slack.";
        toast(error, "error");
        return { ok: false, error };
      }
      toast("Shared to Slack.", "success");
      return { ok: true };
    } catch {
      toast("Couldn't share to Slack — network error.", "error");
      return { ok: false, error: "Network error." };
    } finally {
      setSharingSlack(false);
    }
  }

  // CLE-14: the SINGLE POST /api/meetings/prep copy. The upcoming-meeting
  // "Generate Prep Now" button and the meetings.generatePrep action both call
  // this — reading the meeting's account/contact off the live `dataRef`.
  const generatePrepResult = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setGeneratingPrep(true);
    try {
      const m = (dataRef.current?.meeting ?? {}) as Record<string, unknown>;
      const res = await fetch("/api/meetings/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: m.entityId || m.accountId,
          contactId: m.contactId,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { ok: false, error: (errBody as { error?: string }).error || "Prep generation failed." };
      }
      const body = await res.json();
      setMeetingPrep(body.prep || body.briefing || "Prep generated. Check the meeting details.");
      return { ok: true };
    } catch (e) {
      console.warn("meeting-detail: prep generation failed", e);
      return { ok: false, error: "Network error." };
    } finally {
      setGeneratingPrep(false);
    }
  }, []);

  // CLE-14 §4: a second caller of the call-intel review REST contract — the SAME
  // request the MeddpiccScorecard / AccountCallIntel / ContactCallProfile cards
  // issue (call-intel.tsx usePendingReview.act). The server owns the
  // live-vs-pending merge; this adds no business logic. The cards keep their own
  // Approve/Dismiss buttons — this is purely the agent path.
  const reviewMeetingIntel = useCallback(
    async (
      entityType: "deal" | "company" | "contact",
      entityId: string,
      action: "approve" | "dismiss",
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/call-intel/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId, action }),
        });
        if (res.ok) return { ok: true };
        const errBody = await res.json().catch(() => ({}));
        return { ok: false, error: (errBody as { error?: string }).error || "Couldn't update the proposal." };
      } catch {
        return { ok: false, error: "Couldn't update the proposal." };
      }
    },
    [],
  );

  // ── CLE-14: live refs + the meeting-detail registration. The actions are
  //    captured once at mount; their run()s read live state via `dataRef` and
  //    call the stable handlers above. Registered UNCONDITIONALLY (before the
  //    early returns), so the manifest reflects /meetings/[id] the moment it
  //    mounts; each run() guards on the id matching the open meeting (E-1).
  //    The in-browser recorder + transcript upload are NEVER registered
  //    (MEETINGS_EXCLUDED_IDS) — they are human-bound. ──
  const meetingIdConst = meetingId;
  const sectionToPartial = useCallback(
    (
      section: "summary" | "keyPoints" | "decisions" | "followUp",
      value: string | string[] | { subject?: string; body?: string },
    ): Partial<MeetingNotes> | { followUpEmailDraft: { subject: string; body: string } } | null => {
      if (section === "summary") {
        if (typeof value !== "string") return null;
        return { summary: value.trim() };
      }
      if (section === "keyPoints" || section === "decisions") {
        if (!Array.isArray(value)) return null;
        const cleaned = value.map((v) => String(v).trim()).filter(Boolean);
        return section === "keyPoints" ? { keyPoints: cleaned } : { decisions: cleaned };
      }
      // followUp
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      const subject = (value.subject ?? "").trim();
      const body = (value.body ?? "").trim();
      if (!subject || !body) return null;
      return { followUpEmailDraft: { subject, body } };
    },
    [],
  );

  const meetingActions: PageAction[] = useMemo(
    () => [
      // ── editNotesSection (summary / keyPoints / decisions / followUp draft) ──
      definePageAction({
        id: "meetings.editNotesSection",
        title: "Edit a section of the meeting notes",
        description:
          "Edit one section of the open meeting's notes: the summary (string), the key points or decisions " +
          "(array of strings, replaces the list), or the follow-up email draft ({subject, body}). " +
          "Use when the user wants to fix or rewrite one of these sections.",
        params: z.object({
          meetingId: z.string().min(1),
          section: z.enum(["summary", "keyPoints", "decisions", "followUp"]),
          value: z.union([
            z.string(),
            z.array(z.string()),
            z.object({ subject: z.string().optional(), body: z.string().optional() }),
          ]),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ meetingId: mId, section, value }): Promise<PageActionResult> => {
          if (mId !== meetingIdConst) return errResult("That meeting is not the one open here.");
          const partial = sectionToPartial(section, value);
          if (!partial) {
            return errResult(
              section === "summary" ? "The summary must be text."
              : section === "followUp" ? "The follow-up draft needs both a subject and a body."
              : `The ${section} must be a list of strings.`,
            );
          }
          const r = await patchNotes(partial);
          if (!r.ok) return errResult(r.error ?? "Couldn't save that change.");
          const label = section === "followUp" ? "follow-up draft" : section;
          return okResult(`Updated the meeting ${label}.`);
        },
      }),
      // ── sendFollowUp (OUTBOUND) ─────────────────────────────────────────────
      definePageAction({
        id: "meetings.sendFollowUp",
        title: "Send the follow-up email",
        description:
          "Send the saved follow-up email draft for the open meeting to its attendees. This SENDS mail (always " +
          "confirmed). Only works when a draft exists and the follow-up hasn't already been sent.",
        params: z.object({ meetingId: z.string().min(1) }),
        mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
        run: async ({ meetingId: mId }): Promise<PageActionResult> => {
          if (mId !== meetingIdConst) return errResult("That meeting is not the one open here.");
          const r = await sendFollowUp();
          if (!r.ok) return errResult(r.error ?? "Couldn't send the follow-up.");
          const n = r.recipients?.length ?? 0;
          return okResult(n > 0 ? `Follow-up sent to ${n} recipient${n === 1 ? "" : "s"}.` : "Follow-up sent.");
        },
      }),
      // ── shareSlack (OUTBOUND) ───────────────────────────────────────────────
      definePageAction({
        id: "meetings.shareSlack",
        title: "Share the meeting to Slack",
        description:
          "Post the open meeting's summary to the workspace Slack channel via the configured webhook. This SENDS to " +
          "Slack (always confirmed).",
        params: z.object({ meetingId: z.string().min(1) }),
        mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
        run: async ({ meetingId: mId }): Promise<PageActionResult> => {
          if (mId !== meetingIdConst) return errResult("That meeting is not the one open here.");
          const r = await shareToSlack();
          return r.ok ? okResult("Shared the meeting to Slack.") : errResult(r.error ?? "Couldn't share to Slack.");
        },
      }),
      // ── generatePrep ────────────────────────────────────────────────────────
      definePageAction({
        id: "meetings.generatePrep",
        title: "Generate the meeting prep",
        description:
          "Generate a pre-meeting briefing for the open meeting (account context, key contacts, active deals, recent " +
          "interactions). Use for an upcoming meeting the user wants prepared.",
        params: z.object({ meetingId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ meetingId: mId }): Promise<PageActionResult> => {
          if (mId !== meetingIdConst) return errResult("That meeting is not the one open here.");
          const r = await generatePrepResult();
          return r.ok ? okResult("Generated the meeting prep.") : errResult(r.error ?? "Couldn't generate the prep.");
        },
      }),
      // ── postCallConfirm (run the post-call pipeline; updates the CRM) ────────
      definePageAction({
        id: "meetings.postCallConfirm",
        title: "Run post-call processing",
        description:
          "Run the post-call pipeline on the open meeting: create the action-item tasks, update the deal, and draft the " +
          "follow-up email. Use to confirm the auto-extracted data and push it to the CRM.",
        params: z.object({ meetingId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ meetingId: mId }): Promise<PageActionResult> => {
          if (mId !== meetingIdConst) return errResult("That meeting is not the one open here.");
          const r = await triggerPostCall();
          return r.ok ? okResult("Ran post-call - CRM updated.") : errResult(r.error ?? "Post-call processing failed.");
        },
      }),
      // ── approveIntel / dismissIntel (second REST caller of /call-intel/review) ─
      definePageAction({
        id: "meetings.approveIntel",
        title: "Approve a call-intel proposal on this meeting",
        description:
          "Apply the post-call qualification proposal pending on one of this meeting's CRM records (deal MEDDPICC, " +
          "company account-intel, or contact call-profile). Pass entityType and entityId. Only works when a proposal is pending.",
        params: z.object({
          meetingId: z.string().min(1),
          entityType: z.enum(["deal", "company", "contact"]),
          entityId: z.string().min(1),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ meetingId: mId, entityType, entityId }): Promise<PageActionResult> => {
          if (mId !== meetingIdConst) return errResult("That meeting is not the one open here.");
          if (!hasPendingIntel(dataRef.current?.crm, entityType)) {
            return errResult(`There's no pending ${entityType} intel proposal on this meeting.`);
          }
          const r = await reviewMeetingIntel(entityType, entityId, "approve");
          return r.ok ? okResult(`Applied the ${entityType} intel.`) : errResult(r.error ?? "Couldn't update the proposal.");
        },
      }),
      definePageAction({
        id: "meetings.dismissIntel",
        title: "Dismiss a call-intel proposal on this meeting",
        description:
          "Dismiss the post-call qualification proposal pending on one of this meeting's CRM records (deal MEDDPICC, " +
          "company account-intel, or contact call-profile). Pass entityType and entityId. Only works when a proposal is pending.",
        params: z.object({
          meetingId: z.string().min(1),
          entityType: z.enum(["deal", "company", "contact"]),
          entityId: z.string().min(1),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ meetingId: mId, entityType, entityId }): Promise<PageActionResult> => {
          if (mId !== meetingIdConst) return errResult("That meeting is not the one open here.");
          if (!hasPendingIntel(dataRef.current?.crm, entityType)) {
            return errResult(`There's no pending ${entityType} intel proposal on this meeting.`);
          }
          const r = await reviewMeetingIntel(entityType, entityId, "dismiss");
          return r.ok ? okResult(`Dismissed the ${entityType} intel.`) : errResult(r.error ?? "Couldn't update the proposal.");
        },
      }),
    ],
    // Stable id set; run()s read live `data` via dataRef and call the stable
    // handlers/useCallbacks above — so registration happens once (CLE-03).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meetingIdConst],
  );
  useRegisterPageActions(meetingActions);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.push("/meetings")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Meetings
        </Button>
        {loadError ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-gray-500">Couldn&apos;t load this meeting.</p>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchMeeting(); }}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-gray-500">Meeting not found.</p>
        )}
      </div>
    );
  }

  const { meeting, notes, followUpDraft, tasks: linkedTasks } = data;
  const meetingDate = new Date(meeting.date);
  const isPast = meetingDate < new Date();
  const isAutoTranscribed =
    data.transcriptSource === "recall_bot" || data.transcriptSource === "jibri";
  const needsReview = notes && !linkedTasks.length && !followUpDraft && isAutoTranscribed;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* MONACO-PARITY-05: deep-link confirmation banner + transcript
          chunks viewer. The TranscriptChunks component scrolls to the
          chunk that contains `?t=` and highlights it, so a coaching
          citation chip lands the founder right on the verbatim quote
          even before a recording player ships. */}
      {seekSeconds !== null && (
        <div
          className="rounded-lg px-4 py-3 flex items-center justify-between"
          style={{
            background: "var(--color-accent-soft, rgba(99,102,241,0.08))",
            border: "1px solid var(--color-accent, #6366f1)",
            color: "var(--color-text-primary)",
          }}
        >
          <div className="flex items-center gap-2 text-[13px]">
            <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
              style={{ background: "var(--color-accent, #6366f1)", color: "white" }}>
              {formatSecondsAsTimestamp(seekSeconds)}
            </span>
            <span>Coaching citation linked to this moment in the call.</span>
          </div>
          <button
            type="button"
            onClick={() => router.replace(`/meetings/${meetingId}`)}
            className="text-[12px] underline"
            style={{ color: "var(--color-accent, #6366f1)" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* P0-4 follow-up — embedded recording player. Renders the
          right shape per provider (loom / zoom / recall / youtube /
          vimeo / direct mp4) ; falls back to "no recording yet"
          when the URL is missing. Citation deep-links seek
          automatically via the seekSeconds prop. */}
      <TranscriptVideoPlayer
        recordingUrl={data.meeting.recordingUrl ?? null}
        seekToSec={seekSeconds ?? 0}
      />

      {/* Transcript chunks always visible (when indexed). Even
          without a `?t=` deep-link, founders can read the verbatim
          chunks and get a click-to-cite preview surface. */}
      <div className="rounded-xl p-4 space-y-2"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}>
          Transcript chunks
        </h3>
        <TranscriptChunks meetingId={meetingId} seekSeconds={seekSeconds} />
      </div>

      {/* Review banner for auto-transcribed meetings */}
      {needsReview && (
        <div
          className="rounded-xl p-5"
          style={{ background: "linear-gradient(135deg, var(--color-accent-soft), var(--color-warning-soft, #fef3c7))", border: "1px solid var(--color-accent)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Review auto-extracted data
                </h2>
              </div>
              <p className="text-[13px] mb-4" style={{ color: "var(--color-text-secondary)" }}>
                This meeting was automatically transcribed and analyzed. Review the key findings below, then confirm to update your CRM.
              </p>

              {/* Quick preview of buying signals */}
              {notes.buyingSignals && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {notes.buyingSignals.budget && (
                    <div className="rounded-lg px-3 py-2" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
                      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-tertiary)" }}>Budget</span>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{notes.buyingSignals.budget}</p>
                    </div>
                  )}
                  {notes.buyingSignals.timeline && (
                    <div className="rounded-lg px-3 py-2" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
                      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-tertiary)" }}>Timeline</span>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{notes.buyingSignals.timeline}</p>
                    </div>
                  )}
                  {notes.buyingSignals.competitors.length > 0 && (
                    <div className="rounded-lg px-3 py-2" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
                      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-tertiary)" }}>Competitors</span>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{notes.buyingSignals.competitors.join(", ")}</p>
                    </div>
                  )}
                  {notes.buyingSignals.painPoints.length > 0 && (
                    <div className="rounded-lg px-3 py-2" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
                      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-tertiary)" }}>Pain Points</span>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{notes.buyingSignals.painPoints.join(", ")}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Action items preview */}
              {notes.actionItems.length > 0 && (
                <div className="mb-4">
                  <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-tertiary)" }}>
                    {notes.actionItems.length} action item{notes.actionItems.length > 1 ? "s" : ""} to create
                  </span>
                  <ul className="mt-1 space-y-1">
                    {notes.actionItems.slice(0, 3).map((item, i) => (
                      <li key={i} className="text-[12px] flex items-center gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
                        <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                        <span className="font-medium">{item.owner}:</span> {item.task}
                      </li>
                    ))}
                    {notes.actionItems.length > 3 && (
                      <li className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                        +{notes.actionItems.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="solid"
              size="md"
              onClick={triggerPostCall}
              disabled={processingPostCall}
            >
              {processingPostCall ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
              Confirm & update CRM
            </Button>
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              Creates tasks, updates deal, drafts follow-up email
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/meetings")} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Meetings
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{meeting.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {meetingDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {meetingDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                {meeting.endTime && ` - ${new Date(meeting.endTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
              </span>
              {meeting.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {meeting.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {meeting.meetingLink && (
              <a href={meeting.meetingLink} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-1" /> Join
                </Button>
              </a>
            )}
            {notes && (
              <Button variant="outline" size="sm" onClick={shareToSlack} disabled={sharingSlack} loading={sharingSlack}>
                <Send className="mr-1 h-4 w-4" /> Share to Slack
              </Button>
            )}
            {notes && <SentimentBadge sentiment={notes.sentiment} />}
          </div>
        </div>
      </div>

      {/* Live extraction during active recording */}
      {(() => {
        const meetingMeta = (meeting as any).metadata || (meeting as any);
        const recStatus = meetingMeta.recordingStatus;
        const isRecording = recStatus === "recording" || recStatus === "in_call";
        if (isRecording || (recStatus === "done" && meetingMeta.partialTranscript)) {
          return <LiveExtraction meetingId={(meeting as any).activityId || meetingId} isRecording={isRecording} />;
        }
        return null;
      })()}

      {/* Attendees */}
      {meeting.attendees.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4 text-gray-400" />
          {meeting.attendees.map((a, i) => (
            <span key={i} className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300">
              {a.contactId ? (
                <a href={`/contacts/${a.contactId}`} className="hover:underline text-blue-600 dark:text-blue-400">
                  {a.displayName || a.email}
                </a>
              ) : (
                a.displayName || a.email
              )}
            </span>
          ))}
        </div>
      )}

      {data.transcriptSource === "jibri" && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {t("meeting.sovereignNotice")}
        </p>
      )}

      {/* Notes or Upload */}
      {notes ? (
        <div className="space-y-4">
          {/* Summary — inline editable (M1) */}
          <CollapsibleSection title="Summary" icon={FileText}>
            {editingSummary ? (
              <div className="space-y-2">
                <textarea
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 text-sm text-gray-900 dark:text-gray-100 resize-y focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveSummary} disabled={savingSummary}>
                    {savingSummary ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingSummary(false)} disabled={savingSummary}>
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{notes.summary || <span className="italic text-gray-400">No summary yet.</span>}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSummaryDraft(notes.summary || "");
                    setEditingSummary(true);
                  }}
                >
                  <Edit2 className="h-3 w-3 mr-1" /> Edit
                </Button>
              </div>
            )}
          </CollapsibleSection>

          {/* Qualification + CRM enrichment — the SAME MEDDPICC scorecard,
              account intel and contact profile the call path renders, now fed
              from the recorded meeting. Each self-returns null when empty; in
              review mode an inline Approve/Dismiss bar posts to
              /api/call-intel/review. */}
          {data.crm?.deal && (
            <MeddpiccScorecard properties={data.crm.deal.properties} entityId={data.crm.deal.id} />
          )}
          {data.crm?.company && (
            <AccountCallIntel properties={data.crm.company.properties} entityId={data.crm.company.id} />
          )}
          {data.crm?.contact && (
            <ContactCallProfile properties={data.crm.contact.properties} entityId={data.crm.contact.id} />
          )}
          {data.coaching && <CoachingSection coaching={data.coaching} />}

          {/* Key Points — inline editable (M1) */}
          <CollapsibleSection title={`Key Points (${notes.keyPoints.length})`} icon={FileText}>
            {editingKeyPoints ? (
              <div className="space-y-2">
                {keyPointsDraft.map((point, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={point}
                      onChange={(e) => {
                        const next = [...keyPointsDraft];
                        next[i] = e.target.value;
                        setKeyPointsDraft(next);
                      }}
                      className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => setKeyPointsDraft(keyPointsDraft.filter((_, j) => j !== i))}
                      aria-label="Remove key point"
                      className="rounded-md p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setKeyPointsDraft([...keyPointsDraft, ""])}>
                  <Plus className="h-3 w-3 mr-1" /> Add key point
                </Button>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={saveKeyPoints} disabled={savingKeyPoints}>
                    {savingKeyPoints ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingKeyPoints(false)} disabled={savingKeyPoints}>
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {notes.keyPoints.length > 0 ? (
                  <ul className="space-y-1.5">
                    {notes.keyPoints.map((point, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                        <span className="text-gray-400 mt-0.5">-</span> {point}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm italic text-gray-400">No key points yet.</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKeyPointsDraft(notes.keyPoints.length > 0 ? [...notes.keyPoints] : [""]);
                    setEditingKeyPoints(true);
                  }}
                >
                  <Edit2 className="h-3 w-3 mr-1" /> Edit key points
                </Button>
              </div>
            )}
          </CollapsibleSection>

          {/* Action Items */}
          {notes.actionItems.length > 0 && (
            <CollapsibleSection title={`Action Items (${notes.actionItems.length})`} icon={CheckCircle2}>
              <div className="space-y-2">
                {notes.actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-gray-900 dark:text-gray-100">{item.task}</span>
                      <span className="text-gray-500 ml-2">({item.owner})</span>
                      {item.deadline && <span className="text-gray-400 ml-2">Due: {item.deadline}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {linkedTasks.length > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                  {linkedTasks.length} task(s) created in CRM
                </p>
              )}
              {linkedTasks.length === 0 && notes.actionItems.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={triggerPostCall}
                  disabled={processingPostCall}
                >
                  {processingPostCall ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                  Create Tasks
                </Button>
              )}
            </CollapsibleSection>
          )}

          {/* Decisions — inline editable (M1). Section always renders
               so the user can add decisions the extractor missed. */}
          <CollapsibleSection title={`Decisions (${notes.decisions.length})`} icon={MessageSquare} defaultOpen={false}>
            {editingDecisions ? (
              <div className="space-y-2">
                {decisionsDraft.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={d}
                      onChange={(e) => {
                        const next = [...decisionsDraft];
                        next[i] = e.target.value;
                        setDecisionsDraft(next);
                      }}
                      className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => setDecisionsDraft(decisionsDraft.filter((_, j) => j !== i))}
                      aria-label="Remove decision"
                      className="rounded-md p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setDecisionsDraft([...decisionsDraft, ""])}>
                  <Plus className="h-3 w-3 mr-1" /> Add decision
                </Button>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={saveDecisions} disabled={savingDecisions}>
                    {savingDecisions ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingDecisions(false)} disabled={savingDecisions}>
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {notes.decisions.length > 0 ? (
                  <ul className="space-y-1.5">
                    {notes.decisions.map((d, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                        <span className="text-gray-400 mt-0.5">-</span> {d}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No decisions captured. Click Edit to add the outcomes of this meeting.
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setDecisionsDraft(notes.decisions.length > 0 ? [...notes.decisions] : [""]);
                    setEditingDecisions(true);
                  }}
                >
                  <Edit2 className="h-3 w-3 mr-1" /> Edit
                </Button>
              </div>
            )}
          </CollapsibleSection>

          {/* Buying Signals */}
          {notes.buyingSignals && (
            <CollapsibleSection title="Buying Signals" icon={AlertTriangle} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <BuyingSignalCard label="Budget" value={notes.buyingSignals.budget} />
                <BuyingSignalCard label="Timeline" value={notes.buyingSignals.timeline} />
                <BuyingSignalCard label="Team Size" value={notes.buyingSignals.teamSize} />
                <BuyingSignalCard label="Current Stack" value={notes.buyingSignals.currentStack} />
                <BuyingSignalCard label="Pain Points" value={notes.buyingSignals.painPoints} />
                <BuyingSignalCard label="Objections" value={notes.buyingSignals.objections} />
                <BuyingSignalCard label="Competitors" value={notes.buyingSignals.competitors} />
                <BuyingSignalCard label="Next Steps" value={notes.buyingSignals.nextSteps} />
              </div>
            </CollapsibleSection>
          )}

          {/* Follow-Up Email Draft — M1 edit + M2 send */}
          {(followUpDraft || data.followUpSentAt) && (
            <CollapsibleSection title="Follow-Up Email Draft" icon={Send}>
              {data.followUpSentAt ? (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Follow-up sent on {new Date(data.followUpSentAt).toLocaleString()}
                  </div>
                  {followUpDraft?.subject && (
                    <p className="text-[12px]"><span className="font-semibold">Subject:</span> {followUpDraft.subject}</p>
                  )}
                  {followUpDraft?.body && (
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-[12px]">{followUpDraft.body}</pre>
                  )}
                </div>
              ) : editingDraft ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-gray-500">Subject</label>
                  <input
                    type="text"
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="block pt-1 text-[11px] font-medium uppercase tracking-wider text-gray-500">Body</label>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={10}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={saveFollowUpDraft} disabled={savingDraft}>
                      {savingDraft ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                      Save draft
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditingDraft(false)} disabled={savingDraft}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300">
                    {followUpDraft?.subject && (
                      <p className="mb-2 font-medium"><span className="text-gray-500">Subject:</span> {followUpDraft.subject}</p>
                    )}
                    {followUpDraft?.body ? (
                      <pre className="whitespace-pre-wrap font-sans">{followUpDraft.body}</pre>
                    ) : (
                      <p className="italic text-gray-400">No draft body yet.</p>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={sendFollowUp}
                      disabled={sendingFollowUp || !followUpDraft?.subject || !followUpDraft?.body}
                      loading={sendingFollowUp}
                    >
                      <Send className="h-3 w-3 mr-1" /> Send follow-up
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDraftSubject(followUpDraft?.subject || "");
                        setDraftBody(followUpDraft?.body || "");
                        setEditingDraft(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3 mr-1" /> Edit draft
                    </Button>
                    {followUpDraft?.body && (
                      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(followUpDraft.body)}>
                        Copy
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CollapsibleSection>
          )}
        </div>
      ) : isPast ? (
        /* Upload Zone for past meetings */
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Add Meeting Notes</h2>

          {/* Record in-browser — feeds the same audio → Whisper → notes → CRM
              pipeline as a file upload, for in-person meetings with no bot. */}
          <MeetingRecorder onRecorded={(file) => handleFileUpload(file)} disabled={uploading} />

          {/* Drag & Drop */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-600"
            }`}
          >
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drag & drop a transcript file here (.txt, .vtt, .srt, .mp3, .m4a, .wav)
            </p>
            <p className="text-xs text-gray-400 mt-1">or</p>
            <label className="cursor-pointer inline-block mt-2">
              <span className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                Choose File
              </span>
              <input
                type="file"
                className="hidden"
                accept=".txt,.vtt,.srt,.mp3,.m4a,.webm,.wav,.ogg,.flac"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </label>
          </div>

          {/* Paste Text */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Or paste transcript
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your meeting transcript here (min 50 characters)..."
              className="w-full h-32 p-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Button
              size="sm"
              className="mt-2"
              disabled={pasteText.trim().length < 50 || uploading}
              onClick={handlePasteSubmit}
            >
              {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
              Process Transcript
            </Button>
          </div>

          {uploading && (
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing transcript... This may take a moment.
            </div>
          )}
        </div>
      ) : (
        /* Upcoming meeting — show prep or generate button */
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
            <FileText className="h-4 w-4" /> Upcoming Meeting
          </div>
          {meetingPrep ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-blue-700 dark:text-blue-400 whitespace-pre-wrap">
              {meetingPrep}
            </div>
          ) : (
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
                Generate a briefing with account context, key contacts, active deals, and recent interactions.
              </p>
              <button
                onClick={() => { void generatePrepResult(); }}
                disabled={generatingPrep}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium text-white gradient-brand"
              >
                {generatingPrep ? <><Loader2 className="h-3 w-3 animate-spin" /> Preparing...</> : <><FileText className="h-3 w-3" /> Generate Prep Now</>}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
