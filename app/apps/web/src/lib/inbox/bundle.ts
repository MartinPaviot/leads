/**
 * Newsletter / promo bundling for the inbox (INBOX-T03).
 *
 * Groups bulk mail (already classified `isBulk` by `classifyInboundSender`) into
 * one collapsible source per sender, so subscription noise never competes with
 * real conversations in the attention lane. Pure + unit-tested — the `lane=bundles`
 * view, bulk-triage endpoint, and UI are the wiring on top (residual).
 *
 * Grounded in protocol signals (List-Unsubscribe / Precedence), never content
 * guessing, and NEVER bundles a conversation that has any outbound from us — a
 * real thread always wins over the bulk heuristic.
 */

export interface BundleInput {
  key: string;
  fromAddress: string;
  subject: string;
  lastMessageAt: string | null;
  /** Last inbound classified bulk / automated_marketing. */
  isBulk: boolean;
  /** Any outbound from us in the thread → it is a real conversation, not noise. */
  hasOutbound: boolean;
  /** Protocol reason for the "why bundled" tooltip (no vendor name). */
  whyBundled?: string;
}

export interface BundleSource {
  /** Grouping key — the sender address, lowercased. */
  sender: string;
  /** Display label (sender domain, e.g. "substack.com"). */
  label: string;
  count: number;
  latestSubject: string;
  latestAt: string | null;
  whyBundled: string;
  keys: string[];
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

/** Group bulk conversations into one source per sender, newest source first. */
export function bundleConversations(items: BundleInput[]): BundleSource[] {
  const bySender = new Map<string, BundleSource>();

  for (const it of items) {
    if (!it.isBulk || it.hasOutbound) continue; // real threads + non-bulk stay in lanes
    const sender = (it.fromAddress || "").trim().toLowerCase();
    if (!sender) continue;

    let src = bySender.get(sender);
    if (!src) {
      src = {
        sender,
        label: domainOf(sender),
        count: 0,
        latestSubject: it.subject,
        latestAt: it.lastMessageAt,
        whyBundled: it.whyBundled ?? "bulk mailing-list headers",
        keys: [],
      };
      bySender.set(sender, src);
    }
    src.count++;
    src.keys.push(it.key);
    // Keep the most recent subject/time as the source preview.
    if ((it.lastMessageAt ?? "") > (src.latestAt ?? "")) {
      src.latestAt = it.lastMessageAt;
      src.latestSubject = it.subject;
    }
  }

  return [...bySender.values()].sort((a, b) => (b.latestAt ?? "").localeCompare(a.latestAt ?? ""));
}
