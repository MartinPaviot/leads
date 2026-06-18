-- Deal split: project bookings vs platform ARR (B2, _specs/pilae-machine/spec-v2.md).
--
-- Pilae sells a one-time project (consulting, build) AND a recurring
-- platform component. Conflating them into a single `value` blurs the
-- ARR-eligible portion in every report and makes "what's our actual
-- recurring revenue base?" ambiguous. The split keeps the two streams
-- distinguishable end-to-end.
--
-- `deals.value` stays as a legacy column so deals created before this
-- migration keep displaying correctly. Consumers must route through
-- `lib/deals/amount.ts#getDealAmountDisplay()` which decides whether
-- the new split fields apply, never implicitly summing them into the
-- legacy field. See _specs/pilae-machine/spec-v2.md R8.4 / guard-rail 5.
--
-- Idempotent. Hand-crafted (drizzle-kit journal stuck at 0014).

ALTER TABLE deals ADD COLUMN IF NOT EXISTS project_amount INTEGER;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS platform_arr INTEGER;
