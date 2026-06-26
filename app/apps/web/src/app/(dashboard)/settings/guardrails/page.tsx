import { redirect } from "next/navigation";

/**
 * Settings IA phase 2 — `/settings/guardrails` (the approval-mode page) is
 * superseded by `/settings/autonomy`. The autonomy LEVEL is the canonical
 * control: `resolveEffectiveMode` ignores the stored `agentApprovalMode` whenever
 * an autonomy_config row exists, and the autonomy PUT derives + writes back the
 * mode from the level (CLE-10 §4.3 write-side sync). The approval-mode UI here was
 * therefore a no-op for any tenant that had set a level — retired to remove the
 * misleading control. Kept as a server-side redirect so existing bookmarks, the
 * `/settings/agent` alias, and chat deep links don't 404.
 *
 * NOTE: the `_excluded-ids` sibling (SETTINGS_EXCLUDED_IDS) stays — it is imported
 * by the meetings/proposals page-action boundary tests, not by this page.
 */
export default function GuardrailsSettingsRedirect() {
  redirect("/settings/autonomy");
}
