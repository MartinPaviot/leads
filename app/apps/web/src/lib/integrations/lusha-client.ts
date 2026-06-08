/**
 * Lusha API client — person enrichment (email + phone, incl. mobile).
 *
 * Lusha covers FR/CH/EU reasonably and is our cross-border fallback for
 * the contact-enrichment waterfall. Auth via the `api_key` header.
 *
 * Endpoint: GET https://api.lusha.com/v2/person
 *   identify by linkedinUrl, OR by (firstName + lastName + company),
 *   where company is a domain or a name.
 * Docs: https://docs.lusha.com/apis/openapi/person-api
 *
 * NOTE: exact field names in Lusha's response are mapped defensively
 * (optional chaining + fallbacks) so a minor schema drift degrades to
 * "no data" rather than throwing. Verify the mapping against a live key.
 */

export interface LushaPhone {
  number: string;
  /** Lusha types: "mobile" | "landline" | "voip" | ... */
  type: string;
  doNotCall?: boolean;
}

export interface LushaPerson {
  email: string | null;
  /** Lusha email confidence buckets → mapped to our verified/likely. */
  emailConfident: boolean;
  phones: LushaPhone[];
  linkedinUrl: string | null;
}

export function isLushaAvailable(): boolean {
  return Boolean(process.env.LUSHA_API_KEY);
}

export async function enrichPersonLusha(params: {
  firstName?: string;
  lastName?: string;
  linkedinUrl?: string;
  companyDomain?: string;
  companyName?: string;
}): Promise<LushaPerson | null> {
  const apiKey = process.env.LUSHA_API_KEY;
  if (!apiKey) throw new Error("LUSHA_API_KEY not set");

  const qs = new URLSearchParams();
  if (params.linkedinUrl) qs.set("linkedinUrl", params.linkedinUrl);
  if (params.firstName) qs.set("firstName", params.firstName);
  if (params.lastName) qs.set("lastName", params.lastName);
  if (params.companyDomain) qs.set("companyDomain", params.companyDomain);
  else if (params.companyName) qs.set("companyName", params.companyName);

  // Need either a LinkedIn URL or a name + a company to identify a person.
  const hasName = params.firstName && params.lastName;
  const hasCompany = params.companyDomain || params.companyName;
  if (!params.linkedinUrl && !(hasName && hasCompany)) return null;

  const res = await fetch(`https://api.lusha.com/v2/person?${qs}`, {
    headers: { api_key: apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(`Lusha ${res.status}: ${body.slice(0, 200)}`);
  }

  const raw = await res.json();
  // Lusha v2/person nests the record under `contact.data`; a non-null
  // `contact.error` means no match. Older shapes used a top-level `data`.
  const contact = raw?.contact;
  if (contact && contact.error) return null;
  const d = contact?.data ?? raw?.data ?? raw;
  if (!d) return null;

  const emailObj = Array.isArray(d.emailAddresses) ? d.emailAddresses[0] : null;
  const email: string | null = emailObj?.email ?? d.email ?? null;
  // Lusha confidence: "A_plus"/"A"/high → verified-grade; else likely.
  const conf = String(emailObj?.emailConfidence ?? d.emailConfidence ?? "").toLowerCase();
  const emailConfident = /a|high|verified/.test(conf);

  const phonesRaw = Array.isArray(d.phoneNumbers) ? d.phoneNumbers : [];
  const phones: LushaPhone[] = phonesRaw
    .map((p: Record<string, unknown>) => ({
      number: String(p.number ?? p.phoneNumber ?? ""),
      type: String(p.phoneType ?? p.type ?? "other").toLowerCase(),
      doNotCall: Boolean(p.doNotCall),
    }))
    .filter((p: LushaPhone) => p.number);

  return {
    email,
    emailConfident,
    phones,
    linkedinUrl: d.socialLinks?.linkedin ?? d.linkedinUrl ?? params.linkedinUrl ?? null,
  };
}
