import { redirect } from "next/navigation";

/**
 * Settings IA — the inbox notification preferences (per-event opt-in + digest
 * cadence + quiet hours) fold into the single Notifications page, which now
 * carries an "Inbox" section alongside the general channel matrix. Kept as a
 * server-side redirect so deep links don't 404. The /api/inbox/notifications
 * store is unchanged (shouldNotify still gates delivery) — UI-only consolidation.
 */
export default function InboxNotificationsRedirect() {
  redirect("/settings/notifications");
}
