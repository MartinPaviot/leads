/**
 * Small "Beta" tag — set expectations on surfaces that aren't guaranteed
 * fully polished yet. Driven by the central BETA_ROUTES list. Amber, matching
 * the app's warning/championing accent; no emoji per the brand rule.
 */
export function BetaTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide ${className}`}
      style={{ background: "rgba(217,119,6,0.12)", color: "rgb(180,83,9)" }}
    >
      Beta
    </span>
  );
}
