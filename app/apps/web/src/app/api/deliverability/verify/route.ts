import { getAuthContext } from "@/lib/auth/auth-utils";
import { promises as dns } from "dns";

/**
 * SPF/DKIM/DMARC verification for a sending domain.
 * Uses DNS TXT record lookups — no external service needed.
 */

interface DnsResult {
  status: "pass" | "fail" | "missing";
  record?: string;
  details?: string;
}

async function checkSPF(domain: string): Promise<DnsResult> {
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map((r) => r.join(""));
    const spf = flat.find((r) => r.startsWith("v=spf1"));
    if (!spf) return { status: "missing", details: "No SPF record found" };

    // Basic validation
    if (spf.includes("~all") || spf.includes("-all")) {
      return { status: "pass", record: spf };
    }
    if (spf.includes("+all")) {
      return { status: "fail", record: spf, details: "SPF uses +all (allows any sender)" };
    }
    if (spf.includes("?all")) {
      return { status: "fail", record: spf, details: "SPF uses ?all (neutral, not enforcing)" };
    }
    return { status: "pass", record: spf };
  } catch {
    return { status: "missing", details: "DNS lookup failed" };
  }
}

async function checkDKIM(domain: string, selectors: string[] = ["default", "google", "selector1", "selector2", "k1", "resend"]): Promise<DnsResult> {
  for (const selector of selectors) {
    try {
      const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
      const flat = records.map((r) => r.join(""));
      const dkim = flat.find((r) => r.includes("v=DKIM1") || r.includes("p="));
      if (dkim) {
        return { status: "pass", record: `${selector}._domainkey: ${dkim.slice(0, 80)}...`, details: `Selector: ${selector}` };
      }
    } catch {
      // Try next selector
    }
  }
  return { status: "missing", details: `No DKIM record found (checked: ${selectors.join(", ")})` };
}

async function checkDMARC(domain: string): Promise<DnsResult> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map((r) => r.join(""));
    const dmarc = flat.find((r) => r.startsWith("v=DMARC1"));
    if (!dmarc) return { status: "missing", details: "No DMARC record found" };

    // Check policy
    const policyMatch = dmarc.match(/p=(\w+)/);
    const policy = policyMatch?.[1] || "none";

    if (policy === "none") {
      return { status: "fail", record: dmarc, details: "DMARC policy is 'none' (monitoring only, not enforcing)" };
    }
    if (policy === "quarantine" || policy === "reject") {
      return { status: "pass", record: dmarc, details: `Policy: ${policy}` };
    }
    return { status: "pass", record: dmarc };
  } catch {
    return { status: "missing", details: "DNS lookup failed" };
  }
}

async function checkMX(domain: string): Promise<DnsResult> {
  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 0) return { status: "missing", details: "No MX records found" };
    const sorted = records.sort((a, b) => a.priority - b.priority);
    return {
      status: "pass",
      record: sorted.map((r) => `${r.priority} ${r.exchange}`).join(", "),
    };
  } catch {
    return { status: "missing", details: "DNS lookup failed" };
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain } = await req.json();
  if (!domain || typeof domain !== "string") {
    return Response.json({ error: "domain is required" }, { status: 400 });
  }

  // Clean domain
  const cleanDomain = domain.toLowerCase().replace(/^www\./, "").replace(/\/$/, "");

  const [spf, dkim, dmarc, mx] = await Promise.all([
    checkSPF(cleanDomain),
    checkDKIM(cleanDomain),
    checkDMARC(cleanDomain),
    checkMX(cleanDomain),
  ]);

  const checks = { spf, dkim, dmarc, mx };
  const passCount = Object.values(checks).filter((c) => c.status === "pass").length;
  const score = Math.round((passCount / 4) * 100);

  // Generate recommendations
  const recommendations: string[] = [];
  if (spf.status !== "pass") {
    recommendations.push("Add an SPF record: v=spf1 include:_spf.google.com include:amazonses.com ~all");
  }
  if (dkim.status !== "pass") {
    recommendations.push("Set up DKIM signing with your email provider (check their DNS setup guide)");
  }
  if (dmarc.status !== "pass") {
    recommendations.push("Add a DMARC record: v=DMARC1; p=quarantine; rua=mailto:dmarc@" + cleanDomain);
  }
  if (mx.status !== "pass") {
    recommendations.push("Configure MX records for your domain to receive email");
  }

  return Response.json({
    domain: cleanDomain,
    score,
    checks,
    recommendations,
    checkedAt: new Date().toISOString(),
  });
}
