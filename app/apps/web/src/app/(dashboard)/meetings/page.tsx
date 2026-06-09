"use client";

import { Calendar, Users, Timer, AlertTriangle, Sun, List as ListIcon, LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { useEffect, useState, useCallback } from "react";
import {
  MeetingCard,
  CalendarView,
  weekStartOf,
  weekLabel,
  type Meeting,
} from "./_meeting-views";

interface NextMeetingInfo {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  meetingLink: string | null;
  minutesUntil: number;
}

interface ConflictInfo {
  meetingA: string;
  meetingB: string;
  overlapMinutes: number;
}

function formatCountdown(minutesUntil: number): string {
  if (minutesUntil <= 0) return "Starting now";
  if (minutesUntil < 60) return `in ${minutesUntil}m`;
  const hours = Math.floor(minutesUntil / 60);
  const mins = minutesUntil % 60;
  if (hours < 24) return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `in ${days}d ${remainHours}h` : `in ${days}d`;
}

const WEEK_MS = 7 * 86_400_000;

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(true);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [prepDocs, setPrepDocs] = useState<Record<string, string>>({});
  const [prepLoading, setPrepLoading] = useState<Record<string, boolean>>({});
  const [nextMeeting, setNextMeeting] = useState<NextMeetingInfo | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [countdownStr, setCountdownStr] = useState<string>("");
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [weekStart, setWeekStart] = useState<Date>(() => weekStartOf(new Date()));
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/meetings?daysBack=30&daysForward=21");
        if (res.ok) {
          const data = await res.json();
          setMeetings(data.meetings || []);
          setCalendarConnected(data.calendarConnected !== false);
          setNextMeeting(data.nextMeeting || null);
          setConflicts(data.conflicts || []);
        }
      } catch (e) {
        console.warn("meetings: list fetch failed", e);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!nextMeeting) {
      setCountdownStr("");
      return;
    }
    function tick() {
      if (!nextMeeting) return;
      const minutesUntil = Math.max(0, Math.round((new Date(nextMeeting.startTime).getTime() - Date.now()) / 60000));
      setCountdownStr(formatCountdown(minutesUntil));
    }
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [nextMeeting]);

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
    } catch (e) {
      console.warn("meetings: prep generation failed", e);
    }
    setPrepLoading((prev) => ({ ...prev, [meetingId]: false }));
  }, [prepDocs, expandedMeeting]);

  const upcoming = meetings.filter((m) => !m.isPast && !m.isAllDay);
  const allDayUpcoming = meetings.filter((m) => !m.isPast && m.isAllDay);
  const past = meetings.filter((m) => m.isPast);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={<Calendar size={15} />} title="Meetings" />
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-row flex items-start gap-4 rounded-lg p-4" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
              <div className="shrink-0" style={{ width: 52 }}>
                <div className="skeleton h-4 w-12 rounded" />
                <div className="skeleton mt-1 h-3 w-8 rounded" />
              </div>
              <div className="flex-1">
                <div className="skeleton h-4 rounded" style={{ width: `${140 + i * 20}px` }} />
                <div className="mt-2 flex items-center gap-2">
                  <div className="skeleton h-5 w-5 rounded-full" />
                  <div className="skeleton h-3 w-24 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader icon={<Calendar size={15} />} title="Meetings" subtitle={`${meetings.length}`}>
        {meetings.length > 0 && <ViewToggle view={view} onChange={setView} />}
      </PageHeader>

      <div className="flex-1 overflow-auto px-4 py-6">
        {!calendarConnected ? (
          <EmptyState
            icon={<Calendar size={24} />}
            title="Connect your calendar"
            description="Connect Google, Microsoft, or any IMAP/CalDAV calendar (Zimbra, Infomaniak, OVH…). Elevay then shows your meetings here, links each to the right account, and its notetaker auto-joins any call with a link — so the transcript and notes land here on their own."
            actionLabel="Go to settings"
            onAction={() => router.push("/settings/mail-calendar")}
            actionVariant="outline"
          />
        ) : meetings.length === 0 ? (
          <EmptyState
            icon={<Calendar size={24} />}
            title="No meetings in view"
            description="Your calendar is connected — meetings show up here automatically. Elevay's notetaker joins any call with a link and captures the transcript and notes for you, so there's nothing to upload."
            actionLabel="Manage calendars"
            onAction={() => router.push("/settings/mail-calendar")}
            actionVariant="outline"
          />
        ) : view === "calendar" ? (
          <div className="mx-auto max-w-5xl space-y-4">
            {/* Week navigation */}
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{weekLabel(weekStart)}</h2>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setWeekStart(weekStartOf(new Date()))}>Today</Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => new Date(w.getTime() - WEEK_MS))} aria-label="Previous week"><ChevronLeft size={14} /></Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => new Date(w.getTime() + WEEK_MS))} aria-label="Next week"><ChevronRight size={14} /></Button>
              </div>
            </div>

            {conflicts.length > 0 && <ConflictBanner conflicts={conflicts} />}

            <CalendarView meetings={meetings} weekStart={weekStart} />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Next meeting countdown */}
            {nextMeeting && countdownStr && (
              <Card>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-soft)" }}>
                        <Timer size={18} style={{ color: "var(--color-accent)" }} />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Next meeting</p>
                        <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{nextMeeting.title}</p>
                        <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                          {new Date(nextMeeting.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" - "}
                          {new Date(nextMeeting.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {nextMeeting.attendeeCount > 0 && (
                            <span className="ml-2">
                              <Users size={10} className="inline mr-0.5" />
                              {nextMeeting.attendeeCount}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-[20px] font-bold" style={{ color: "var(--color-accent)" }}>{countdownStr}</p>
                      {nextMeeting.meetingLink && (
                        <a href={nextMeeting.meetingLink} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-2 text-[12px] font-medium" style={{ background: "var(--color-accent)", color: "white" }}>
                          Join
                        </a>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}

            {conflicts.length > 0 && <ConflictBanner conflicts={conflicts} />}

            {/* All-day events */}
            {allDayUpcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>All-day ({allDayUpcoming.length})</h2>
                <div className="space-y-1.5">
                  {allDayUpcoming.map((m) => (
                    <Card key={m.id}>
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <Sun size={13} style={{ color: "var(--color-text-muted)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{m.title}</p>
                          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            {new Date(m.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                            {m.attendees.length > 0 && (<span className="ml-2"><Users size={10} className="inline mr-0.5" />{m.attendees.length}</span>)}
                          </p>
                        </div>
                        <Badge variant="info" size="sm">All day</Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Upcoming ({upcoming.length})</h2>
                <div className="space-y-2">
                  {upcoming.map((m) => (
                    <MeetingCard key={m.id} meeting={m} expanded={expandedMeeting === m.id} onToggle={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)} onPrep={() => generatePrep(m.id)} prepDoc={prepDocs[m.id]} prepLoading={prepLoading[m.id]} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Past ({past.length})</h2>
                <div className="space-y-2">
                  {past.map((m) => (
                    <MeetingCard key={m.id} meeting={m} expanded={expandedMeeting === m.id} onToggle={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)} onPrep={() => generatePrep(m.id)} prepDoc={prepDocs[m.id]} prepLoading={prepLoading[m.id]} />
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

function ViewToggle({ view, onChange }: { view: "calendar" | "list"; onChange: (v: "calendar" | "list") => void }) {
  const opts = [
    ["calendar", LayoutGrid, "Calendar"],
    ["list", ListIcon, "List"],
  ] as const;
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
      {opts.map(([v, Icon, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition"
          style={view === v ? { background: "var(--color-accent)", color: "white" } : { color: "var(--color-text-secondary)" }}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

function ConflictBanner({ conflicts }: { conflicts: ConflictInfo[] }) {
  return (
    <div className="space-y-2">
      {conflicts.map((c, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg px-4 py-3" style={{ background: "var(--color-warning-soft)", border: "1px solid var(--color-warning-soft)" }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Scheduling conflict: <strong style={{ color: "var(--color-text-primary)" }}>{c.meetingA}</strong> and <strong style={{ color: "var(--color-text-primary)" }}>{c.meetingB}</strong> overlap by {c.overlapMinutes} minute{c.overlapMinutes !== 1 ? "s" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
