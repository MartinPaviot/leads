/**
 * ICP pre-fill from the founder's email domain (P0-3 task 3.8).
 *
 * Most founders' company domain → industry + size mapping is
 * high-signal. Instead of asking phase-1 questions blank, we look
 * up the company we already know about (via the existing
 * `companies` table populated by the OAuth + enrichment flow) and
 * pre-fill the ICP form with the values our system already
 * inferred.
 *
 * The pre-fill is suggestive, not prescriptive : the wizard
 * surfaces the values as defaults the founder can edit. They keep
 * the floor of "0 typing required to advance phase 1".
 *
 * Pure : the lookup function takes a database query interface so
 * the same fn drives the API route + tests without spinning Postgres.
 */

import { resolvePlaybook } from "./playbooks";

export interface IcpPrefillSuggestion {
  /** Industry — falls back to playbook label when company industry
   *  isn't set. */
  industry: string;
  /** Size range : "11-50 employees" style. */
  sizeRange: string;
  /** Buyer persona inferred from the playbook (e.g. "Head of
   *  Engineering" for devtools). */
  buyerPersona: string;
  /** ICP one-liner ("VC-backed devtools 11-50 selling AI infra to
   *  Head of Engineering"). Pre-fill of the textarea. */
  raw: string;
  /** Where each piece came from — surfaced in the UI as a small
   *  "From your company on file" hint. */
  sources: {
    industry: "company" | "playbook" | "none";
    sizeRange: "company" | "default" | "none";
    buyerPersona: "playbook" | "none";
  };
}

export interface CompanyForPrefill {
  name: string | null;
  domain: string | null;
  industry: string | null;
  size: string | null; // "11-50", "51-200", etc.
  description: string | null;
}

const SIZE_DEFAULT = "11-50 employees";

/**
 * Pure : derive the ICP suggestion. Inputs are the founder-resolved
 * company row + the playbook fallback. When the company row is
 * absent or sparse, the playbook fills the gap. Returns the
 * suggestion + per-field source attribution.
 */
export function buildIcpPrefill(
  company: CompanyForPrefill | null,
): IcpPrefillSuggestion {
  const industry = company?.industry?.trim() || "";
  const sizeRaw = company?.size?.trim() || "";
  const playbook = resolvePlaybook(industry || company?.description || null);

  const industryFinal = industry || playbook.label;
  const sizeFinal = sizeRaw ? `${sizeRaw} employees` : SIZE_DEFAULT;

  // Buyer persona : the playbook's signals lean on a specific
  // persona ; we extract it from the playbook label heuristically.
  // Devtools → "Head of Engineering", Fintech → "VP Operations", etc.
  const buyerPersona = inferBuyerPersona(playbook.slug);

  const raw = composeOneLineIcp({
    industry: industryFinal,
    size: sizeFinal,
    buyerPersona,
    companyName: company?.name ?? null,
  });

  return {
    industry: industryFinal,
    sizeRange: sizeFinal,
    buyerPersona,
    raw,
    sources: {
      industry: industry ? "company" : industryFinal === playbook.label ? "playbook" : "none",
      sizeRange: sizeRaw ? "company" : "default",
      buyerPersona: "playbook",
    },
  };
}

/**
 * Lift the persona from the playbook slug. Mapped explicitly so
 * additions to the playbook registry are easy to mirror here. The
 * default "VP Sales" is the reasonable B2B SaaS fallback.
 */
function inferBuyerPersona(slug: string): string {
  switch (slug) {
    case "devtools":
      return "Head of Engineering";
    case "fintech":
      return "VP Finance";
    case "healthtech":
      return "Director of Clinical Operations";
    case "ecommerce":
      return "Head of Growth";
    case "b2b-saas-ops":
    default:
      return "VP Sales";
  }
}

/**
 * Compose the one-line ICP textarea seed. The shape mirrors the
 * placeholder "VC-backed devtools 11-50 selling AI infra to Head of
 * Engineering, US-based" so it reads coherent in the form.
 */
function composeOneLineIcp(args: {
  industry: string;
  size: string;
  buyerPersona: string;
  companyName: string | null;
}): string {
  const sizeStr = args.size.replace(/ employees$/i, "");
  return `${args.industry} companies (${sizeStr}) selling to ${args.buyerPersona}${
    args.companyName ? ` — same shape as ${args.companyName}` : ""
  }`;
}

/**
 * Domain → company-name guess. When the founder's email is
 * `pat@acme.io` and we have no `companies` row for `acme.io`, we
 * still want to display *something* in the pre-fill. This synth
 * fills the gap : strip the TLD, capitalise. Best-effort only.
 */
export function domainToCompanyName(domain: string): string {
  const trimmed = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const naked = trimmed.replace(/^www\./, "");
  const root = naked.split(".")[0] ?? naked;
  if (!root) return "";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

/**
 * Derive the founder's domain from their auth email. Returns null
 * when the email is missing or shaped unexpectedly.
 */
export function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return null;
  // Reject obvious free-mail providers — pre-filling from "gmail.com"
  // would surface a useless ICP.
  const FREEMAIL = new Set([
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "live.com",
    "msn.com",
  ]);
  if (FREEMAIL.has(domain)) return null;
  return domain;
}
