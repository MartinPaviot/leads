/**
 * Shared client call to the mobile-finding engine (the contacts enrich route,
 * which fans out to the EU/CH waterfall and writes the mobile back on the
 * contact when it arrives). One place so the per-row action and the list
 * header's bulk action behave identically. Async by nature — the number lands
 * on the contact a little later, so callers confirm "requested", not a result.
 */
export interface FindMobileResult {
  ok: boolean;
  requested?: number;
  error?: string;
}

export async function requestFindMobile(contactIds: string[]): Promise<FindMobileResult> {
  const ids = contactIds.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 100);
  if (ids.length === 0) return { ok: false, error: "Aucun contact" };
  try {
    const res = await fetch("/api/contacts/fullenrich-enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactIds: ids }),
    });
    const j = (await res.json().catch(() => ({}))) as { requested?: number; error?: string };
    if (!res.ok) return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
    return { ok: true, requested: typeof j.requested === "number" ? j.requested : ids.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de la requête" };
  }
}

export interface RoleObsoleteResult {
  ok: boolean;
  error?: string;
}

/**
 * CLE-09 §4 lift: the single copy of the PUT that flags a contact's sourced
 * role as obsolete. Both the brief's "a quitté ce poste" button (PreCallBrief)
 * and the agent path (callMode.markRoleObsolete) call this, so there is exactly
 * one request shape. The row-drop / selection-advance is applied by the caller.
 */
export async function requestRoleObsolete(contactId: string): Promise<RoleObsoleteResult> {
  try {
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleObsolete: true }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de la requête" };
  }
}
