/**
 * Insert a booked meeting's join link into a reply draft (INBOX-G10).
 *
 * When a user books a meeting from the conversation pane, the sovereign visio
 * join link should land in the reply they're writing — without retyping it.
 * Pure + idempotent: if the URL is already in the body it is left untouched, so
 * re-booking or re-rendering never duplicates the line.
 */
export function injectMeetingLink(body: string, joinUrl: string): string {
  const url = (joinUrl || "").trim();
  if (!url) return body || "";
  if ((body || "").includes(url)) return body || ""; // already present — idempotent
  const line = `Join the meeting: ${url}`;
  const trimmed = (body || "").replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n\n${line}\n` : `${line}\n`;
}
