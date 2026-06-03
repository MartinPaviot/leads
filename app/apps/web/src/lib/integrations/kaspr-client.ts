/**
 * Kaspr API client — person enrichment, FR-mobile leader (~55% FR mobile
 * coverage at ~€0.30/lookup). Kaspr resolves a LinkedIn profile to
 * emails + phone numbers (mobiles flagged), so the adapter only calls it
 * when a LinkedIn URL is known (Apollo supplies one for most contacts).
 *
 * Auth via the `Authorization` header (Kaspr API key). Endpoint shape
 * follows Kaspr's profile-enrichment API.
 * Docs: https://developers.kaspr.io
 *
 * NOTE: Kaspr's exact endpoint/payload must be confirmed against the live
 * key on provisioning — the response is parsed defensively so a schema
 * drift degrades to "no data" rather than throwing. The waterfall treats
 * an unavailable/empty Kaspr as a skipped provider.
 */

export interface KasprPhone {
  number: string;
  /** Kaspr flags mobile vs office; we normalize downstream. */
  type: string;
}

export interface KasprPerson {
  email: string | null;
  emailValidated: boolean;
  phones: KasprPhone[];
}

export function isKasprAvailable(): boolean {
  return Boolean(process.env.KASPR_API_KEY);
}

export async function enrichPersonKaspr(params: {
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}): Promise<KasprPerson | null> {
  const apiKey = process.env.KASPR_API_KEY;
  if (!apiKey) throw new Error("KASPR_API_KEY not set");

  // Kaspr's primary identifier is the LinkedIn profile URL.
  if (!params.linkedinUrl) return null;

  const res = await fetch("https://api.kaspr.io/api/v1/profile/enrich", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      linkedinUrl: params.linkedinUrl,
      // Kaspr can also match on name+company; passed for redundancy.
      firstName: params.firstName,
      lastName: params.lastName,
      companyName: params.companyName,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(`Kaspr ${res.status}: ${body.slice(0, 200)}`);
  }

  const raw = await res.json();
  const d = raw?.data ?? raw?.profile ?? raw;
  if (!d) return null;

  // Emails: array of { email, validated } or a flat string.
  const emailsArr = Array.isArray(d.emails) ? d.emails : [];
  const primaryEmail = emailsArr[0] ?? null;
  const email: string | null =
    (typeof primaryEmail === "string" ? primaryEmail : primaryEmail?.email) ?? d.email ?? null;
  const emailValidated = Boolean(
    primaryEmail?.validated ?? primaryEmail?.isValid ?? d.emailValidated,
  );

  // Phones: array of { number/phone, type } — mobile flagged by type.
  const phonesArr = Array.isArray(d.phones)
    ? d.phones
    : Array.isArray(d.phoneNumbers)
      ? d.phoneNumbers
      : [];
  const phones: KasprPhone[] = phonesArr
    .map((p: unknown) => {
      if (typeof p === "string") return { number: p, type: "mobile" };
      const o = p as Record<string, unknown>;
      return {
        number: String(o.number ?? o.phone ?? ""),
        type: String(o.type ?? o.phoneType ?? "mobile").toLowerCase(),
      };
    })
    .filter((p: KasprPhone) => p.number);

  return { email, emailValidated, phones };
}
