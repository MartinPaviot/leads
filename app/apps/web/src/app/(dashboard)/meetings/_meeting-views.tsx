"use client";

/**
 * Shared Meetings views: the list card and the week calendar. Kept in one file
 * so the live page and the throwaway preview route render the exact same UI.
 */

import { ChevronDown, ChevronRight, FileText, Users, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { CompanyLogo } from "@/components/ui/company-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/chat-markdown";

export interface MatchedContact {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
}

export interface Meeting {
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
  isAllDay?: boolean;
  organizer?: { email: string; displayName: string | null } | null;
  isRecurring?: boolean;
  hasTranscript: boolean;
  hasNotes: boolean;
  notes: { summary: string } | null;
  recordingUrl: string | null;
  activityId: string | null;
  account: { id: string; name: string; domain: string | null } | null;
  matchedContacts: MatchedContact[];
}

/* ───────────────────────── List card ───────────────────────── */

export function MeetingCard({
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
  const knownEmails = new Set(m.matchedContacts.map((c) => c.email?.toLowerCase()).filter(Boolean));
  const otherAttendees = m.attendees.filter((a) => !knownEmails.has(a.email?.toLowerCase()));

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
              <div className="mt-1 ml-5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {m.account && (
                  <Link
                    href={`/accounts/${m.account.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="-ml-0.5 inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition hover:bg-[var(--color-bg-hover)]"
                    title={`Open ${m.account.name}`}
                  >
                    <CompanyLogo domain={m.account.domain} name={m.account.name} size={16} />
                    <span className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>{m.account.name}</span>
                  </Link>
                )}
                {m.account && <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>·</span>}
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
                  className="rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                  Join
                </a>
              )}
              {!m.isPast && (
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onPrep(); }} loading={prepLoading}>
                  <FileText size={11} /> Prep
                </Button>
              )}
            </div>
          </div>
        </button>

        <Link href={`/meetings/${m.id}`} className="mt-1 ml-5 inline-flex items-center gap-1 text-[11px] font-medium hover:underline" style={{ color: "var(--color-accent)" }}>
          View details <ChevronRight size={11} />
        </Link>

        {expanded && (
          <div className="mt-3 ml-5 space-y-3" style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: "12px" }}>
            {m.matchedContacts.length > 0 && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>In your CRM</span>
                <div className="mt-1 space-y-1">
                  {m.matchedContacts.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-[12px]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-success)" }} />
                      <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                      {c.title && <span className="truncate" style={{ color: "var(--color-text-tertiary)" }}>· {c.title}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherAttendees.length > 0 && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  {m.matchedContacts.length > 0 ? "Other attendees" : "Attendees"}
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {otherAttendees.map((a) => (
                    <span key={a.email} className="text-[11px] rounded-full px-2 py-0.5"
                      style={{ background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}>
                      {a.displayName || a.email}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {m.notes?.summary && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>AI Notes</span>
                <div className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  <ChatMarkdown>{m.notes.summary}</ChatMarkdown>
                </div>
              </div>
            )}

            {prepDoc && (
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Meeting Prep</span>
                <div className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  <ChatMarkdown>{prepDoc}</ChatMarkdown>
                </div>
              </div>
            )}

            {(m.location || m.meetingLink) && (
              <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {m.location && !/^https?:\/\//.test(m.location) && <span>{m.location}</span>}
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

/* ───────────────────────── Week calendar ───────────────────────── */

const DAY_MS = 86_400_000;

/** Monday-start week containing `d`, at local midnight. */
export function weekStartOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

export function weekLabel(weekStart: Date): string {
  const end = new Date(weekStart.getTime() + 6 * DAY_MS);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const left = weekStart.toLocaleDateString([], { month: "short", day: "numeric" });
  const right = end.toLocaleDateString([], sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${left} – ${right}, ${end.getFullYear()}`;
}

export function CalendarView({ meetings, weekStart }: { meetings: Meeting[]; weekStart: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byDay = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const d = new Date(m.startTime);
    d.setHours(0, 0, 0, 0);
    const key = d.toDateString();
    const arr = byDay.get(key);
    if (arr) arr.push(m);
    else byDay.set(key, [m]);
  }
  for (const arr of byDay.values()) {
    arr.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  return (
    // overflow-x-auto + a modest min-width: the 7-day grid fits most laptop
    // widths without a horizontal scrollbar, and only scrolls (never stretches
    // the page) on genuinely narrow windows.
    <div className="max-w-full overflow-x-auto pb-2">
      <div className="grid min-w-[700px] grid-cols-7 gap-2">
        {days.map((day) => {
          const dayMeetings = byDay.get(day.toDateString()) ?? [];
          const isToday = day.getTime() === today.getTime();
          const isPastDay = day.getTime() < today.getTime();
          return (
            <div key={day.toDateString()} className="min-w-0">
              {/* Day header */}
              <div
                className="mb-2 rounded-lg px-2 py-1.5 text-center"
                style={{
                  background: isToday ? "var(--color-accent-soft)" : "transparent",
                  border: `1px solid ${isToday ? "var(--color-accent)" : "var(--color-border-default)"}`,
                }}
              >
                <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: isToday ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>
                  {day.toLocaleDateString([], { weekday: "short" })}
                </div>
                <div className="text-[15px] font-semibold" style={{ color: isToday ? "var(--color-accent)" : "var(--color-text-primary)" }}>
                  {day.getDate()}
                </div>
              </div>

              {/* Meetings */}
              <div className="space-y-1.5" style={{ opacity: isPastDay && !isToday ? 0.65 : 1 }}>
                {dayMeetings.length === 0 ? (
                  <div className="rounded-md border border-dashed py-3 text-center text-[10px]" style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-placeholder)" }}>
                    —
                  </div>
                ) : (
                  dayMeetings.map((m) => <CalendarChip key={m.id} meeting={m} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarChip({ meeting: m }: { meeting: Meeting }) {
  const start = new Date(m.startTime);
  const timeStr = m.isAllDay ? "All day" : start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // Accent rail by state: live/upcoming get the brand accent, past goes neutral.
  const rail = m.isPast ? "var(--color-border-strong)" : "var(--color-accent)";
  return (
    <Link
      href={`/meetings/${m.id}`}
      className="block rounded-md border p-2 transition hover:shadow-[var(--shadow-card)]"
      style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border-default)", borderLeft: `2px solid ${rail}` }}
      title={m.title}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>{timeStr}</span>
        {(m.hasNotes || m.hasTranscript) && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} title="Captured" />}
      </div>
      <div className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-tight" style={{ color: "var(--color-text-primary)" }}>{m.title}</div>
      {m.account && (
        <div className="mt-1 flex items-center gap-1">
          <CompanyLogo domain={m.account.domain} name={m.account.name} size={12} />
          <span className="truncate text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{m.account.name}</span>
        </div>
      )}
    </Link>
  );
}
