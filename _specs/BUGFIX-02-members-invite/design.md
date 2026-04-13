# Design — BUGFIX-02

## Fit dans le système
Auth utilise NextAuth (`/sign-up`, `/sign-in` existants). Schéma DB via Drizzle (`apps/web/src/db/schema.ts`). Email send via Resend (`process-transcript`, `email-send-worker` montrent l'usage). On ajoute une table `pendingInvites`, un endpoint `/api/settings/members/invite`, une page `/accept-invite`, et on patch sign-up pour consommer un token.

## Data model — nouvelle table `pending_invites`
```ts
// apps/web/src/db/schema.ts (ajout)
export const pendingInvites = pgTable("pending_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),  // "member" | "admin"
  token: text("token").notNull().unique(),         // crypto.randomBytes(24).toString("base64url")
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  status: text("status").notNull().default("pending"),  // "pending" | "accepted" | "cancelled" | "expired"
  expiresAt: timestamp("expires_at").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  lastSentAt: timestamp("last_sent_at").notNull().defaultNow(),
  resendCount: integer("resend_count").notNull().default(0),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  byTenantStatus: index("pending_invites_tenant_status_idx").on(t.tenantId, t.status),
  uniqueTenantEmail: uniqueIndex("pending_invites_tenant_email_uniq")
    .on(t.tenantId, t.email)
    .where(sql`status = 'pending'`),
}));
```

Migration Drizzle : `pnpm drizzle-kit generate` puis `pnpm drizzle-kit push` ou via scripts existants.

## API contracts

### `POST /api/settings/members/invite`
**Auth :** `getAuthContext` + `requireAdmin`
**Body :** `{ email: string, role: "member" | "admin" }`
**Logique :**
1. Validate email regex + role enum
2. Lowercase + trim email
3. Check `users` table : si email déjà membre du tenant → 400
4. Check `pending_invites` : si pending existe → update role + token reuse + resend
5. Sinon : insert avec token = `crypto.randomBytes(24).toString("base64url")`, expiresAt = +7d
6. Send email via Resend avec lien `${APP_URL}/accept-invite?token=${token}`
7. Return 201 `{ invite: { id, email, role, expiresAt } }`

### `GET /api/settings/members/invites`
**Auth :** `getAuthContext` (admin pas requis pour read — on autorise tous les members à voir qui est invité)
**Logique :** SELECT * FROM pending_invites WHERE tenantId = ? AND status = 'pending'
**Response :** `{ invites: [{ id, email, role, sentAt, expiresAt, lastSentAt, resendCount }] }`

### `POST /api/settings/members/invites/[id]/resend`
**Auth :** `requireAdmin`
**Logique :**
1. Find invite, check status = pending, resendCount < 3
2. Resend email, increment resendCount, set lastSentAt = now
3. Return 200

### `DELETE /api/settings/members/invites/[id]`
**Auth :** `requireAdmin`
**Logique :** Set status = 'cancelled', updatedAt = now (soft delete pour audit). Return 200.

### `GET /api/auth/invite/[token]`
**Auth :** none (token is the auth)
**Logique :**
1. Find invite by token, status = pending, expiresAt > now
2. Return `{ valid: true, tenant: {name}, role, email }` ou `{ valid: false, reason: "expired" | "cancelled" | "not_found" }`

### `POST /api/auth/invite/accept`
**Auth :** session NextAuth (user déjà signed up — sign-up flow handles new users)
**Body :** `{ token }`
**Logique :**
1. Find invite valid by token
2. Update `users.tenantId = invite.tenantId`, `users.role = invite.role`
3. Update `pending_invites.status = 'accepted'`, `acceptedAt = now`
4. Return 200 `{ tenantId, role }`

## Data flow (happy path)
1. Admin → POST `/api/settings/members/invite` → DB insert + Resend email
2. Bob (anonyme) → GET `/accept-invite?token=...` → page valide token via `/api/auth/invite/[token]`
3. Bob → click "Sign up to accept" → `/sign-up?invite=<token>` (email pré-rempli, hidden token field)
4. Bob complète sign-up → server-side detect token → user créé directement avec `tenantId` + `role` du token (pas le default "new tenant" flow)
5. Sign-up handler appelle `/api/auth/invite/accept` après création user
6. Bob redirect → `/home`

## Edits côté UI

### `members/page.tsx` — handler + section invites
- Ajouter `onClick` au bouton Invite : `handleInvite()` POST + reset state + reload invites
- Ajouter state `invites: PendingInvite[]`, fetch au mount via `/api/settings/members/invites`
- Nouvelle section "Pending invitations" sous le form invite : list avec Resend/Cancel buttons + role badge + expiresAt
- Toast `useToast()` pour feedback success/error
- Disable bouton si user pas admin (lire `role` depuis context ou `/api/me`)

### `/accept-invite/page.tsx` — nouvelle page
- Lit token de l'URL, appelle `/api/auth/invite/[token]`
- Si valide + user non-loggé : redirige vers `/sign-up?invite=<token>`
- Si valide + user loggé : affiche "Switch to <workspace> as <role>?" → confirm → POST accept → redirect `/home`
- Si invalide : message d'erreur

### `sign-up/page.tsx` — supporter `?invite=<token>`
- Si query `invite` présent : pré-remplir email (depuis API GET token info), hidden field token
- Server action sign-up : si token présent, créer user avec `tenantId` + `role` du token au lieu du flux "new tenant", puis call accept-invite

## Email template
Sujet : `You've been invited to join <workspace> on Elevay`
Body HTML simple :
```
<p>Hi,</p>
<p>{inviterName} invited you to join <strong>{workspaceName}</strong> on Elevay as a {role}.</p>
<p><a href="{acceptLink}">Accept invitation</a></p>
<p>This link expires on {expiresAt}.</p>
```

## Failure handling
- Email send fail (Resend down) → marquer invite avec `lastSentError`, retourner 500 mais garder l'invite en DB pour resend manuel
- Token expiré → page d'erreur claire avec instruction
- DB unique constraint violation (race condition) → catch + retry resend logic

## Security
- Token : 24 bytes random base64url (192 bits) — collision impossible
- Token usage one-shot : expiré après acceptedAt set, vérification `status = 'pending'` à chaque check
- Rate limit : `requireAdmin` + max 3 resends par invite + max 50 invites par tenant par jour (à implémenter dans middleware ou dans le handler)
- Pas d'enumeration : si email déjà membre, 400 explicite (admin a le droit de savoir, pas un risque public)
- HTTPS obligatoire pour le lien (token dans URL) — déjà standard sur la prod

## Observabilité
- Log toute invite + acceptance via PostHog event `member_invited`, `member_joined`
- Compteurs notifications.preferences pour `team_invitations` (futur — hors scope strict)
