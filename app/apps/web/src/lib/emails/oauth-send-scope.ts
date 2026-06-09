/**
 * Pure scope-gate for sending via a user's OAuth account.
 *
 * We send via the owner's real Gmail/Graph API ONLY when their stored
 * grant (auth_account.scope) actually includes the send scope — so users
 * who connected before send scopes were requested keep sending via Resend
 * (no failed sends) until they reconnect. Kept import-free for testing.
 */

export const GOOGLE_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const MICROSOFT_SEND_SCOPE = "Mail.Send";

/** True if the stored Google grant can send mail (gmail.send present). */
export function scopeAllowsGoogleSend(scope: string | null | undefined): boolean {
  if (!scope) return false;
  // Match the scope token exactly (space-delimited) — substring would also
  // accept gmail.send; the full URL is what Google returns, but accept the
  // short form too for robustness.
  return /(^|\s)https:\/\/www\.googleapis\.com\/auth\/gmail\.send(\s|$)/.test(scope) ||
    /(^|\s)gmail\.send(\s|$)/.test(scope);
}

/** True if the stored Microsoft grant can send mail (Mail.Send present). */
export function scopeAllowsMicrosoftSend(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return /(^|\s)Mail\.Send(\s|$)/i.test(scope);
}
