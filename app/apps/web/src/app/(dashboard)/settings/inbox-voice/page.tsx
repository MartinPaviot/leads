import { redirect } from "next/navigation";

/**
 * Settings IA voice merge — the inbox "Writing voice" page (tone + extra guidance
 * + pre-draft-on-open) is folded into the canonical Voice & Writing surface
 * (/settings/writing-style), which already owns the tone record and now carries
 * the guidance + auto-draft toggle. Kept as a server-side redirect so any deep
 * link / bookmark doesn't 404. The underlying APIs (/api/inbox/voice,
 * /api/inbox/auto-draft) are unchanged — only the UI consolidated.
 */
export default function InboxVoiceRedirect() {
  redirect("/settings/writing-style");
}
