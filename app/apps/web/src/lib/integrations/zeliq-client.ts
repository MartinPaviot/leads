/**
 * Zeliq API client — async contact enrichment (work email + mobile).
 *
 * Zeliq (Paris, EU/GDPR-native) aggregates 40+ data sources behind one
 * waterfall, which is why it's a strong fit for the FR/CH mobile gap.
 * Unlike the synchronous Kaspr/Lusha adapters, Zeliq's enrich endpoints
 * are ASYNCHRONOUS: you POST with a required `callback_url` and Zeliq
 * POSTs the enriched payload back to it later. So this is a fire-and-
 * webhook path, not a waterfall adapter — see app/api/webhooks/zeliq.
 *
 * Endpoints (docs.zeliq.com/reference):
 *   POST /api/contact/enrich/email   { first_name, last_name, company, linkedin_url, callback_url }
 *   POST /api/contact/enrich/phone   { linkedin_url, email, callback_url }
 *
 * Auth: the API key (Settings → Integration) in the Authorization header.
 * NOTE: the exact auth scheme + async payload shape aren't fully in the
 * public docs — Bearer + the defensive parser below are best-effort and
 * must be confirmed against a live key. Key absent → isZeliqAvailable()
 * is false and nothing fires.
 */

const ZELIQ_BASE = "https://api.zeliq.com";

export function isZeliqAvailable(): boolean {
  return Boolean(process.env.ZELIQ_API_KEY);
}

async function fire(path: string, body: Record<string, unknown>): Promise<void> {
  const key = process.env.ZELIQ_API_KEY;
  if (!key) throw new Error("ZELIQ_API_KEY not set");
  const res = await fetch(`${ZELIQ_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Zeliq ${res.status}: ${t.slice(0, 200)}`);
  }
}

/** Fire an async work-email enrichment. Result arrives on callbackUrl. */
export async function requestZeliqEmail(p: {
  firstName?: string;
  lastName?: string;
  company?: string; // name OR domain
  linkedinUrl?: string;
  callbackUrl: string;
}): Promise<void> {
  await fire("/api/contact/enrich/email", {
    first_name: p.firstName,
    last_name: p.lastName,
    company: p.company,
    linkedin_url: p.linkedinUrl,
    callback_url: p.callbackUrl,
  });
}

/** Fire an async mobile-phone enrichment. Result arrives on callbackUrl. */
export async function requestZeliqPhone(p: {
  linkedinUrl?: string;
  email?: string;
  callbackUrl: string;
}): Promise<void> {
  await fire("/api/contact/enrich/phone", {
    linkedin_url: p.linkedinUrl,
    email: p.email,
    callback_url: p.callbackUrl,
  });
}

export interface ZeliqParsed {
  phone: string | null;
  phoneType: "mobile" | "direct" | null;
  email: string | null;
  emailStatus: "verified" | "likely" | null;
}

/**
 * Parse the async webhook payload. Zeliq's payload shape isn't fully
 * documented, so scan defensively for the common field names across a
 * flat object or a nested `data`/`result`/`contact` envelope. Verify +
 * tighten against a real callback once a key is provisioned.
 */
export function parseZeliqWebhook(payload: unknown): ZeliqParsed {
  const out: ZeliqParsed = { phone: null, phoneType: null, email: null, emailStatus: null };
  if (!payload || typeof payload !== "object") return out;

  const root = payload as Record<string, unknown>;
  const env = (root.data ?? root.result ?? root.contact ?? root) as Record<string, unknown>;

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // Phone — prefer an explicit mobile field, then generic phone.
  const mobile =
    str(env.mobile_phone) ?? str(env.mobilePhone) ?? str(env.mobile) ?? null;
  const anyPhone =
    mobile ??
    str(env.phone) ??
    str(env.phone_number) ??
    str(env.phoneNumber) ??
    (Array.isArray(env.phones) && env.phones.length
      ? str((env.phones[0] as Record<string, unknown>)?.number ?? env.phones[0])
      : null);
  if (anyPhone) {
    out.phone = anyPhone;
    out.phoneType = mobile ? "mobile" : "direct";
  }

  // Email + status.
  const email =
    str(env.email) ??
    str(env.work_email) ??
    str(env.workEmail) ??
    (Array.isArray(env.emails) && env.emails.length
      ? str((env.emails[0] as Record<string, unknown>)?.email ?? env.emails[0])
      : null);
  if (email) {
    out.email = email;
    const status = String(env.email_status ?? env.status ?? "").toLowerCase();
    out.emailStatus = /valid|verified|deliverable|safe/.test(status) ? "verified" : "likely";
  }

  return out;
}

/** Build the callback URL Zeliq posts back to, carrying the contact id +
 *  a shared-secret token the webhook verifies. */
export function zeliqCallbackUrl(baseUrl: string, contactId: string): string {
  const secret = process.env.ZELIQ_WEBHOOK_SECRET ?? "";
  const u = new URL("/api/webhooks/zeliq", baseUrl);
  u.searchParams.set("contactId", contactId);
  if (secret) u.searchParams.set("token", secret);
  return u.toString();
}
