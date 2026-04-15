/**
 * Decide how the meeting bot should present itself for a given activity.
 *
 * The recorder is treated as a branded acquisition channel: when external
 * participants are present, the bot name carries the tenant's brand + a
 * "via Elevay" wedge; when the meeting is internal, it joins silently as
 * "Notes" so employees are not nudged with marketing copy.
 *
 * Pure logic — no DB, no I/O.
 */

import { extractDomain, normalizeEmail } from "@/lib/util/email";

export type BrandingMode = "full" | "silent" | "opted_out";

export type BrandingDecisionInput = {
  attendees: Array<{ email: string; self?: boolean }>;
  tenant: {
    id: string;
    settings: {
      recordingEnabled?: boolean;
      recordingBotName?: string;
      recordingPolicy?: "branded" | "always_silent" | "per_meeting_choice";
      primaryDomain?: string;
      domainAliases?: string[];
    };
    ownerEmail: string;
  };
  /** Per-meeting override set by the user (hides branding on a single call). */
  meetingOverride?: "branded" | "silent";
};

export type BrandingDecision = {
  mode: BrandingMode;
  /** Passed as `bot_name` to Recall.ai. Empty when mode is 'opted_out'. */
  botDisplayName: string;
  /** Normalised emails of participants who see the branded bot. */
  externalAttendees: string[];
  /** Observability: which rule fired. */
  reason:
    | "recording_disabled"
    | "tenant_always_silent"
    | "meeting_override_silent"
    | "all_internal"
    | "branded_default";
};

const DEFAULT_BOT_NAME = "Elevay Notetaker";
const SILENT_BOT_NAME = "Notes";

export function decideBrandingMode(input: BrandingDecisionInput): BrandingDecision {
  const { attendees, tenant, meetingOverride } = input;
  const settings = tenant.settings ?? {};

  if (settings.recordingEnabled === false) {
    return {
      mode: "opted_out",
      botDisplayName: "",
      externalAttendees: [],
      reason: "recording_disabled",
    };
  }

  if (settings.recordingPolicy === "always_silent") {
    return {
      mode: "silent",
      botDisplayName: SILENT_BOT_NAME,
      externalAttendees: [],
      reason: "tenant_always_silent",
    };
  }

  if (meetingOverride === "silent") {
    return {
      mode: "silent",
      botDisplayName: SILENT_BOT_NAME,
      externalAttendees: [],
      reason: "meeting_override_silent",
    };
  }

  const primaryDomain = getPrimaryDomain(tenant);
  const aliases = settings.domainAliases ?? [];

  const externals = collectExternalAttendees(attendees, primaryDomain, aliases);

  if (externals.length === 0) {
    return {
      mode: "silent",
      botDisplayName: SILENT_BOT_NAME,
      externalAttendees: [],
      reason: "all_internal",
    };
  }

  const baseName = (settings.recordingBotName?.trim() || DEFAULT_BOT_NAME).trim();
  return {
    mode: "full",
    botDisplayName: `${baseName} (via Elevay)`,
    externalAttendees: externals,
    reason: "branded_default",
  };
}

function getPrimaryDomain(tenant: BrandingDecisionInput["tenant"]): string | null {
  if (tenant.settings?.primaryDomain) {
    return tenant.settings.primaryDomain.trim().toLowerCase();
  }
  return extractDomain(tenant.ownerEmail);
}

function collectExternalAttendees(
  attendees: Array<{ email: string; self?: boolean }>,
  primaryDomain: string | null,
  aliases: string[]
): string[] {
  const externals = new Set<string>();
  const normalizedAliases = aliases.map((a) => a.trim().toLowerCase()).filter(Boolean);

  for (const a of attendees) {
    if (!a.email || a.self) continue;
    const domain = extractDomain(a.email);
    if (!domain) continue;
    if (primaryDomain && isSameOrg(domain, primaryDomain, normalizedAliases)) continue;
    try {
      externals.add(normalizeEmail(a.email));
    } catch {
      // Skip malformed emails rather than failing the whole decision
      continue;
    }
  }
  return [...externals];
}

export function isSameOrg(domain: string, primaryDomain: string, aliases: string[]): boolean {
  if (domain === primaryDomain) return true;
  if (aliases.includes(domain)) return true;
  return fuzzyDomainMatch(domain, primaryDomain);
}

/**
 * Treat two domains as the same org when their roots differ by ≤2 edits and
 * their TLD matches. Covers acme.com / acme-corp.com without pulling in
 * unrelated vendors.
 */
export function fuzzyDomainMatch(domainA: string, domainB: string): boolean {
  if (domainA === domainB) return true;

  const partsA = domainA.split(".");
  const partsB = domainB.split(".");
  if (partsA.length < 2 || partsB.length < 2) return false;

  const tldA = partsA[partsA.length - 1];
  const tldB = partsB[partsB.length - 1];
  if (tldA !== tldB) return false;

  const rootA = partsA[partsA.length - 2];
  const rootB = partsB[partsB.length - 2];

  // Avoid false positives on short roots — require ≥4 chars for fuzzy match
  if (rootA.length < 4 || rootB.length < 4) return false;

  return levenshtein(rootA, rootB) <= 2;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insert
        prev[j] + 1,          // delete
        prev[j - 1] + cost    // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
