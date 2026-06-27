"use client";

/**
 * Prospect brief in the reading pane (INBOX-G01). Reuses the Call Mode brief
 * ENDPOINT as-is (Apollo career match + the company's own homepage text + one
 * grounded, fail-closed LLM pass, jsonb-cached) — the expensive work is
 * untouched. Unlike Call Mode (where you're about to dial, so it auto-builds),
 * here it's ON DEMAND: fetched only when the user expands it, so opening a
 * conversation never spends an Apollo/LLM credit. English chrome; the brief
 * text itself is whatever the builder produced. Fail-soft.
 */

import { useState } from "react";
import { ChevronRight, ChevronDown, Loader2, User, Globe, ExternalLink } from "lucide-react";
import {
  careerEntryLabel,
  profileUrl,
  recentActivityUrl,
  type ProspectBriefPayload,
} from "@/lib/call-mode/prospect-brief-core";
import { useT } from "@/lib/i18n/locale";

function HostLabel({ url }: { url: string | null }) {
  let host: string | null = null;
  if (url) {
    try {
      host = new URL(url).host.replace(/^www\./, "");
    } catch {
      host = null;
    }
  }
  return host ? <> · {host}</> : null;
}

export function ProspectBriefSection({ contactId }: { contactId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ProspectBriefPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !fetched) {
      setLoading(true);
      try {
        const r = await fetch(`/api/call-mode/prospect-brief?contactId=${encodeURIComponent(contactId)}`);
        setData(r.ok ? ((await r.json()) as ProspectBriefPayload) : null);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
        setFetched(true);
      }
    }
  }

  const person = data?.person ?? null;
  const company = data?.company ?? null;
  const careerLines = (person?.career ?? []).slice(0, 3).map(careerEntryLabel);
  const companyText = company?.summary ?? company?.metaDescription ?? null;
  const companyIsMetaOnly = !company?.summary && Boolean(company?.metaDescription);
  const liProfile = profileUrl(person?.linkedinUrl);
  const liPosts = recentActivityUrl(person?.linkedinUrl);
  const hasPerson = Boolean(person?.background) || careerLines.length > 0 || Boolean(person?.headline);

  return (
    <div className="mb-3 overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
      >
        {open ? (
          <ChevronDown size={14} style={{ color: "var(--color-text-tertiary)" }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--color-text-tertiary)" }} />
        )}
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          {t("inbox.brief.title")}
        </span>
        {!open && !fetched && (
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            {t("inbox.brief.caption")}
          </span>
        )}
        {loading && <Loader2 size={12} className="ml-auto animate-spin" style={{ color: "var(--color-text-tertiary)" }} />}
      </button>

      {open && (loading || fetched) && (
        <div className="space-y-2.5 border-t px-3 py-2.5" style={{ borderColor: "var(--color-border-default)" }}>
          {loading ? (
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              {t("inbox.brief.building")}
            </p>
          ) : (
            <>
              {/* Person */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                    <User size={12} /> {t("inbox.brief.background")}
                  </span>
                  <div className="flex items-center gap-2">
                    {liProfile && (
                      <a href={liProfile} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-accent)" }}>
                        <ExternalLink size={10} /> {t("inbox.brief.profile")}
                      </a>
                    )}
                    {liPosts && (
                      <a href={liPosts} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-accent)" }}>
                        <ExternalLink size={10} /> {t("inbox.brief.recentPosts")}
                      </a>
                    )}
                  </div>
                </div>
                {hasPerson ? (
                  <div className="mt-1 space-y-1">
                    {person?.background ? (
                      <p className="text-[12px] leading-snug" style={{ color: "var(--color-text-primary)" }}>{person.background}</p>
                    ) : person?.headline ? (
                      <p className="text-[12px] italic leading-snug" style={{ color: "var(--color-text-secondary)" }}>{person.headline}</p>
                    ) : null}
                    {careerLines.length > 0 && (
                      <ul className="space-y-0.5">
                        {careerLines.map((l, i) => (
                          <li key={i} className="text-[11px] leading-snug" style={{ color: "var(--color-text-tertiary)" }}>{l}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{t("inbox.brief.noCareer")}</p>
                )}
              </div>

              {/* Company */}
              <div className="border-t pt-2.5" style={{ borderColor: "var(--color-border-default)" }}>
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                  <Globe size={12} /> {t("inbox.brief.companyHeading")}
                </span>
                {companyText ? (
                  <div className="mt-1">
                    <p className="text-[12px] leading-snug" style={{ color: "var(--color-text-primary)" }}>{companyText}</p>
                    <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      {companyIsMetaOnly ? t("inbox.brief.metaDescription") : t("inbox.brief.websiteSummary")}
                      <HostLabel url={company?.url ?? null} />
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {company?.url ? t("inbox.brief.siteEmpty") : t("inbox.brief.noWebsite")}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
