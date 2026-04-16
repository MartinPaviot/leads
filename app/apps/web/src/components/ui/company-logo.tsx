"use client";

import { useState } from "react";

interface CompanyLogoProps {
  domain: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Company logo with Clearbit → Google Favicons → Initials fallback cascade.
 * Renders a square image with rounded corners at the specified size.
 *
 * A17 — when both external sources fail (or no domain is known) we paint
 * a colored circle with the company's first two initials. The colour is
 * deterministic from the seed (domain when present, otherwise name) so
 * the same company always renders the same swatch — a tiny but real
 * recognition aid when scanning long lists.
 */

// 8 muted, accessible swatches from the existing palette space — picked
// to remain legible against white text and to harmonise with the app
// chrome rather than scream at the user.
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
  // FNV-1a, 32-bit. Cheap, no allocations, well-distributed across
  // short ASCII strings.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned then mod into the palette.
  return INITIAL_COLORS[(h >>> 0) % INITIAL_COLORS.length];
}

function initialsFor(name: string): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyLogo({ domain, name, size = 24, className = "" }: CompanyLogoProps) {
  const [fallbackLevel, setFallbackLevel] = useState(0);
  // 0 = Clearbit, 1 = Google Favicons, 2 = Initials

  const initials = initialsFor(name);
  const seed = (domain || name || "").toLowerCase();
  const bg = colorForSeed(seed);
  // Initials use a slightly smaller font on tiny avatars so the second
  // letter doesn't crash into the edge.
  const fontSize = size <= 20 ? 9 : size <= 28 ? 10 : 11;

  if (!domain || fallbackLevel >= 2) {
    return (
      <div
        className={`flex items-center justify-center rounded font-semibold text-white shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          background: bg,
          fontSize,
        }}
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
      {/* Coloured initials sit beneath the <img> so they show through
          while the image is still loading — and become the final state
          after the second onError bumps the fallback level. */}
      <div
        className="flex items-center justify-center rounded font-semibold text-white"
        style={{
          width: size,
          height: size,
          background: bg,
          fontSize,
        }}
        aria-hidden="true"
      >
        {initials}
      </div>
    </div>
  );
}

// Exported for tests + any consumer that wants the same swatch as the
// avatar (e.g. coloured tag chips that match the company badge).
export const __INITIAL_COLORS = INITIAL_COLORS;
export { colorForSeed as __colorForSeed, initialsFor as __initialsFor };
