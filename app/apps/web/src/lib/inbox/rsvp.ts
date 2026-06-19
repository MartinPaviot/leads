/**
 * RSVP to an inbound meeting invite (INBOX-CAL04) — the iTIP REPLY half. Pure
 * helpers: map the user's Yes/Maybe/No to a PARTSTAT, the reply subject/body,
 * and the METHOD:REPLY iCalendar the organizer's calendar processes. The send +
 * the (deferred) calendar-write live in the route; this is unit-testable.
 */

import { buildIcs } from "@/lib/integrations/ics";
import type { IcsEvent } from "./parse-ics";

export type RsvpChoice = "yes" | "maybe" | "no";

const PARTSTAT: Record<RsvpChoice, "ACCEPTED" | "TENTATIVE" | "DECLINED"> = {
  yes: "ACCEPTED",
  maybe: "TENTATIVE",
  no: "DECLINED",
};

const LABEL: Record<RsvpChoice, string> = { yes: "Accepted", maybe: "Tentative", no: "Declined" };
const VERB: Record<RsvpChoice, string> = { yes: "accepted", maybe: "tentatively accepted", no: "declined" };

export function isRsvpChoice(v: unknown): v is RsvpChoice {
  return v === "yes" || v === "maybe" || v === "no";
}

export function rsvpPartstat(choice: RsvpChoice): "ACCEPTED" | "TENTATIVE" | "DECLINED" {
  return PARTSTAT[choice];
}

export function rsvpSubject(choice: RsvpChoice, summary: string | null): string {
  return `${LABEL[choice]}: ${summary || "your invitation"}`;
}

export function rsvpBody(choice: RsvpChoice, summary: string | null, responderName?: string | null): string {
  const subject = summary ? `"${summary}"` : "your invitation";
  const who = responderName?.trim();
  return who ? `${who} has ${VERB[choice]} ${subject}.` : `I have ${VERB[choice]} ${subject}.`;
}

export interface ReplyIcsInput {
  event: IcsEvent;
  responderEmail: string;
  responderName?: string | null;
  choice: RsvpChoice;
  /** Defaults to `now` for DTSTAMP / start fallbacks; injectable for tests. */
  now?: Date;
}

/**
 * Build the METHOD:REPLY iCalendar for an RSVP. Returns null when the invite
 * lacks the organizer + UID needed to address a valid reply.
 */
export function buildReplyIcs({ event, responderEmail, responderName, choice, now }: ReplyIcsInput): string | null {
  if (!event.organizer || !event.uid) return null;
  const fallback = now ?? new Date();
  return buildIcs({
    uid: event.uid,
    start: event.start ?? fallback,
    end: event.end ?? event.start ?? fallback,
    summary: event.summary || "Invitation",
    organizer: { email: event.organizer },
    attendees: [{ email: responderEmail, name: responderName ?? undefined }],
    method: "REPLY",
    attendeePartstat: PARTSTAT[choice],
  });
}
