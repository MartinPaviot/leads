import { redirect } from "next/navigation";

/**
 * WS-1 — `/settings/agent` is superseded by `/settings/guardrails`,
 * which consolidates approval mode + LLM budget + sending infra into
 * one page. Kept as a server-side redirect so existing bookmarks and
 * deep links from chat suggestions don't 404 during the transition.
 *
 * The full Guardrails UI ships in WS-1 PR E. Until then, the redirect
 * lands on `/settings/guardrails`; Next.js renders a 404 gracefully if
 * the target page doesn't yet exist, which is preferable to showing a
 * stale 2-option radio tied to the legacy enum.
 */
export default function AgentSettingsRedirect() {
  redirect("/settings/guardrails");
}
