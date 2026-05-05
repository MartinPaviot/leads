import { extractDomain } from "@/lib/util/email";

/**
 * S7 — pick the best inbox deep-link buttons to surface on
 * `/verify-email-sent` based on the user's email domain.
 *
 * The list returned is ordered by relevance — the first entry is the
 * provider's own webmail (likely match) and the rest are sensible
 * fallbacks. We never include providers that don't match the user's
 * domain unless we couldn't identify the provider at all (then we fall
 * back to a generic Gmail+Outlook pair, which covers ~80% of the B2B
 * universe).
 */
export interface InboxDeepLink {
  provider: "gmail" | "outlook" | "yahoo" | "icloud" | "fastmail" | "proton";
  label: string;
  url: string;
}

const DEEP_LINKS: Record<InboxDeepLink["provider"], InboxDeepLink> = {
  gmail: {
    provider: "gmail",
    label: "Open Gmail",
    url: "https://mail.google.com/mail/u/0/#inbox",
  },
  outlook: {
    provider: "outlook",
    label: "Open Outlook",
    url: "https://outlook.live.com/mail/0/inbox",
  },
  yahoo: {
    provider: "yahoo",
    label: "Open Yahoo Mail",
    url: "https://mail.yahoo.com/d/folders/1",
  },
  icloud: {
    provider: "icloud",
    label: "Open iCloud Mail",
    url: "https://www.icloud.com/mail",
  },
  fastmail: {
    provider: "fastmail",
    label: "Open Fastmail",
    url: "https://app.fastmail.com/mail/Inbox/",
  },
  proton: {
    provider: "proton",
    label: "Open Proton Mail",
    url: "https://mail.proton.me/u/0/inbox",
  },
};

/**
 * Match a domain to its webmail provider. Returns null when the domain
 * doesn't belong to a consumer webmail provider — in that case the user
 * is on a corporate / custom domain and we can't deep-link them.
 */
export function detectInboxProvider(
  domain: string | null
): InboxDeepLink["provider"] | null {
  if (!domain) return null;
  const d = domain.toLowerCase();
  if (d === "gmail.com" || d === "googlemail.com") return "gmail";
  if (
    d === "outlook.com" ||
    d === "hotmail.com" ||
    d === "live.com" ||
    d === "msn.com"
  ) {
    return "outlook";
  }
  if (d === "yahoo.com" || d.endsWith(".yahoo.com")) return "yahoo";
  if (d === "icloud.com" || d === "me.com" || d === "mac.com") return "icloud";
  if (d === "fastmail.com" || d === "fastmail.fm") return "fastmail";
  if (d === "proton.me" || d === "protonmail.com" || d === "pm.me") return "proton";
  // Domains running on Google Workspace (most B2B SaaS hosts) typically
  // accept the Gmail webmail UI for the user's account, so we surface it
  // as a hint. Detecting this for sure needs an MX lookup we don't want
  // to do server-side on every page load — handled at the caller via
  // resolveInboxDeepLinks() fallback list instead.
  return null;
}

/**
 * Pick the deep-link buttons to render. For known consumer providers
 * we surface only the matching one (no UI noise). For unknown / corp
 * domains we surface Gmail + Outlook, which together cover Google
 * Workspace and Microsoft 365 — the two backends behind the vast
 * majority of corporate inboxes.
 */
export function resolveInboxDeepLinks(email: string): InboxDeepLink[] {
  const provider = detectInboxProvider(extractDomain(email));
  if (provider) {
    return [DEEP_LINKS[provider]];
  }
  return [DEEP_LINKS.gmail, DEEP_LINKS.outlook];
}
