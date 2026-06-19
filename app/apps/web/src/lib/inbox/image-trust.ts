/**
 * Per-sender "always show images" trust (INBOX-R02), client-safe + pure.
 *
 * Remote images are blocked by default (no IP / "opened" leak). Once a user
 * trusts a sender, their images auto-load on every future message — without
 * re-clicking "load images" each time. The trusted set is a list of lowercased
 * email addresses and/or `@domain` entries, persisted per-user in the
 * user_preferences JSONB store (see image-trust-store.ts — server-only).
 *
 * This module holds ONLY the pure matching logic so it can be imported by the
 * client pane without pulling the db in. Unit-tested.
 */

/** "Name <a@b.com>" / "a@b.com" -> "a@b.com" (lowercased), else "". */
export function extractSenderEmail(from: string): string {
  const angled = /<([^>]+)>/.exec(from || "");
  const raw = (angled ? angled[1] : from || "").trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(raw) ? raw : "";
}

/** Is this sender trusted to auto-load images? Matches the exact address or its
 *  domain (`@example.com`). Empty/unparseable sender ⇒ not trusted. */
export function isImageSenderTrusted(trusted: string[], from: string): boolean {
  const email = extractSenderEmail(from);
  if (!email) return false;
  const set = new Set((trusted || []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (set.has(email)) return true;
  const domain = email.split("@")[1];
  return !!domain && set.has(`@${domain}`);
}
