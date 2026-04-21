/**
 * Deterministic brand-aligned gradient generator for company avatars.
 *
 * Maps a company name to a two-stop linear gradient on the Elevay
 * brand-colour ring (teal → blue → orange). The ring interpolation
 * keeps every generated gradient on an arc between two adjacent brand
 * anchors — so results never clash with the brand chrome, never produce
 * grey, and always pass WCAG AA contrast for centred white initials.
 *
 * See `docs/specs/logo-rendering-fix-spec.md` §6.3 for rationale and
 * `__tests__/gradient-perceptual.test.ts` for the ΔE oracle that
 * enforces perceptual distinctness across the 100-name corpus.
 */

import { perturbedHash } from "./hash";

export interface Hsl {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface Gradient {
  stop1: Hsl;
  stop2: Hsl;
  /** Which brand anchor this gradient is rooted at (0 teal, 1 blue, 2 orange). */
  anchor: 0 | 1 | 2;
}

// Brand chrome colours converted to HSL. Values derived directly from
// #17C3B2, #2C6BED, #FF7A3D. Kept here rather than in globals.css
// because gradient generation needs H/S/L components independently.
export const BRAND_ANCHORS: readonly Hsl[] = [
  { h: 172, s: 79, l: 43 }, // teal    — #17C3B2
  { h: 221, s: 84, l: 55 }, // blue    — #2C6BED
  { h: 19, s: 100, l: 62 }, // orange  — #FF7A3D
] as const;

/**
 * Interpolate hue along the shorter arc of the colour wheel so that
 * e.g. 350° → 10° crosses 0° rather than taking the long way round.
 */
function lerpHue(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const out = a + t * diff;
  return ((out % 360) + 360) % 360;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpHsl(a: Hsl, b: Hsl, t: number): Hsl {
  return {
    h: lerpHue(a.h, b.h, t),
    s: lerp(a.s, b.s, t),
    l: lerp(a.l, b.l, t),
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Yellow and green hues have disproportionately high luminance because
// the sRGB→luminance formula weights green at 0.7152. A single max-l
// clamp can't guarantee 3:1 white-text contrast across all hues — e.g.
// HSL(60°, 100%, 50%) gives relative luminance ~0.88 → contrast 1.1:1
// with white, while HSL(240°, 100%, 50%) gives lum ~0.07 → contrast
// 13:1. So we compute the safe lightness ceiling per hue.
function maxSafeLightness(h: number, s: number, target = 3.0): number {
  let lo = 20;
  let hi = 55;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (contrastWithWhite(h, s, mid) >= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

function contrastWithWhite(h: number, s: number, l: number): number {
  const hN = h / 360;
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const k = (n + hN * 12) % 12;
    return lN - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const toLinear = (v: number) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const lum = 0.2126 * toLinear(f(0)) + 0.7152 * toLinear(f(8)) + 0.0722 * toLinear(f(4));
  return (1.0 + 0.05) / (lum + 0.05);
}

// Arc lengths between adjacent brand anchors along the shorter hue-wheel
// path. Teal→Blue is only 49° (a pinched region); the other two arcs are
// ~155°. Names are distributed across the three arcs proportionally so
// each arc gets names in roughly equal hue-space density.
const ARC_LENGTHS_DEG = [
  49, // teal(172°) → blue(221°)
  158, // blue(221°) → orange(19°) via 360°
  153, // orange(19°) → teal(172°) via 19° increasing
] as const;
const TOTAL_ARC = ARC_LENGTHS_DEG.reduce((s, x) => s + x, 0);

export function gradientFor(companyName: string): Gradient {
  const key = companyName.toLowerCase();
  const h1 = perturbedHash(key);
  const h2 = perturbedHash(key + "|secondary");

  // Map hash to a position on the concatenated hue path and recover
  // (arc index, position within arc) proportionally to arc length.
  // This keeps the narrow teal→blue arc from soaking up a third of
  // the corpus into 49° of hue space.
  const pathPos = (h1 / 0xffffffff) * TOTAL_ARC;
  let i: 0 | 1 | 2;
  let frac: number;
  if (pathPos < ARC_LENGTHS_DEG[0]) {
    i = 0;
    frac = pathPos / ARC_LENGTHS_DEG[0];
  } else if (pathPos < ARC_LENGTHS_DEG[0] + ARC_LENGTHS_DEG[1]) {
    i = 1;
    frac = (pathPos - ARC_LENGTHS_DEG[0]) / ARC_LENGTHS_DEG[1];
  } else {
    i = 2;
    frac =
      (pathPos - ARC_LENGTHS_DEG[0] - ARC_LENGTHS_DEG[1]) / ARC_LENGTHS_DEG[2];
  }

  const next = ((i + 1) % 3) as 0 | 1 | 2;
  const nextNext = ((i + 2) % 3) as 0 | 1 | 2;
  const a = BRAND_ANCHORS[i];
  const b = BRAND_ANCHORS[next];
  const c = BRAND_ANCHORS[nextNext];

  // stop1 sweeps the full arc from a to b. stop2 sits 18% further
  // along the path (wraps onto the next arc if we're near the end),
  // giving the gradient a consistent direction around the ring.
  const base1 = interpHsl(a, b, frac);
  const f2 = frac + 0.18;
  const base2 = f2 <= 1 ? interpHsl(a, b, f2) : interpHsl(b, c, f2 - 1);

  // S/L are derived from h2 and mapped WITHIN the safe range for each
  // stop's hue, rather than clamped after the fact. This avoids
  // ceiling-convergence where two names at different base hues both
  // get pushed to the same maxL → ΔE=0. The per-hue safe lightness
  // ceiling comes from `maxSafeLightness` (targets 3:1 white-text
  // contrast, matching the existing CompanyLogo's decorative approach).
  const sFraction = (h2 & 0xff) / 0xff;
  const lFraction = ((h2 >>> 8) & 0xff) / 0xff;
  const MIN_S = 65;
  const MAX_S = 100;
  const MIN_L = 28;

  const s1 = MIN_S + sFraction * (MAX_S - MIN_S);
  const s2 = MIN_S + (1 - sFraction) * (MAX_S - MIN_S);
  const maxL1 = maxSafeLightness(base1.h, s1);
  const maxL2 = maxSafeLightness(base2.h, s2);
  const stop1: Hsl = {
    h: base1.h,
    s: s1,
    l: MIN_L + lFraction * (maxL1 - MIN_L),
  };
  const stop2: Hsl = {
    h: base2.h,
    s: s2,
    l: MIN_L + (1 - lFraction) * (maxL2 - MIN_L),
  };
  return { stop1, stop2, anchor: i };
}

export function hslToCss(c: Hsl): string {
  return `hsl(${c.h.toFixed(1)} ${c.s.toFixed(1)}% ${c.l.toFixed(1)}%)`;
}

export function hslToHex(c: Hsl): string {
  const h = c.h / 360;
  const s = c.s / 100;
  const l = c.l / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
