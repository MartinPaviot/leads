/**
 * The Orion brand mark (rounded-square constellation logo SVG from /public).
 *
 * Use it ONLY where Orion itself is speaking or acting: assistant message
 * labels, the chat launcher/header/empty states, agent provenance. Inputs,
 * suggestion pills and other generic UI keep neutral lucide icons — the
 * mark stays meaningful because it is scarce.
 *
 * Decorative by default (empty alt + aria-hidden): it always sits next to
 * a visible "Orion" text or inside a control that carries its own label.
 */
export function ElevayMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/orion-icon.svg"
      alt=""
      aria-hidden="true"
      className={`shrink-0 ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
