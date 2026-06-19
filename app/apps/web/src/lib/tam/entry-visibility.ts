/**
 * The TAM proposal review flow ("Proposals (n)" button on the Accounts
 * header -> /tam/review) surfaces the approval queue to the founder.
 *
 * It is enabled everywhere, including production, because the entry is
 * already count-gated at the call site: the button only renders when
 * there are pending proposals (`proposalCount > 0`), so an empty queue
 * shows nothing — no early-stage noise. Leaving it dev-only (the old
 * NODE_ENV gate from #160) had the cron keep proposing in production
 * while nothing surfaced them, so proposals accumulated with no human
 * consumer — a silent violation of "no data without a consumer", and of
 * the methodology's promise that additions "arrive through an approval
 * queue: the decisions come to you" (The Method, steps 5 and 18).
 *
 * A founder who sees a weak proposal simply rejects it: that human gate
 * is the point, and it is strictly better than proposals piling up
 * unreviewed and invisible. The /tam/review page and the proposal
 * APIs/crons were always live; only this entry link was hidden.
 */
export const TAM_PROPOSALS_ENTRY_ENABLED = true;
