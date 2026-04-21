/**
 * Colour-distance utilities for the gradient perceptual oracle.
 *
 * Implements sRGB → XYZ → LAB conversion and the CIE2000 ΔE formula so
 * the gradient generator can be tested for perceptual distinctness
 * without pulling in `culori` or `chroma.js`. The constants and
 * piecewise definitions follow the standard published in Sharma et al.
 * 2005, "The CIEDE2000 Color-Difference Formula: Implementation
 * Notes…" — the same paper every other implementation cites.
 *
 * Used only by `__tests__/gradient-perceptual.test.ts`. Test-only
 * dependency, but exposed as a module so the numbers can be inspected
 * ad-hoc from the CLI if the oracle ever drifts.
 */

import type { Hsl } from "./gradient";
import { hslToHex } from "./gradient";

interface Rgb {
  r: number;
  g: number;
  b: number;
}
interface Lab {
  L: number;
  a: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function rgbToXyz(rgb: Rgb): { X: number; Y: number; Z: number } {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return {
    X: (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100,
    Y: (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100,
    Z: (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100,
  };
}

function xyzToLab(xyz: { X: number; Y: number; Z: number }): Lab {
  const Xn = 95.047;
  const Yn = 100;
  const Zn = 108.883;
  const f = (t: number): number => {
    const delta = 6 / 29;
    return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
  };
  const fx = f(xyz.X / Xn);
  const fy = f(xyz.Y / Yn);
  const fz = f(xyz.Z / Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function hslToLab(c: Hsl): Lab {
  return xyzToLab(rgbToXyz(hexToRgb(hslToHex(c))));
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** CIE2000 ΔE between two LAB colours. */
export function deltaE2000(c1: Lab, c2: Lab): number {
  const avgL = (c1.L + c2.L) / 2;
  const C1 = Math.hypot(c1.a, c1.b);
  const C2 = Math.hypot(c2.a, c2.b);
  const avgC = (C1 + C2) / 2;
  const avgC7 = avgC ** 7;
  const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + 25 ** 7)));
  const a1p = (1 + G) * c1.a;
  const a2p = (1 + G) * c2.a;
  const C1p = Math.hypot(a1p, c1.b);
  const C2p = Math.hypot(a2p, c2.b);
  const avgCp = (C1p + C2p) / 2;

  const h1p = (deg(Math.atan2(c1.b, a1p)) + 360) % 360;
  const h2p = (deg(Math.atan2(c2.b, a2p)) + 360) % 360;

  const dLp = c2.L - c1.L;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  let avgHp: number;
  if (C1p * C2p === 0) avgHp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) avgHp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) avgHp = (h1p + h2p + 360) / 2;
  else avgHp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(avgHp - 30)) +
    0.24 * Math.cos(rad(2 * avgHp)) +
    0.32 * Math.cos(rad(3 * avgHp + 6)) -
    0.2 * Math.cos(rad(4 * avgHp - 63));
  const dTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const avgCp7 = avgCp ** 7;
  const RC = 2 * Math.sqrt(avgCp7 / (avgCp7 + 25 ** 7));
  const SL = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 +
      (dCp / SC) ** 2 +
      (dHp / SH) ** 2 +
      RT * (dCp / SC) * (dHp / SH),
  );
}

export function pairwiseMinDeltaE<T>(
  items: readonly T[],
  labOf: (item: T) => Lab,
): { min: number; i: number; j: number } {
  let min = Infinity;
  let mi = -1;
  let mj = -1;
  const labs = items.map(labOf);
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = deltaE2000(labs[i], labs[j]);
      if (d < min) {
        min = d;
        mi = i;
        mj = j;
      }
    }
  }
  return { min, i: mi, j: mj };
}
