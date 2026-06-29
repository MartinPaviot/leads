import type { CSSProperties } from "react";

/**
 * ProviderLogo — a single source of truth for third-party brand marks shown
 * next to a provider's name across Settings (sub-processors, sending channels,
 * billing, notifications…).
 *
 * These are the REAL brand logos, served as static assets from
 * `public/providers/`: official full-colour SVGs where the brand ships one
 * (Google, Microsoft, LinkedIn, Slack, Twilio, Neon, Deepgram) and the brand's
 * real square app-icon (favicon) for the rest (Stripe, Outlook, Anthropic,
 * Resend, Instantly, Recall.ai). No invented monograms.
 *
 * Usage: <ProviderLogo name="instantly" size={16} />
 */

export type ProviderName =
  | "instantly"
  | "linkedin"
  | "google"
  | "gmail"
  | "microsoft"
  | "outlook"
  | "twilio"
  | "deepgram"
  | "stripe"
  | "anthropic"
  | "neon"
  | "resend"
  | "recall"
  | "slack";

/** name → asset filename under /public/providers. */
const ASSET: Record<ProviderName, string> = {
  google: "google.svg",
  gmail: "gmail.svg",
  microsoft: "microsoft.svg",
  outlook: "outlook.png",
  linkedin: "linkedin.svg",
  slack: "slack.svg",
  twilio: "twilio.svg",
  neon: "neon.svg",
  deepgram: "deepgram.svg",
  stripe: "stripe.png",
  anthropic: "anthropic.png",
  resend: "resend.png",
  instantly: "instantly.png",
  recall: "recall.png",
};

export function ProviderLogo({
  name,
  size = 16,
  className,
  style,
  title,
}: {
  name: ProviderName | string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; defaults to "<name> logo". */
  title?: string;
}) {
  const file = ASSET[name as ProviderName];

  // Unknown provider: render a neutral placeholder square rather than an
  // invented monogram, so an unmapped name never ships a fake "logo".
  if (!file) {
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: 4,
          background: "var(--color-bg-hover)",
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static brand
    // mark; next/image adds no value (no remote optimisation, fixed size) and
    // would force width/height plumbing for a 16px icon.
    <img
      src={`/providers/${file}`}
      width={size}
      height={size}
      alt={title ?? `${name} logo`}
      className={className}
      style={{ display: "inline-block", objectFit: "contain", flexShrink: 0, ...style }}
      loading="lazy"
      decoding="async"
    />
  );
}
