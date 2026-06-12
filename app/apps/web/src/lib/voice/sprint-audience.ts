/**
 * Sprint audience — the PURE slice of the call-sprint module (type +
 * targetFilter parser), dependency-free so client components (cockpit chip)
 * and server code share one SSOT. Resolution/SQL live in
 * lib/voice/call-sprint.ts, which re-exports these.
 */

export interface SprintAudience {
  /** Human label echoed in chat/UI ("les DG des EMS romands"). */
  label: string;
  /** Verbatim companies.industry labels (subset of the tenant's real ones). */
  industries: string[];
  /** Verbatim persona labels (subset of the active ICPs' person_titles). */
  personas: string[];
}

/**
 * Validate a campaign targetFilter's `audience` into a usable SprintAudience.
 * Null when absent, malformed, or empty on BOTH facets — an empty audience
 * must mean "no sprint" (whole ICP), never silently "match everyone".
 */
export function readSprintAudience(targetFilter: unknown): SprintAudience | null {
  if (!targetFilter || typeof targetFilter !== "object") return null;
  const raw = (targetFilter as Record<string, unknown>).audience;
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const strs = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))] : [];
  const industries = strs(a.industries);
  const personas = strs(a.personas);
  if (industries.length === 0 && personas.length === 0) return null;
  const label = typeof a.label === "string" && a.label.trim() ? a.label.trim() : "sprint";
  return { label, industries, personas };
}
