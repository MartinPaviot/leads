/**
 * Hunter.io API client.
 *
 * Domain Search: find emails at a domain (15 req/s, 500/min).
 * Email Verifier: verify deliverability (10 req/s, 300/min).
 *
 * Docs: https://hunter.io/api-documentation
 */

const HUNTER_BASE = "https://api.hunter.io/v2";

export interface HunterEmail {
  value: string;
  type: "personal" | "generic" | null;
  confidence: number;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  linkedin: string | null;
}

export interface HunterDomainResult {
  domain: string;
  organization: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  pattern: string | null;
  emails: HunterEmail[];
}

export interface HunterVerifyResult {
  email: string;
  result: "deliverable" | "undeliverable" | "risky" | "unknown";
  score: number;
  regexp: boolean;
  smtp_server: boolean;
  smtp_check: boolean;
  accept_all: boolean;
  disposable: boolean;
  webmail: boolean;
}

export function isHunterAvailable(): boolean {
  return Boolean(process.env.HUNTER_API_KEY);
}

async function hunterFetch<T>(path: string): Promise<T> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) throw new Error("HUNTER_API_KEY not set");

  const sep = path.includes("?") ? "&" : "?";
  const url = `${HUNTER_BASE}${path}${sep}api_key=${key}`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hunter ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export async function searchDomain(
  domain: string,
): Promise<HunterDomainResult | null> {
  try {
    const raw = await hunterFetch<{
      data: {
        domain: string;
        organization: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
        pattern: string | null;
        emails: HunterEmail[];
      };
    }>(`/domain-search?domain=${encodeURIComponent(domain)}&limit=5`);

    return raw.data;
  } catch (err) {
    if ((err as Error)?.message?.includes("404")) return null;
    throw err;
  }
}

export async function verifyEmail(
  email: string,
): Promise<HunterVerifyResult | null> {
  try {
    const raw = await hunterFetch<{ data: HunterVerifyResult }>(
      `/email-verifier?email=${encodeURIComponent(email)}`,
    );
    return raw.data;
  } catch {
    return null;
  }
}
