/**
 * Resolve the second keystroke of the `m`-then-key mailbox quick-switch
 * (INBOX-K05). `0` or `a` selects "All inboxes" (null target); `1`–`9` selects
 * that mailbox by 1-based position in the rail. Any other key — or a digit past
 * the end of the list — is a no-op (returns null).
 *
 * Pure so the two-key state machine in the inbox page can be tested without a DOM.
 * The wrapping object distinguishes "switch to All" ({ target: null }) from
 * "do nothing" (null).
 */
export function resolveMailboxShortcut(
  key: string,
  mailboxIds: string[],
): { target: string | null } | null {
  if (key === "0" || key === "a") return { target: null };
  if (/^[1-9]$/.test(key)) {
    const id = mailboxIds[Number(key) - 1];
    return id ? { target: id } : null;
  }
  return null;
}
