"use client";

import { Calendar, FileText, ExternalLink, Clock, Users, ChevronDown, ChevronRight, Sparkles, Mic, CheckCircle2, AlertCircle, Play, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useEffect, useState, useCallback } from "react";

interface Meeting {
  id: string;
  calendarEventId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  attendees: Array<{ email: string; displayName: string | null; responseStatus: string }>;
  location: string | null;
  meetingLink: string | null;
  status: string;
  isPast: boolean;
  hasTranscript: boolean;
  hasNotes: boolean;
  notes: { summary: string } | null;
  recordingUrl: string | null;
  activityId: string | null;
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(true);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [prepDocs, setPrepDocs] = useState<Record<string, string>>({});
  const [prepLoading, setPrepLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/meetings?daysBack=30&daysForward=14");
        if (res.ok) {
          const data = await res.json();
          setMeetings(data.meetings || []);
          setCalendarConnected(data.calendarConnected !== false);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const generatePrep = useCallback(async (meetingId: string) => {
    if (prepDocs[meetingId]) {
      setExpandedMeeting(expandedMeeting === meetingId ? null : meetingId);
      return;
    }
    setPrepLoading((prev) => ({ ...prev, [meetingId]: true }));
    try {
      const res = await fetch("/api/meetings/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: meetingId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrepDocs((prev) => ({ ...prev, [meetingId]: data.prep }));
        setExpandedMeeting(meetingId);
      }
    } catch {}
    setPrepLoading((prev) => ({ ...prev, [meetingId]: false }));
  }, [prepDocs, expandedMeeting]);

  const upcoming = meetings.filter((m) => !m.isPast);
  const past = meetings.filter((m) => m.isPast);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={<Calendar size={15} />} title="Meetings" subtitle="Loading..." />
        <div className="flex flex-1 items-center justify-center">
          <Sparkles size={20} className="animate-pulse" style={{ color: "var(--color-accent)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Calendar size={15} />} title="Meetings" subtitle={`${meetings.length}`}>
        <Button variant="outline" size="sm" onClick={() => window.location.href = "/meetings/upload"}>
          <Upload size={13} /> Upload transcript
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto px-4 py-6">
        {!calendarConnected ? (
          <EmptyState
            icon={<Calendar size={24} />}
            title="Connect your calendar"
            description="Connect Google Calendar to see your meetings here."
            actionLabel="Go to settings"
            onAction={() => window.location.href = "/settings/mail-calendar"}
            actionVariant="outline"
          />
        ) : meetings.length === 0 ? (
          <EmptyState
            icon={<Calendar size={24} />}
            title="No meetings found"
            description="No meetings in the last 30 days or next 2 weeks. They'll appear here automatically."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Upcoming ({upcoming.length})
                </h2>
                <div className="space-y-2">
                  {upcoming.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      expanded={expandedMeeting === m.id}
                      onToggle={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)}
                      onPrep={() => generatePrep(m.id)}
                      prepDoc={prepDocs[m.id]}
                      prepLoading={prepLoading[m.id]}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Past */}
            {past.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Past ({past.length})
                </h2>
                <div className="space-y-2">
                  {past.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      expanded={expandedMeeting === m.id}
                      onToggle={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)}
                      onPrep={() => generatePrep(m.id)}
                      prepDoc={prepDocs[m.id]}
                      prepLoading={prepLoading[m.id]}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingCard({
  meeting: m,
  expanded,
  onToggle,
  onPrep,
  prepDoc,
  prepLoading,
}: {
  meeting: Meeting;
  expanded: boolean;
  onToggle: () => void;
  onPrep: () => void;
  prepDoc?: string;
  prepLoading?: boolean;
}) {
  const date = new Date(m.startTime);
  const endDate = new Date(m.endTime);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endTimeStr = endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const durationMin = Math.round((endDate.getTime() - date.getTime()) / 60000);

  return (
    <Card>
      <CardBody>
        <button className="w-full text-left" onClick={onToggle}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={13} style={{ color: "var(--color-text-muted)" }} /> : <ChevronRight size={13} style={{ color: "var(--color-text-muted)" }} />}
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{m.title}</p>
                {m.hasNotes && <Badge variant="success" size="sm">Notes</Badge>}
                {m.hasTranscript && <Badge variant="info" size="sm">Transcript</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-1 ml-5">
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {dateStr} · {timeStr}–{endTimeStr} ({durationMin}min)
                </span>
                {m.attendees.length > 0 && (
                  <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    <Users size={10} className="inline mr-0.5" />
                    {m.attendees.length}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {m.meetingLink && (
                <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                  className="rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: "rgba(var(--color-accent-rgb, 99,102,241), 0.1)", color: "var(--color-accent)" }}>
                  Join
                </a>
              )}
              {!m.isPast && (
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onPrep(); }} loading={prepLoading}>
                  <Sparkles size={11} /> Prep
                </Button>
              )}
            </div>
          </div>
        </button>

        {expanded && (
          <div className="mt-3 ml-5 space-y-3" style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: "12px" }}>
            {/* Attendees */}
            {m.attendees.length > 0 && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Attendees</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {m.attendees.map((a) => (
                    <span key={a.email} className="text-[11px] rounded-full px-2 py-0.5"
                      style={{ background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}>
                      {a.displayName || a.email}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Notes */}
            {m.notes?.summary && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>AI Notes</span>
                <div className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  <ChatMarkdown>{m.notes.summary}</ChatMarkdown>
                </div>
              </div>
            )}

            {/* Prep doc */}
            {prepDoc && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Meeting Prep</span>
                <div className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  <ChatMarkdown content={prepDoc} />
                </div>
              </div>
            )}

            {/* Location / Link */}
            {(m.location || m.meetingLink) && (
              <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {m.location && <span>{m.location}</span>}
                {m.meetingLink && (
                  <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--color-accent)" }}>
                    <ExternalLink size={10} /> Meeting link
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
