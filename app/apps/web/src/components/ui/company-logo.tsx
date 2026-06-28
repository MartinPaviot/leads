"use client";

import { useState, useEffect, useRef } from "react";
import { useFlag } from "@/components/flags-provider";
import { GeneratedCompanyAvatar } from "@/components/ui/generated-company-avatar";
import {
  enqueueLogoResolve,
  type CoalescerResult,
} from "@/lib/logo/client-coalescer";

interface CompanyLogoProps {
  domain: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
  logoUrl?: string | null;
}

// ── V1 internals (kept for flag-off path, removed in cleanup cycle) ──

const INITIAL_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#14b8a6", // teal
] as const;

function colorForSeed(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return INITIAL_COLORS[(h >>> 0) % INITIAL_COLORS.length];
}

function initialsFor(name: string): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ── V1 component (flag off) ──

export function CompanyLogoV1({
  domain,
  name,
  size = 24,
  className = "",
}: Omit<CompanyLogoProps, "logoUrl">) {
  const [fallbackLevel, setFallbackLevel] = useState(0);

  const initials = initialsFor(name);
  const seed = (domain || name || "").toLowerCase();
  const bg = colorForSeed(seed);
  const fontSize = size <= 20 ? 9 : size <= 28 ? 10 : 11;

  if (!domain || fallbackLevel >= 2) {
    return (
      <div
        className={`flex items-center justify-center rounded font-semibold text-white shrink-0 ${className}`}
        style={{ width: size, height: size, background: bg, fontSize }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }

  const src =
    fallbackLevel === 0
      ? `https://logo.clearbit.com/${domain}`
      : `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        className="absolute inset-0 rounded object-contain"
        style={{ width: size, height: size, background: "var(--color-bg-hover)" }}
        onError={() => setFallbackLevel((prev) => prev + 1)}
      />
      <div
        className="flex items-center justify-center rounded font-semibold text-white"
        style={{ width: size, height: size, background: bg, fontSize }}
        aria-hidden="true"
      >
        {initials}
      </div>
    </div>
  );
}

// ── V2 component (flag on) ──

function CompanyLogoV2({
  domain,
  name,
  size = 24,
  className = "",
  logoUrl,
}: CompanyLogoProps) {
  const [resolved, setResolved] = useState<CoalescerResult | null>(null);
  const [imgError, setImgError] = useState(false);
  const [directError, setDirectError] = useState(false);
  const mountedRef = useRef(true);

  // A logo URL the page already holds (e.g. `companies.properties.logo_url`
  // from the Apollo backfill) is authoritative — render it immediately and
  // skip the async resolver. This kills the round-trip AND avoids the resolver
  // serving a stale lower-tier favicon from cache over a known real logo.
  const directUrl =
    typeof logoUrl === "string" && /^https?:\/\//.test(logoUrl) ? logoUrl : null;
  const useDirect = !!directUrl && !directError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Only hit the resolver when there's no usable direct URL (or it errored)
    // and we have a domain to resolve.
    if (!domain || useDirect) return;

    const { promise, cancel } = enqueueLogoResolve({
      domain,
      companyName: name,
      existingLogoUrl: logoUrl,
    });

    promise
      .then((r) => {
        if (mountedRef.current) setResolved(r);
      })
      .catch(() => {
        // Coalescer failed — stay on generated avatar
      });

    return cancel;
  }, [domain, name, logoUrl, useDirect]);

  const resolvedUrl = resolved?.url;
  const showResolvedImg =
    !useDirect && resolvedUrl && !imgError && resolved.tier <= 5;
  const imgSrc = useDirect ? directUrl : showResolvedImg ? resolvedUrl : null;

  return (
    // `isolate` keeps the logo img's z-10 inside this component's own stacking
    // context — otherwise it leaks into the page and renders ON TOP of the
    // sticky table header when the list scrolls.
    //
    // The generated avatar and the real logo are mutually exclusive — never
    // stacked. Stacking them let a transparent or non-square logo (object-contain
    // letterboxing) reveal the initials behind it, so a company showed its logo
    // AND its initials at once. We render the avatar only until the image is
    // ready, then swap to the image on an opaque tile so any letterbox margin is
    // a clean surface, not the old initials. On image error we fall back to the
    // avatar again.
    <div className={`relative isolate shrink-0 ${className}`} style={{ width: size, height: size }}>
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="absolute inset-0 rounded object-contain z-10"
          style={{ width: size, height: size, background: "var(--color-bg-card)" }}
          onError={() => (useDirect ? setDirectError(true) : setImgError(true))}
        />
      ) : (
        <GeneratedCompanyAvatar companyName={name} size={size} />
      )}
    </div>
  );
}

// ── Public API ──

export function CompanyLogo(props: CompanyLogoProps) {
  const v2 = useFlag("logo.v2.cascade");
  if (v2) return <CompanyLogoV2 {...props} />;
  return <CompanyLogoV1 {...props} />;
}

export const __INITIAL_COLORS = INITIAL_COLORS;
export { colorForSeed as __colorForSeed, initialsFor as __initialsFor };
