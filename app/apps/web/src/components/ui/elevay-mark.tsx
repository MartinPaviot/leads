/**
 * The Elevay brand mark (rounded-square logo SVG from /public).
 *
 * Use it ONLY where Elevay itself is speaking or acting: assistant message
 * labels, the chat launcher/header/empty states, agent provenance. Inputs,
 * suggestion pills and other generic UI keep neutral lucide icons — the
 * mark stays meaningful because it is scarce.
 *
 * Decorative by default (empty alt + aria-hidden): it always sits next to
 * a visible "Elevay" text or inside a control that carries its own label.
 */
export function ElevayMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo-Elevay.svg"
      alt=""
      aria-hidden="true"
      className={`shrink-0 ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
