import { redirect } from "next/navigation";

/**
 * P0-1 task 1.9 — legacy per-sequence review page redirect.
 *
 * The original `/sequences/[id]/review` was a per-sequence outbound-
 * email viewer that pre-dated the global draft-approval queue
 * shipped in P0-1 task 1.3 (`/sequences/review`). The new queue is
 * the canonical surface : it fans across every sequence, supports
 * the full lifecycle (approve / reject / edit / expire), feeds the
 * rejection learner, and respects the version-stamp optimistic
 * lock.
 *
 * Rather than maintain two surfaces in parallel, this page now
 * redirects to the new queue with the sequenceId pre-filled in the
 * filter — the founder lands on the same scope they expected,
 * without surface-drift.
 *
 * Done as a Next.js server component so the redirect is instant
 * (no client-side flash) and search engines / link previews
 * resolve cleanly.
 */
export default async function LegacyReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/sequences/review?sequenceId=${encodeURIComponent(id)}`);
}
