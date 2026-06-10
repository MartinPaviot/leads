# Workspace membership surgery — 2026-06-10

Tenant 47dca783-dac0-45a5-85cb-d217b2a3174d ("E2E Test Workspace" = the real working tenant).
Request: martin.paviot@pilae.ch sole owner; remove the 2 non-Pilae members.

Inspected first (read-only): full FK scan (24 columns referencing users.id).
Blast radius: test@leadsens.com → 2 notifications; martin@elevay.dev → 9 chat_threads, 2 notes, 2 notifications, 1 notification_preferences. No deals/calls/sequences owned.

Applied in ONE transaction (_apply-pilae-owner.mjs, identity-guarded):
- chat_threads (9) + notes (2) reassigned elevay → pilae (content kept)
- notifications (4) + notification_preferences (1) deleted (per-user inbox)
- users rows deleted: test@leadsens.com, martin@elevay.dev
- auth_user deleted for both (sessions+accounts cascade → logins dead)
- martin.paviot@pilae.ch role → admin (the app's top role; code has no "owner" — gates test role === "admin", see lib/auth/admin-only.ts)

After: single member martin.paviot@pilae.ch (admin). No pending invites.
