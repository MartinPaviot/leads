-- Team inbox live presence (INBOX-X03). Additive: a new table, safe to apply any
-- time. getViewers/heartbeat read it DEFENSIVELY (try/catch → no presence) so the
-- inbox runs identically until this is applied.
CREATE TABLE IF NOT EXISTS public.inbox_presence (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id),
  conversation_key text NOT NULL,
  user_id text NOT NULL,
  state text NOT NULL DEFAULT 'viewing',
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_presence_uniq
  ON public.inbox_presence (tenant_id, conversation_key, user_id);
CREATE INDEX IF NOT EXISTS inbox_presence_key_idx
  ON public.inbox_presence (tenant_id, conversation_key);
