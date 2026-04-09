"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Calendar, Clock, MapPin, Users, ExternalLink,
  FileText, Upload, CheckCircle2, AlertTriangle, Sparkles,
  ChevronDown, ChevronRight, Send, Plus, Loader2, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

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
  };
  hasTranscript: boolean;
  transcriptSource: string | null;
  notes: MeetingNotes | null;
  followUpDraft: string | null;
  tasks: Array<{ id: string; title: string; status: string }>;
  matchedContacts: Array<{ name: string; contactId: string | null }>;
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

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [data, setData] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingPostCall, setProcessingPostCall] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [meetingPrep, setMeetingPrep] = useState<string | null>(null);
  const [generatingPrep, setGeneratingPrep] = useState(false);

  const fetchMeeting = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/notes`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
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

  const triggerPostCall = async () => {
    setProcessingPostCall(true);
    try {
      await fetch(`/api/meetings/${meetingId}/post-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchMeeting();
    } catch { /* silent */ }
    setProcessingPostCall(false);
  };

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
        <p className="text-gray-500">Meeting not found.</p>
      </div>
    );
  }

  const { meeting, notes, followUpDraft, tasks: linkedTasks } = data;
  const meetingDate = new Date(meeting.date);
  const isPast = meetingDate < new Date();
  const isAutoTranscribed = data.transcriptSource === "recall_bot";
  const needsReview = notes && !linkedTasks.length && !followUpDraft && isAutoTranscribed;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Review banner for auto-transcribed meetings */}
      {needsReview && (
        <div
          className="rounded-xl p-5"
          style={{ background: "linear-gradient(135deg, var(--color-accent-soft), var(--color-warning-soft, #fef3c7))", border: "1px solid var(--color-accent)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
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
            {notes && <SentimentBadge sentiment={notes.sentiment} />}
          </div>
        </div>
      </div>

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

      {/* Notes or Upload */}
      {notes ? (
        <div className="space-y-4">
          {/* Summary */}
          <CollapsibleSection title="Summary" icon={FileText}>
            <p className="text-sm text-gray-700 dark:text-gray-300">{notes.summary}</p>
          </CollapsibleSection>

          {/* Key Points */}
          {notes.keyPoints.length > 0 && (
            <CollapsibleSection title={`Key Points (${notes.keyPoints.length})`} icon={Sparkles}>
              <ul className="space-y-1.5">
                {notes.keyPoints.map((point, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <span className="text-gray-400 mt-0.5">-</span> {point}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

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

          {/* Decisions */}
          {notes.decisions.length > 0 && (
            <CollapsibleSection title={`Decisions (${notes.decisions.length})`} icon={MessageSquare} defaultOpen={false}>
              <ul className="space-y-1.5">
                {notes.decisions.map((d, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <span className="text-gray-400 mt-0.5">-</span> {d}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

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

          {/* Follow-Up Email Draft */}
          {followUpDraft && (
            <CollapsibleSection title="Follow-Up Email Draft" icon={Send}>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {followUpDraft}
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm">
                  <Send className="h-3 w-3 mr-1" /> Edit & Send
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(followUpDraft)}>
                  Copy
                </Button>
              </div>
            </CollapsibleSection>
          )}
        </div>
      ) : isPast ? (
        /* Upload Zone for past meetings */
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Add Meeting Notes</h2>

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
              {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
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
            <Sparkles className="h-4 w-4" /> Upcoming Meeting
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
                onClick={async () => {
                  setGeneratingPrep(true);
                  try {
                    const meetingAny = meeting as Record<string, unknown>;
                    const res = await fetch("/api/meetings/prep", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        accountId: meetingAny.entityId || meetingAny.accountId,
                        contactId: meetingAny.contactId,
                      }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setMeetingPrep(data.prep || data.briefing || "Prep generated. Check the meeting details.");
                    }
                  } catch { /* */ } finally { setGeneratingPrep(false); }
                }}
                disabled={generatingPrep}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium text-white gradient-brand"
              >
                {generatingPrep ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</> : <><Sparkles className="h-3 w-3" /> Generate Prep Now</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
