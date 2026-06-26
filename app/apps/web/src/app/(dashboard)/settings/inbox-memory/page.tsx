import { redirect } from "next/navigation";

/**
 * Settings IA voice merge — the inbox "AI memory & standing instructions" page
 * (standing instructions + company line) is folded into the canonical Voice &
 * Writing surface (/settings/writing-style). Sign-off is no longer set here: the
 * writing-style "Sign off" field is the single source, wired into compose/reply
 * and compose/draft. Kept as a server-side redirect so deep links don't 404.
 * The /api/inbox/memory store is unchanged (writing-style round-trips it intact,
 * preserving signOffName/keyColleagues) — UI-only consolidation.
 */
export default function InboxMemoryRedirect() {
  redirect("/settings/writing-style");
}
