import { redirect } from "next/navigation";

/**
 * Settings IA — per-mailbox identity (display name / signature / voice override)
 * is folded into Mail & Calendar, where the mailboxes are connected: it now
 * renders as a "Mailbox identity" section below the accounts. Kept as a
 * server-side redirect so deep links don't 404. The /api/inbox/mailbox-identity
 * store is unchanged — UI-only consolidation.
 */
export default function MailboxIdentityRedirect() {
  redirect("/settings/mail-calendar");
}
