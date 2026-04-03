"use client";

import { Calendar, FileText, ExternalLink, Clock, Users, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useEffect, useState, useCallback } from "react";

interface MeetingActivity {
  id: string;
  summary: string;
  occurredAt: string;
  activityType: string;
  metadata: {
    startTime?: string;
    endTime?: string;
    attendees?: Array<{ email: string; name?: string; contactId?: string }>;
    location?: string;
    meetingLink?: string;
    calendarEventId?: string;
  };
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [prepDocs, setPrepDocs] = useState<Record<string, string>>({});
  const [prepLoading, setPrepLoading] = useState<Record<string, boolean>>({});
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/activities?activityType=meeting_scheduled&limit=30");
        if (res.ok) {
          const data = await res.json();
          // Sort by date, upcoming first
          const sorted = (data.activities || []).sort((a: MeetingActivity, b: MeetingActivity) => {
            const dateA = a.metadata?.startTime || a.occurredAt;
            const dateB = b.metadata?.startTime || b.occurredAt;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
          });
          setMeetings(sorted);
        }
      } catch {
        // Silent fail
      }
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
    } catch {
      // Silent fail
    }
    setPrepLoading((prev) => ({ ...prev, [meetingId]: false }));
  }, [prepDocs, expandedMeeting]);

  // Split into upcoming vs past
  const now = new Date();
  const upcoming = meetings.filter((m) => {
    const date = new Date(m.metadata?.startTime || m.occurredAt);
    return date >= now;
  });
  const past = meetings.filter((m) => {
    const date = new Date(m.metadata?.startTime || m.occurredAt);
    return date < now;
  });

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
      <PageHeader
        icon={<Calendar size={15} />}
        title="Meetings"
        subtitle={`${meetings.length}`}
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        {meetings.length === 0 ? (
          <EmptyState
            icon={<Calendar size={24} />}
            title="No meetings"
            description="Connect your Google Calendar to sync meetings automatically."
            actionLabel="Go to settings"
            onAction={() => window.location.href = "/settings/mailboxes"}
            actionVariant="outline"
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Upcoming meetings */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--color-text-tertiary)" }}>
                  Upcoming
                </h2>
                <div className="space-y-2">
                  {upcoming.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      expanded={expandedMeeting === meeting.id}
                      prepDoc={prepDocs[meeting.id]}
                      prepLoading={prepLoading[meeting.id]}
                      onGeneratePrep={() => generatePrep(meeting.id)}
                      onToggle={() => setExpandedMeeting(expandedMeeting === meeting.id ? null : meeting.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Past meetings */}
            {past.length > 0 && (
              <section>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--color-text-tertiary)" }}>
                  Past
                </h2>
                <div className="space-y-2">
                  {past.map((meeting) => (
                    <MeetingCard
                      key={meeting.id}
                      meeting={meeting}
                      expanded={expandedMeeting === meeting.id}
                      prepDoc={prepDocs[meeting.id]}
                      prepLoading={prepLoading[meeting.id]}
                      onGeneratePrep={() => generatePrep(meeting.id)}
                      onToggle={() => setExpandedMeeting(expandedMeeting === meeting.id ? null : meeting.id)}
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
  meeting,
  expanded,
  prepDoc,
  prepLoading,
  onGeneratePrep,
  onToggle,
}: {
  meeting: MeetingActivity;
  expanded: boolean;
  prepDoc?: string;
  prepLoading?: boolean;
  onGeneratePrep: () => void;
  onToggle: () => void;
}) {
  const date = new Date(meeting.metadata?.startTime || meeting.occurredAt);
  const endDate = meeting.metadata?.endTime ? new Date(meeting.metadata.endTime) : null;
  const attendees = meeting.metadata?.attendees || [];
  const isUpcoming = date >= new Date();

  return (
    <div
      className="rounded-lg transition-all"
      style={{
        background: "var(--color-bg-card)",
        border: "0.5px solid var(--color-border-default)",
      }}
    >
      {/* Meeting header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-lg"
          style={{ background: isUpcoming ? "var(--color-accent-soft)" : "var(--color-bg-muted)" }}>
          <span className="text-[10px] font-semibold uppercase"
            style={{ color: isUpcoming ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>
            {date.toLocaleDateString("en", { month: "short" })}
          </span>
          <span className="text-[15px] font-bold leading-none"
            style={{ color: isUpcoming ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
            {date.getDate()}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium"
              style={{ color: "var(--color-text-primary)" }}>
              {meeting.summary || "Untitled meeting"}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[12px]"
            style={{ color: "var(--color-text-tertiary)" }}>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {date.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
              {endDate && ` – ${endDate.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
            {attendees.length > 0 && (
              <span className="flex items-center gap-1">
                <Users size={11} />
                {attendees.length} attendee{attendees.length !== 1 ? "s" : ""}
              </span>
            )}
            {meeting.metadata?.location && (
              <span className="truncate">{meeting.metadata.location}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meeting.metadata?.meetingLink && (
            <a href={meeting.metadata.meetingLink} target="_blank" rel="noopener noreferrer"
              className="rounded-md p-1.5 transition-colors"
              style={{ color: "var(--color-accent)" }}
              title="Join meeting">
              <ExternalLink size={14} />
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onGeneratePrep}
            disabled={prepLoading}
            icon={prepLoading
              ? <Sparkles size={13} className="animate-pulse" />
              : <FileText size={13} />
            }
            style={{ color: "var(--color-accent)" }}
          >
            {prepLoading ? "Generating..." : prepDoc ? "View prep" : "Meeting prep"}
          </Button>
          {prepDoc && (
            <button onClick={onToggle} style={{ color: "var(--color-text-tertiary)" }}>
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded prep document */}
      {expanded && prepDoc && (
        <div className="px-4 pb-4" style={{ borderTop: "0.5px solid var(--color-border-default)" }}>
          <div className="mt-3 rounded-lg p-4"
            style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
            <div className="flex items-center gap-1.5 mb-3 text-[12px]"
              style={{ color: "var(--color-text-tertiary)" }}>
              <Sparkles size={12} style={{ color: "var(--color-accent)" }} />
              <span style={{ fontWeight: 500 }}>AI-generated meeting prep</span>
            </div>
            <div className="prose prose-sm max-w-none text-[13px]"
              style={{ color: "var(--color-text-primary)", lineHeight: "20px" }}>
              <ChatMarkdown>{prepDoc}</ChatMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
