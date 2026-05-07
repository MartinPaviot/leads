"use client";

import Link from "next/link";
import { ExternalLink, FileText, Mail, MessageSquare, Phone } from "lucide-react";

/**
 * AI-UI primitive : compact attribution chip pointing at the source
 * material backing an AI claim.
 *
 * Sprint-2 (audit) — every fact the AI surfaces should carry one of
 * these. Concrete forms in the wild :
 *   - "Sarah said …" → SourceLink kind="meeting" → /meetings/<id>?t=<sec>
 *   - "from the email of March 12" → kind="email" → /contacts/<id>#email-<id>
 *   - "their hiring page lists …" → kind="external" → external https URL
 *
 * Visually small and unobtrusive — the goal is to make citations cheap
 * to glance at, not heavy banners that crowd the answer.
 */
export type SourceKind = "meeting" | "email" | "call" | "note" | "external";

const ICON_FOR: Record<SourceKind, typeof Mail> = {
  meeting: MessageSquare,
  email: Mail,
  call: Phone,
  note: FileText,
  external: ExternalLink,
};

export interface SourceLinkProps {
  kind: SourceKind;
  /** Short label shown in the chip — e.g. "Meeting · Mar 12" or "LinkedIn post". */
  label: string;
  /** Internal route (Next.js `<Link>`) OR external URL. The component
   *  detects http(s) and opens externally with rel=noopener. */
  href: string;
  /** Optional verbatim quote shown on hover — adds the trust layer
   *  without extra DOM clutter. */
  quote?: string;
}

export function SourceLink({ kind, label, href, quote }: SourceLinkProps) {
  const Icon = ICON_FOR[kind];
  const isExternal = /^https?:\/\//i.test(href);
  const tooltip = quote ? `${label} — "${quote}"` : label;

  const chip = (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium no-underline"
      style={{
        background: "var(--color-bg-hover)",
        color: "var(--color-text-secondary)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <Icon size={9} aria-hidden />
      <span className="max-w-[18ch] truncate">{label}</span>
    </span>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {chip}
      </a>
    );
  }
  return <Link href={href}>{chip}</Link>;
}
