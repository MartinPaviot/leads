/**
 * FullEnrich API client — async, BULK contact enrichment (work/personal
 * email + mobile phone) via a 15+ source waterfall.
 *
 * FullEnrich (Paris, EU/GDPR-native) is a strong fit for the FR/CH mobile
 * gap that Apollo's synchronous fill misses. Like Zeliq, its enrich
 * endpoint is ASYNCHRONOUS — but it is also BULK (up to 100 people per
 * call) and correlates results back to our records via a `custom` object
 * that it echoes verbatim in the webhook. So this is a fire-and-webhook
 * path (see app/api/webhooks/fullenrich), not a synchronous waterfall
 * adapter.
 *
 * Contract (docs.fullenrich.com, API v2):
 *   POST /contact/enrich/bulk
 *     { name, webhook_url, data: [ { first_name, last_name, domain,
 *       company_name, linkedin_url, custom: { crm_contact_id } } ] }
 *     -> { id, name, status: "IN_PROGRESS" }
 *   GET  /contact/enrich/bulk/{id}        (poll fallback)
 *   Webhook POST -> { id, status, data: [ { custom, contact_info, ... } ] }
 *
 * Auth: `Authorization: Bearer <FULLENRICH_API_KEY>`.
 *
 * NOTE: the API host isn't quoted in the public docs (only the `/api/v2`
 * path prefix + the app.fullenrich.com dashboard). The base below is the
 * best-known value and is overridable via `FULLENRICH_API_BASE` — confirm
 * against a live key. Key absent -> isFullEnrichAvailable() is false and
 * nothing fires.
 */

const FULLENRICH_BASE = process.env.FULLENRICH_API_BASE ?? "https://app.fullenrich.com/api/v2";

export function isFullEnrichAvailable(): boolean {
  return Boolean(process.env.FULLENRICH_API_KEY);
}

export interface FullEnrichItem {
  /** Our contact id — round-tripped via `custom.crm_contact_id`. */
  contactId: string;
  firstName?: string;
  lastName?: string;
  domain?: string;
  companyName?: string;
  linkedinUrl?: string;
}

/** What to look up. REQUIRED by the API (per data[] item). A mobile costs
 *  10 credits, a deliverable work email 1, a personal email 3 — charged
 *  only on success. Default = mobile + work email (the "Find mobile" promise). */
export type FullEnrichField = "contact.phones" | "contact.work_emails" | "contact.personal_emails";
export const DEFAULT_ENRICH_FIELDS: FullEnrichField[] = ["contact.phones", "contact.work_emails"];

/**
 * Fire one bulk enrichment (up to 100 contacts). Results arrive later on
 * `webhookUrl`, one `data[]` row per contact, each carrying back its
 * `custom.crm_contact_id`. Returns the enrichment id (for polling).
 */
export async function requestFullEnrichBulk(p: {
  items: FullEnrichItem[];
  webhookUrl: string;
  name?: string;
  /** Per-item lookup targets. Defaults to mobile + work email. */
  enrichFields?: FullEnrichField[];
}): Promise<{ id: string | null }> {
  const key = process.env.FULLENRICH_API_KEY;
  if (!key) throw new Error("FULLENRICH_API_KEY not set");

  const enrichFields = p.enrichFields?.length ? p.enrichFields : DEFAULT_ENRICH_FIELDS;
  const data = p.items.slice(0, 100).map((it) => ({
    first_name: it.firstName,
    last_name: it.lastName,
    domain: it.domain,
    company_name: it.companyName,
    linkedin_url: it.linkedinUrl,
    // REQUIRED by the API — without it the request is rejected.
    enrich_fields: enrichFields,
    // Echoed back verbatim in the webhook — our correlation key. Values
    // MUST be strings (FullEnrich rejects numbers).
    custom: { crm_contact_id: it.contactId },
  }));

  const res = await fetch(`${FULLENRICH_BASE}/contact/enrich/bulk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      name: p.name ?? `Elevay enrichment ${new Date().toISOString()}`,
      webhook_url: p.webhookUrl,
      data,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`FullEnrich ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // POST returns `enrichment_id`; the webhook/GET payload uses `id`. Accept both.
  const id =
    (typeof json.enrichment_id === "string" && json.enrichment_id) ||
    (typeof json.id === "string" && json.id) ||
    null;
  return { id };
}

export interface FullEnrichParsedContact {
  /** From `custom.crm_contact_id` — null if the row didn't carry it. */
  contactId: string | null;
  email: string | null;
  emailStatus: "verified" | "likely" | null;
  /** Best phone. FullEnrich's `most_probable_phone` is a mobile (the 10-
   * credit lookup), so we type it as such. */
  phone: string | null;
  phoneType: "mobile" | null;
}

export interface FullEnrichWebhookParsed {
  status: string | null;
  contacts: FullEnrichParsedContact[];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Pick an email object, skipping FullEnrich's INVALID status. */
function pickEmail(ci: Record<string, unknown>): { email: string | null; status: "verified" | "likely" | null } {
  const candidates = [ci.most_probable_work_email, ci.most_probable_personal_email];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const obj = c as Record<string, unknown>;
    const email = str(obj.email);
    const status = String(obj.status ?? "").toUpperCase();
    if (!email || status === "INVALID") continue;
    return { email, status: /(DELIVERABLE|HIGH_PROBABILITY)/.test(status) ? "verified" : "likely" };
  }
  // Fall back to the first non-invalid entry in the work/personal arrays.
  for (const key of ["work_emails", "personal_emails"] as const) {
    const arr = ci[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (!e || typeof e !== "object") continue;
      const obj = e as Record<string, unknown>;
      const email = str(obj.email);
      const status = String(obj.status ?? "").toUpperCase();
      if (!email || status.startsWith("INVALID")) continue;
      return { email, status: /(DELIVERABLE|HIGH_PROBABILITY)/.test(status) ? "verified" : "likely" };
    }
  }
  return { email: null, status: null };
}

/**
 * Parse a FullEnrich bulk webhook into per-contact results, correlated by
 * `custom.crm_contact_id`. Defensive: FullEnrich can deliver per-contact
 * (`webhook_events.contact_finished`) or one terminal `COMPLETED` payload,
 * so we apply whatever rows are present regardless of top-level status.
 */
export function parseFullEnrichWebhook(payload: unknown): FullEnrichWebhookParsed {
  const out: FullEnrichWebhookParsed = { status: null, contacts: [] };
  if (!payload || typeof payload !== "object") return out;
  const root = payload as Record<string, unknown>;
  out.status = str(root.status);

  const data = Array.isArray(root.data) ? root.data : [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const custom = (r.custom ?? {}) as Record<string, unknown>;
    const contactId = str(custom.crm_contact_id);
    const ci = (r.contact_info ?? {}) as Record<string, unknown>;

    const { email, status: emailStatus } = pickEmail(ci);

    const mp = (ci.most_probable_phone ?? {}) as Record<string, unknown>;
    let phone = str(mp.number);
    if (!phone && Array.isArray(ci.phones) && ci.phones.length > 0) {
      const first = ci.phones[0] as Record<string, unknown>;
      phone = str(first?.number);
    }

    // Skip rows with nothing useful and no id to map back.
    if (!contactId && !email && !phone) continue;
    out.contacts.push({
      contactId,
      email,
      emailStatus,
      phone,
      phoneType: phone ? "mobile" : null,
    });
  }
  return out;
}

/** The single webhook URL FullEnrich posts back to, carrying a shared
 *  secret the receiver verifies (FullEnrich's signature scheme isn't in
 *  the public docs). Correlation to contacts is via custom, not the URL. */
export function fullEnrichWebhookUrl(baseUrl: string): string {
  const secret = process.env.FULLENRICH_WEBHOOK_SECRET ?? "";
  const u = new URL("/api/webhooks/fullenrich", baseUrl);
  if (secret) u.searchParams.set("token", secret);
  return u.toString();
}
