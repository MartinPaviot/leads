import { extractEmailFromHeader } from "@/lib/capture/email-capture";

export interface SyncedEmailAttribution {
  direction: "inbound" | "outbound";
  /** The raw From header (may be "Name <addr>"). */
  from: string;
  /** The raw To headers (may be "Name <addr>"). */
  to: string[];
}

/**
 * The counterparty (prospect) email address a synced Gmail message should be
 * attributed to — the inbound sender, or the first outbound recipient. Returns
 * a normalized lowercase address, or null when nothing is parseable (the caller
 * then leaves the activity unattributed rather than guessing).
 *
 * Pure + unit-tested. Mirrors the attribution the authed `/api/email/sync` path
 * already does; the cron path used to skip it and orphaned every synced email
 * at entityId="unknown".
 */
export function counterpartyEmail(email: SyncedEmailAttribution): string | null {
  const raw = email.direction === "inbound" ? email.from : email.to[0] ?? "";
  const addr = extractEmailFromHeader(raw || "");
  return addr || null;
}
