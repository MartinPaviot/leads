/**
 * Pure pre-condition for `detectSequenceReply` (kept out of email-capture.ts so it's
 * unit-testable without the db/inngest imports).
 *
 * A reply is matched to a tracked outbound by threadId ALONE — the contact is read
 * from the matched sent email (`outbound.contactId`), so the inbound SENDER does not
 * need to resolve to a known contact. Detection requires only a threadId.
 *
 * Bug this guards against (regression): the original guard also required
 * `opts.contactId`, but the inbound-capture path returns `contactId=null` for an
 * unresolved sender (`unresolved_sender`). So a genuine reply on a tracked thread,
 * from a sender we hadn't created as a contact, was silently dropped before the
 * threadId lookup ran — starving the reply loop (processReply → reply-handler →
 * hot-lead alert).
 */
export function canDetectReplyFromThread(opts: { threadId?: string | null }): boolean {
  return Boolean(opts.threadId);
}
