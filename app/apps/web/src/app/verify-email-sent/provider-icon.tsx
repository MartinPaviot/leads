import type { ReactNode } from "react";
import type { InboxDeepLink } from "@/lib/emails/inbox-deep-links";

/**
 * Brand glyphs for the webmail deep-link buttons on /verify-email-sent.
 *
 * lucide-react ships no brand icons, so these are inline SVGs — the same
 * approach as the Google / Microsoft logos on the sign-in OAuth buttons.
 * Gmail and Outlook get their real marks because they're the pair surfaced
 * for corporate domains (the common case); the rarer consumer providers
 * reuse one brand-tinted envelope tile so the set stays visually consistent.
 */
type Provider = InboxDeepLink["provider"];

/** A brand-coloured rounded tile with a white envelope — for the rarer providers. */
function MailTile({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="36" height="36" rx="9" fill={color} />
      <rect x="13" y="17" width="22" height="15" rx="2.5" fill="#ffffff" />
      <path
        d="M13.8 19 L24 26 L34.2 19"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICONS: Record<Provider, ReactNode> = {
  gmail: (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z" />
      <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z" />
      <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17" />
      <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8 C4.924,8,3,9.924,3,12.298z" />
      <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8 C43.076,8,45,9.924,45,12.298z" />
    </svg>
  ),
  outlook: (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="36" height="36" rx="8" fill="#0F6CBD" />
      <ellipse cx="24" cy="24" rx="8" ry="9" fill="none" stroke="#ffffff" strokeWidth="4.4" />
    </svg>
  ),
  yahoo: <MailTile color="#6001D2" />,
  icloud: <MailTile color="#3D8EFF" />,
  fastmail: <MailTile color="#0067B9" />,
  proton: <MailTile color="#6D4AFF" />,
};

export function ProviderIcon({ provider }: { provider: Provider }) {
  return <span className="inline-flex shrink-0">{ICONS[provider]}</span>;
}
