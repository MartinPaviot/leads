import { redirect } from "next/navigation";

/**
 * `/settings/agent` is a legacy alias. Autonomy/guardrails now live on
 * `/settings/autonomy` (the autonomy LEVEL is the canonical control; the old
 * `/settings/guardrails` approval-mode page was itself retired to a redirect in
 * the Settings IA reorg). Point straight at the canonical page so an old bookmark
 * or chat deep link resolves in ONE hop, not agent → guardrails → autonomy.
 */
export default function AgentSettingsRedirect() {
  redirect("/settings/autonomy");
}
