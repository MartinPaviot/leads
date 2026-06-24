-- Spec 17 — email deliverability verification status on contacts.
-- Additive + idempotent + nullable (NULL = not yet verified). The pre-send gate
-- (lib/guardrails/sending-gate.ts) reads it to block KNOWN-invalid recipients;
-- strict valid-only is the eventual state once the verification job populates it.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_status text;
