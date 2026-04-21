/**
 * Deterministic brand-aligned gradient avatar for companies without a
 * retrievable logo. Pure SVG — no network, no state, can never fail.
 *
 * See `lib/logo/gradient.ts` for the colour-ring algorithm and
 * `lib/logo/initials.ts` for the name → initials rules.
 */

import { gradientFor, hslToCss } from "@/lib/logo/gradient";
import { perturbedHash } from "@/lib/logo/hash";
import { initialsFor } from "@/lib/logo/initials";

export interface GeneratedCompanyAvatarProps {
  companyName: string;
  size?: number;
  className?: string;
}

export function GeneratedCompanyAvatar({
  companyName,
  size = 24,
  className = "",
}: GeneratedCompanyAvatarProps) {
  const { stop1, stop2 } = gradientFor(companyName);
  const initials = initialsFor(companyName);
  const fontSize = size <= 20 ? 9 : size <= 28 ? 10 : 11;
  const rx = Math.min(4, size * 0.16);
  // Deterministic gradient ID from the name — avoids hydration mismatches
  // and makes snapshot tests stable.
  const id = `gca-${(perturbedHash(companyName.toLowerCase()) >>> 0).toString(36)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      role="img"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={hslToCss(stop1)} />
          <stop offset="100%" stopColor={hslToCss(stop2)} />
        </linearGradient>
      </defs>
      <rect width={size} height={size} rx={rx} fill={`url(#${id})`} />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="white"
        fontFamily="'Inter', system-ui, sans-serif"
        fontWeight={500}
        fontSize={fontSize}
      >
        {initials}
      </text>
    </svg>
  );
}
