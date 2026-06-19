-- Team inbox (INBOX-X01) — opt-in shared mailbox visibility.
--
-- Adds connected_mailboxes.shared. Additive + safe to apply any time: a constant
-- DEFAULT false means no table rewrite (Postgres 11+) and zero behaviour change
-- until a mailbox is explicitly shared. getInboxScope reads this column
-- DEFENSIVELY (try/catch → personal-only) so the app runs identically whether or
-- not this migration has been applied.
ALTER TABLE public.connected_mailboxes
  ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;
