/**
 * Pure transport-selection rule for interactive sends, kept import-free so
 * it's trivially unit-testable.
 *
 * Send via the owner's OWN SMTP only when their mailbox is a custom
 * IMAP/SMTP one with stored credentials. OAuth mailboxes (gmail/outlook)
 * are read-only grants — they fall through to Resend (with the owner's
 * address as From) until send scopes are added + users re-consent.
 */
export function shouldUseOwnerSmtp(
  mailbox: { provider: string; smtpHost: string | null; secretEncrypted: string | null } | null,
): boolean {
  return (
    !!mailbox &&
    mailbox.provider === "smtp_custom" &&
    !!mailbox.smtpHost &&
    !!mailbox.secretEncrypted
  );
}
