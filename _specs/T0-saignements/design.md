# T0 — Saignements arrêtés — Design

## System fit

Dépendances sur :
- Next.js App Router (API routes + pages)
- Drizzle ORM + Postgres
- NextAuth credentials provider (T0.8)
- Resend (emails T0.8)
- Sonner/toast (UI feedback)
- bcryptjs (password hashing T0.8)

Impact sur :
- `/api/onboarding/status` + `/save` (T0.1, T0.2)
- `onboarding-wizard.tsx` (T0.2)
- `home/page.tsx` (T0.3)
- `chat/page.tsx` (T0.4)
- `accounts/page.tsx` (T0.5, T0.6)
- `(marketing)/page.tsx` (T0.7)
- `sign-in/page.tsx` (T0.8 link)
- Nouveaux : `lib/password-reset.ts`, `lib/rate-limit.ts` (if absent), `lib/emails/password-reset.ts`, `lib/chunk-bulk.ts`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/api/auth/forgot-password/route.ts`, `app/api/auth/reset-password/route.ts`.

## Data model

Migration `drizzle/0009_password_reset_tokens.sql` :

```sql
CREATE TABLE "password_reset_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "requested_ip" text,
  "requested_user_agent" text
);
CREATE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens" ("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" ("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" ("expires_at");
```

Schema Drizzle : ajouter `passwordResetTokens` à `db/schema.ts`.

Migration `drizzle/0010_fix_challenge_label.sql` (T0.3) :

```sql
UPDATE tenants SET settings = jsonb_set(settings, '{challenge}', '"Finding leads"')
WHERE settings->>'challenge' = 'Finding the right leads';
```

Settings ajouté : `tenants.settings.onboardingCurrentStep` (T0.2, clé JSON optionnelle, pas de schema change).

## API contracts

**T0.1** `GET /api/onboarding/status` — même shape, seul `needsOnboarding` change de formule.

**T0.2** `POST /api/onboarding/save` — accepter additionnel `{ step: "_current", currentStep: string }`.

**T0.8** :
- `POST /api/auth/forgot-password` → `{ email: string }` → toujours `{ ok: true }` (silent).
- `POST /api/auth/reset-password` → `{ token: string, password: string }` → `{ ok: true }` | `{ error: string, status: 400 | 500 }`.

## Data flow (T0.8)

```
User sign-in page
  → click "Forgot password?"
  → /forgot-password (enter email)
  → POST /api/auth/forgot-password
     → lookup authUsers by email (normalized)
     → if exists: createResetTokenForUser (invalidates prior, insert new, ttl 1h)
     → sendPasswordResetEmail via Resend
     → always return { ok: true } (enum protection)
  → email link /reset-password?token=<token>
  → user clicks link
  → /reset-password page (enter new password)
  → POST /api/auth/reset-password
     → validateResetToken (hash compare, not expired, not used)
     → bcrypt hash password
     → update authAccounts.access_token where provider=credentials
     → consumeResetToken (mark used)
     → sendPasswordChangedEmail (notification)
     → return { ok: true }
  → redirect /sign-in?reason=password-reset-success
```

## Failure handling

- **T0.1/T0.2** : if DB write fails → log + 500. Status route failure shouldn't block UI (existing behaviour).
- **T0.4 chat** : toast visible to user, card state reverted to pending (retry), `console.warn("chat: approveCard failed")`.
- **T0.5 chunks** : each chunk failure independent; errors collected; final toast reports partial success.
- **T0.8 tokens** : bcrypt failure → 500. Email send failure → log error, still return ok (don't leak to user who maybe guessed email). Consume token only AFTER bcrypt update succeeds.

## Security

- T0.8: SHA-256 token hash stored, never plain token.
- T0.8: 32 bytes crypto randomness (base64url).
- T0.8: TTL 1h (strict).
- T0.8: Rate limit email+IP.
- T0.8: Timing-safe comparison (hash compared after DB lookup).
- T0.8: Enumeration protection — always return ok.
- T0.8: Password policy ≥10 chars + digit + upper + lower (v1).
- T0.8: Notification email after successful reset.

## Reversibility

Tous les fixes sont additive ou tiny edits. Migration 0009 est additive (nouvelle table, drop safe). Migration 0010 est data-only (UPDATE label); reversible via UPDATE inverse.
