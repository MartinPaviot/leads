/**
 * Pure totals decision for the Pilae Bookings panel (P1 26 hydration fix).
 *
 * Extracted from page.tsx so the empty-vs-filled decision is unit-testable
 * without rendering the client component. The Bookings panel was H2: with
 * zero deals it rendered formatDealAmount(0) = "—" and a 0% bar instead of a
 * written empty state (unlike the Funnel "No deals yet." and Capacity panels).
 * `hasBookings` drives that empty state at the call-site.
 *
 * Anti-ARR (R11.3) is preserved: project and platform are summed separately
 * and never blended into a single "ARR" figure here — `totalBookings` is a
 * bookings total, surfaced under the "Bookings" label only.
 */

export const BOOKINGS_TARGET_CENTS = 100_000_000; // 1 000 000 € target (in cents)

export type BookingsStageRow = {
  stage: string;
  projectBookings: number;
  platformArr: number;
  totalBookings: number;
  dealCount: number;
};

export type BookingsTotals = {
  projectTotal: number;
  platformTotal: number;
  /** Legacy single-bag bookings (deals carrying only `value`), folded into
   *  the total but called out separately so they can be re-tagged. */
  legacyTotal: number;
  totalBookings: number;
  /** Bookings sum as a % of the 1 M€ target, clamped to [0, 100]. */
  pctOfTarget: number;
  /** True when there is at least one euro of bookings to show. Drives the
   *  written empty state — false → render "No bookings yet" instead of "—". */
  hasBookings: boolean;
};

export function bookingsTotals(bookings: BookingsStageRow[]): BookingsTotals {
  const projectTotal = bookings.reduce((acc, b) => acc + b.projectBookings, 0);
  const platformTotal = bookings.reduce((acc, b) => acc + b.platformArr, 0);
  const legacyTotal =
    bookings.reduce((acc, b) => acc + b.totalBookings, 0) -
    projectTotal -
    platformTotal;
  const totalBookings = projectTotal + platformTotal + legacyTotal;
  const pctOfTarget = Math.max(
    0,
    Math.min(100, Math.round((totalBookings / BOOKINGS_TARGET_CENTS) * 100)),
  );
  return {
    projectTotal,
    platformTotal,
    legacyTotal,
    totalBookings,
    pctOfTarget,
    hasBookings: totalBookings > 0,
  };
}
