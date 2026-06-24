-- Spec 35 — permanence enforcement (R4.1/R4.3). opt_out and complaint
-- suppressions are consent records that NO actor (user, admin, API, or even a
-- migration/owner) may delete or weaken. RLS cannot bind the owner role, so this
-- uses a BEFORE DELETE OR UPDATE row trigger — the project's first trigger.
-- manual_dnc / existing_customer / hard_bounce stay admin-deactivatable (R4.2):
-- they are NOT in the frozen set, so flipping their status to 'inactive' is
-- allowed. Idempotent (CREATE OR REPLACE + DROP/CREATE TRIGGER).

CREATE OR REPLACE FUNCTION suppression_guard_permanent() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type IN ('opt_out', 'complaint') THEN
      RAISE EXCEPTION 'suppression_permanent_immutable: cannot delete a % suppression', OLD.type
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: block any weakening of a frozen row. Allowed on frozen rows: reason
  -- edits and re-asserting status='active' (idempotent re-ingest). Blocked:
  -- changing identity/type/permanence/cool-off, or deactivating.
  IF OLD.type IN ('opt_out', 'complaint') THEN
    IF NEW.type      IS DISTINCT FROM OLD.type
       OR NEW.value  IS DISTINCT FROM OLD.value
       OR NEW.level  IS DISTINCT FROM OLD.level
       OR NEW.permanent IS DISTINCT FROM OLD.permanent
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.status <> 'active' THEN
      RAISE EXCEPTION 'suppression_permanent_immutable: cannot weaken a % suppression', OLD.type
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS suppression_permanence_guard ON suppression;
CREATE TRIGGER suppression_permanence_guard
  BEFORE DELETE OR UPDATE ON suppression
  FOR EACH ROW EXECUTE FUNCTION suppression_guard_permanent();
