/**
 * Deterministic hash utilities for company logo avatars.
 *
 * `fnv1a` is the cheap 32-bit FNV-1a variant already used in the legacy
 * `CompanyLogo` colour-for-seed function. It's fine for a small palette
 * modulo — but when we map hashes onto a continuous HSL ring for
 * gradient generation, raw FNV-1a clusters adjacent inputs in ways that
 * produce visually indistinguishable neighbours (see
 * `logo-rendering-fix-plan.md` Q10 + T A.7 ΔE oracle).
 *
 * `perturbedHash` mixes the low and high halves of the FNV-1a output so
 * single-character differences between inputs land far apart on the
 * ring. That's the tunable knob: if the ΔE oracle fails the ≥15 floor,
 * we adjust the shift constants until it passes.
 */

export function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function perturbedHash(seed: string): number {
  // MurmurHash3 finalizer on top of FNV-1a. FNV-1a alone gives a
  // ~32-bit output but its avalanche is weak — a single-byte change
  // can leave most output bits unchanged, which clusters neighbours
  // on the gradient ring. The fmix32 finalizer (Austin Appleby, 2011)
  // provides the mixing FNV-1a lacks and is ~10 LoC.
  let h = fnv1a(seed);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
