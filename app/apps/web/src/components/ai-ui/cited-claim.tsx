"use client";

import { CitedText } from "@/components/coaching/cited-text";
import { SourceLink, type SourceKind } from "./source-link";

/**
 * AI-UI primitive : a single AI-produced statement with its sources.
 *
 * Sprint-2 (audit) — the rule is "no claim without a citation". This
 * component bundles the claim text (with `[mm:ss]` chips parsed by
 * `<CitedText>`) AND the underlying source links (`<SourceLink>`)
 * into one renderable unit. Use anywhere the AI quotes / paraphrases
 * existing CRM content (deal coach, churn risk, account summary,
 * health score reasons).
 *
 * `text` is preserved verbatim — including LLM-emitted `[mm:ss]`
 * markers that the renderer turns into clickable seek chips. The
 * `sources` array adds attribution chips (meeting / email / call /
 * note / external URL).
 */
export interface CitedClaimSource {
  kind: SourceKind;
  label: string;
  href: string;
  quote?: string;
}

export interface CitedClaimProps {
  /** Claim text — usually 1-3 sentences. May contain `[mm:ss]`. */
  text: string;
  /** Meeting whose recording the `[mm:ss]` markers seek into. */
  meetingId?: string | null;
  /** Source attribution chips shown after the claim. */
  sources?: CitedClaimSource[];
}

export function CitedClaim({ text, meetingId, sources = [] }: CitedClaimProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
        <CitedText text={text} meetingId={meetingId ?? null} />
      </p>
      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {sources.map((s, i) => (
            <SourceLink key={i} kind={s.kind} label={s.label} href={s.href} quote={s.quote} />
          ))}
        </div>
      )}
    </div>
  );
}
