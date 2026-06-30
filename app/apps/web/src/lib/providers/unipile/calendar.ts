/**
 * Unipile client — the Calendars tag (calendars + events CRUD). Provided for
 * client completeness; NOT wired into Elevay's product, which books via its own
 * calendar stack (Infomaniak CalDAV / Microsoft / Google). Available if a tenant
 * connects a calendar through Unipile.
 */
import { unipileFetch, type UnipileConfig, type UnipileList } from "./http";

/** GET /calendars — list the account's calendars. */
export function listCalendars(cfg: UnipileConfig, accountId: string, opts: { limit?: number; cursor?: string; offset?: number } = {}): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: accountId });
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  if (opts.offset != null) q.set("offset", String(opts.offset));
  return unipileFetch(cfg, "GET", `/calendars?${q.toString()}`);
}

/** GET /calendars/{id}. */
export function getCalendar(cfg: UnipileConfig, calendarId: string, accountId: string): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "GET", `/calendars/${encodeURIComponent(calendarId)}?account_id=${encodeURIComponent(accountId)}`);
}

export interface CalendarEventListOptions {
  accountId: string;
  start?: string;
  end?: string;
  title?: string;
  description?: string;
  location?: string;
  attendees?: string;
  expandRecurring?: boolean;
  updatedAfter?: string;
  updatedBefore?: string;
  limit?: number;
  cursor?: string;
  offset?: number;
}

/** GET /calendars/{id}/events — list events in a calendar. */
export function listCalendarEvents(cfg: UnipileConfig, calendarId: string, opts: CalendarEventListOptions): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: opts.accountId });
  if (opts.start) q.set("start", opts.start);
  if (opts.end) q.set("end", opts.end);
  if (opts.title) q.set("title", opts.title);
  if (opts.description) q.set("description", opts.description);
  if (opts.location) q.set("location", opts.location);
  if (opts.attendees) q.set("attendees", opts.attendees);
  if (opts.expandRecurring != null) q.set("expand_recurring", String(opts.expandRecurring));
  if (opts.updatedAfter) q.set("updated_after", opts.updatedAfter);
  if (opts.updatedBefore) q.set("updated_before", opts.updatedBefore);
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  if (opts.offset != null) q.set("offset", String(opts.offset));
  return unipileFetch(cfg, "GET", `/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`);
}

/** GET /calendars/{id}/events/{eid}. */
export function getCalendarEvent(cfg: UnipileConfig, calendarId: string, eventId: string, accountId: string): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "GET", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?account_id=${encodeURIComponent(accountId)}`);
}

export interface CalendarEventInput {
  title: string;
  start: unknown;
  end: unknown;
  attendees: Array<Record<string, unknown>>;
  body?: string;
  location?: string;
  conference?: Record<string, unknown>;
  isAttendeesListHidden?: boolean;
  recurrence?: string[];
  color?: string;
  notify?: boolean;
  guestsCanModify?: boolean;
}

function eventBody(input: Partial<CalendarEventInput>): Record<string, unknown> {
  return {
    title: input.title,
    start: input.start,
    end: input.end,
    attendees: input.attendees,
    body: input.body,
    location: input.location,
    conference: input.conference,
    is_attendees_list_hidden: input.isAttendeesListHidden,
    recurrence: input.recurrence,
    color: input.color,
    notify: input.notify,
    guests_can_modify: input.guestsCanModify,
  };
}

/** POST /calendars/{id}/events — create an event. */
export function createCalendarEvent(cfg: UnipileConfig, calendarId: string, accountId: string, input: CalendarEventInput): Promise<{ object?: string }> {
  return unipileFetch(cfg, "POST", `/calendars/${encodeURIComponent(calendarId)}/events?account_id=${encodeURIComponent(accountId)}`, eventBody(input));
}

/** PATCH /calendars/{id}/events/{eid} — update an event (partial). */
export function updateCalendarEvent(cfg: UnipileConfig, calendarId: string, eventId: string, accountId: string, patch: Partial<CalendarEventInput>): Promise<{ object?: string }> {
  return unipileFetch(cfg, "PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?account_id=${encodeURIComponent(accountId)}`, eventBody(patch));
}

/** DELETE /calendars/{id}/events/{eid}. */
export function deleteCalendarEvent(cfg: UnipileConfig, calendarId: string, eventId: string, accountId: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?account_id=${encodeURIComponent(accountId)}`);
}
