/**
 * Call-list reachability — turns the raw signals already on a call-queue row
 * (the number, its accessibility score, the LinkedIn role check, when the
 * coordinates were found) into a small, honest set of facts a rep can glance
 * at BEFORE dialling: is there a mobile, is it Swiss or foreign, is it a
 * direct line or a likely switchboard, is the role still current, how fresh
 * are the coordinates.
 *
 * Pure + provider-neutral (no DB, no vendor names — provenance reads "via
 * Elevay") so it's unit-testable and safe on client and server. The UI
 * (call-mode/_reachability-info) renders these facts in a hover panel behind
 * a discreet Info icon; the same facts could feed an aggregate list header.
 */

import { relativeFr, type RoleVerification } from "@/lib/contacts/role-status";

export type ReachTone = "good" | "warn" | "muted";
export interface ReachFact {
  tone: ReachTone;
  label: string;
}
export type ReachState = "joignable" | "a_verifier" | "sans_mobile";
export interface Reachability {
  /** One-word overall state — drives an optional chip / icon tint. */
  state: ReachState;
  /** Ordered facts to show in the panel (number, role, provenance). */
  facts: ReachFact[];
}

/** Country-code → French label for the most common non-CH cases we see on
 *  romand lists (foreign execs, cross-border staff). Longest-prefix match. */
const CC_LABEL: Record<string, string> = {
  "41": "suisse",
  "33": "français",
  "39": "italien",
  "34": "espagnol",
  "32": "belge",
  "49": "allemand",
  "44": "britannique",
  "351": "portugais",
  "31": "néerlandais",
  "1": "nord-américain",
};

export interface PhoneGeo {
  hasNumber: boolean;
  isCH: boolean;
  /** Dialing code without "+", when derivable (e.g. "41", "33"). */
  cc: string | null;
  /** French country adjective when known (e.g. "français"), else null. */
  countryLabel: string | null;
}

/** Classify a raw phone string by geography, defensively. */
export function phoneGeo(phone: string | null | undefined): PhoneGeo {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  // A usable number has at least 8 digits; below that it's noise/partial.
  const hasNumber = digits.length >= 8;
  if (!hasNumber) return { hasNumber: false, isCH: false, cc: null, countryLabel: null };

  // Swiss national format (0XX… without a country code) → treat as CH.
  const isNational = /^0\d{8,9}$/.test(digits) && !raw.startsWith("+");
  if (isNational) return { hasNumber: true, isCH: true, cc: "41", countryLabel: "suisse" };

  // E.164 / international: derive the country code by longest known prefix.
  const intl = raw.startsWith("+") || raw.startsWith("00");
  const body = raw.startsWith("00") ? digits.slice(2) : digits;
  if (intl) {
    for (const len of [3, 2, 1]) {
      const cand = body.slice(0, len);
      if (CC_LABEL[cand]) return { hasNumber: true, isCH: cand === "41", cc: cand, countryLabel: CC_LABEL[cand] };
    }
    const cc = body.slice(0, 2) || null;
    return { hasNumber: true, isCH: false, cc, countryLabel: null };
  }
  // No prefix and not national → unknown origin; don't claim CH.
  return { hasNumber: true, isCH: false, cc: null, countryLabel: null };
}

export interface ReachabilityInput {
  phone?: string | null;
  /** 0–1; <=0.5 means a likely switchboard/standard line (not a direct dial). */
  accessibilityScore?: number | null;
  roleVerification?: RoleVerification | null;
  /** When the coordinates were last found/refreshed. */
  lastEnrichedAt?: string | null;
  now?: Date;
}

/** Build the glanceable reachability summary for one call-list row. */
export function computeReachability(input: ReachabilityInput): Reachability {
  const now = input.now ?? new Date();
  const geo = phoneGeo(input.phone);
  const facts: ReachFact[] = [];
  let state: ReachState;

  // 1) The number itself.
  if (!geo.hasNumber) {
    facts.push({ tone: "muted", label: "Pas de mobile" });
    state = "sans_mobile";
  } else if (geo.isCH) {
    const standard = typeof input.accessibilityScore === "number" && input.accessibilityScore <= 0.5;
    if (standard) {
      facts.push({ tone: "warn", label: "Numéro suisse — standard probable" });
      state = "a_verifier";
    } else {
      facts.push({ tone: "good", label: "Mobile suisse" });
      state = "joignable";
    }
  } else {
    facts.push({ tone: "warn", label: geo.countryLabel ? `Numéro ${geo.countryLabel} (hors-CH)` : "Numéro hors-CH" });
    state = "a_verifier";
  }

  // 2) Role freshness (the role-status SSOT).
  const v = input.roleVerification;
  if (v?.status === "confirmed") {
    const when = relativeFr(v.at, now);
    facts.push({ tone: "good", label: `Poste vérifié${when ? ` · ${when}` : ""}` });
  } else if (v?.status === "left") {
    facts.push({ tone: "warn", label: "A quitté ce poste" });
    state = "a_verifier";
  } else {
    facts.push({ tone: "muted", label: "Poste non vérifié" });
  }

  // 3) Provenance — recency only, never a vendor name.
  const found = relativeFr(input.lastEnrichedAt, now);
  if (found) facts.push({ tone: "muted", label: `Coordonnées via Elevay · ${found}` });

  return { state, facts };
}

/** Short label for the overall state (chip / aria). */
export function reachStateLabel(state: ReachState): string {
  return state === "joignable" ? "Joignable" : state === "a_verifier" ? "À vérifier" : "Sans mobile";
}
