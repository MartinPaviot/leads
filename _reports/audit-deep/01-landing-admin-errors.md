# Audit approfondi — Landing, Admin, Erreurs

## ZONE 1 — Landing / Marketing

### 1.1 Fichiers
- `apps/web/src/app/(marketing)/layout.tsx` (31 lignes)
- `apps/web/src/app/(marketing)/page.tsx` (448 lignes)
- `apps/web/src/app/layout.tsx` (47 lignes, racine)
- `apps/web/src/app/global-error.tsx` (47 lignes)

Pas de `page.tsx` à la racine `app/` — le middleware gère la redirection.

### 1.2 Routing racine
**Middleware** (`middleware.ts:83-89`) :
```ts
if (pathname === "/") {
  if (req.auth?.user) {
    return NextResponse.redirect(new URL("/home", req.url));
  }
  return NextResponse.next();
}
```
- `/` authentifié → `/home`
- `/` anonyme → landing marketing
- Pas de redirect vers `/sign-in` : le middleware laisse passer.

### 1.3 Landing page — état actuel
- Page marketing complète : hero, "Why Elevay", "Foundations", "How it works" (7 étapes), FAQ, CTAs multiples
- CTAs :
  - "Try free" → `/sign-up` (lignes 214, 228, 354, 362)
  - "Log in" → `/sign-in` (ligne 213)
  - "Book a demo" → Calendly via constante `CALENDLY_URL` (ligne 21)
  - Section "See Elevay in action" (lignes 296-309) avec demo + "try it yourself"
- Stack : Framer Motion (fadeInUp, Section wrapper, Animate wrapper), icônes Lucide
- Pas d'API calls — landing auto-contenue, pas de data dynamique
- Pitch principal (ligne 224) : "Your CRM finds customers, joins your calls, and does the work for you"
- Metadata : `Elevay — The Autonomous GTM Engine for Founders`

### 1.4 Root layout (`layout.tsx:35-47`)
- Metadata basique (title, description, OG, robots index)
- Aucun provider (ThemeProvider, ToastProvider, PostHogPageTracker sont uniquement dans dashboard)

### 1.5 Manquant / Blocages
- Pas de 404 custom visible sous `app/`
- Root error boundary minimaliste (`global-error.tsx`)
- Absence de fallback si `/` ne rend rien — dépend 100 % du middleware

### 1.6 Points forts
- Landing animée, responsive
- CTAs multiples et clairs
- Middleware route proprement auth vs non-auth
- SEO basique correct

---

## ZONE 2 — Routes admin

### 2.1 Gate centralisée
**Fichier :** `apps/web/src/lib/auth-utils.ts` (42 lignes)
```ts
export async function requireAdmin(authCtx: AuthContext): Response | null {
  if (authCtx.role !== "admin") {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
```
- `getAuthContext()` extrait `session.role` du JWT (ligne 20)
- Rôle par défaut : `"member"` (ligne 29)
- **Gate exclusivement backend** — aucune gate UI

### 2.2 Routes admin identifiées

**1. `/api/admin/purge-fake-data`** — `apps/web/src/app/api/admin/purge-fake-data/route.ts` (137 lignes)
- `requireAdmin()` ligne 18-19 ✓
- Nettoie les entreprises enrichies par LLM (non-Apollo), réenrichit via Apollo
- Supporte `{ dryRun: false }` (lignes 37-45)

**2. `/settings/evals`** — `apps/web/src/app/(dashboard)/settings/evals/page.tsx` (387 lignes)
- **`"use client"` sans aucune gate UI**
- Appelle `/api/eval/datasets`, `/api/eval/runs`, `/api/eval/seed`
- **À vérifier si ces endpoints sont protégés backend — probablement non**

**3. `/settings/mcp`** — `apps/web/src/app/(dashboard)/settings/mcp/page.tsx` (495 lignes)
- **`"use client"` sans gate UI**
- Appelle `/api/mcp/keys` (GET/POST/DELETE)
- Protection backend à vérifier

### 2.3 App admin séparée : `apps/admin/`
Structure :
```
apps/admin/src/app/
  page.tsx               (agent performance dashboard)
  layout.tsx             (minimal)
  agents/[agentId]/page.tsx
  business/page.tsx
  flywheel/page.tsx
  graph/page.tsx
apps/admin/src/components/
  admin-nav.tsx
  stat-card.tsx
apps/admin/src/lib/db.ts
```
- App séparée (pas juste des routes sous web)
- Importe `AGENT_REGISTRY` depuis web (observability.ts)
- **Aucune gate auth visible dans layout.tsx** — dépend de la sécurité du reverse proxy / URL privée
- Pages server-side (`async function AgentsPage()`)

### 2.4 Cohérence globale de la gate admin

| Niveau | État |
|---|---|
| UI pages (`/settings/evals`, `/settings/mcp`) | ❌ Aucune gate |
| API routes (`/api/admin/*`) | ✅ `requireAdmin()` |
| Middleware admin | ❌ Absent |
| App `apps/admin` | ❌ Non protégée (URL-only) |

### 2.5 Manquant / Blocages
- Pages `evals` et `mcp` accessibles à tout user connecté côté UI — risque fort
- Endpoints `/api/eval/*` et `/api/mcp/*` probablement non protégés — à auditer
- `apps/admin` sans middleware auth — doit être derrière auth infra ou risque d'exposition

### 2.6 Points forts
- `requireAdmin()` centralisé
- Rôle dans JWT
- HTTP 403 propre
- App admin séparée (bonne isolation)

---

## ZONE 3 — Patterns d'erreur transversaux

### 3.1 Silent failures `.catch(() => {})` / `.catch(() => null)`
**27+ fichiers concernés.**

Critiques data flow :
- `apps/web/src/auth.ts:171` — Inngest sync sur OAuth
- `apps/web/src/auth.ts:219` — Refresh token Google
- `apps/web/src/lib/context-graph.ts:222` — Embed text `.catch(() => null)`
- `apps/web/src/lib/traced-ai.ts:69` — Active prompt fetch

Côté UI (utilisateur ne sait pas) :
- `apps/web/src/app/(dashboard)/contacts/page.tsx:82` — Import history
- `apps/web/src/app/(dashboard)/home/page.tsx:139,144` — fetch sans gestion

### 3.2 Commentaires techniques (TODO/FIXME/HACK/XXX)
Seulement **2 fichiers** :
- `apps/web/src/app/api/email/status/route.ts:44` — `lastSync: null, // TODO: track actual last sync`
- `apps/web/src/app/api/settings/mail-calendar/route.ts:108` — `lastEmailSyncAt: null, // TODO: track in connectedAccounts table in Phase B`

→ Code globalement propre de ce point de vue.

### 3.3 `@ts-ignore` / `@ts-expect-error`
7 occurrences dans 6 fichiers. **Toutes le même motif** : `// @ts-expect-error maxTokens exists in AI SDK but type definition may lag`
- `inngest/ai-autofill.ts:124`
- `lib/evals/agent-evals.ts:1113`
- `lib/corrections.ts:424`
- `app/api/accounts/[id]/summarize/route.ts:110`
- `app/api/eval/run-all/route.ts:238,429`
- `app/api/chat/route.ts:1701`

→ Mineur, lag type definitions SDK AI.

### 3.4 Error boundaries
- `app/global-error.tsx` (47 lignes) : minimaliste, "Something went wrong" + Try again
- `app/(dashboard)/error.tsx` (45 lignes) : idem + `console.error()` (ligne 13)
- Aucun Sentry, aucun `error.digest` affiché, "Try again" sans contexte.

### 3.5 Patterns de gestion d'erreur
**Server-side (sain) :**
```ts
} catch (error) {
  console.error("Purge failed:", error);
  return Response.json({ error: "Purge failed" }, { status: 500 });
}
```
**Client-side (bon pattern quand présent) :**
```ts
const [error, setError] = useState<string | null>(null);
try { ... } catch (err) { setError(err.message ?? "Failed"); }
```
**Async/Inngest (faible) :**
```ts
.catch((err) => console.warn("Failed to trigger:", err))
```

### 3.6 Toast.error
ToastProvider monté dans dashboard layout, mais **sous-utilisé** :
- `sidebar.tsx:257` — `.catch(() => {})` pas de toast
- Import history contacts échoue silencieusement
- Pages evals/mcp : pas de toast visible

### 3.7 Logger centralisé
**Fichier :** `apps/web/src/lib/logger.ts` (67 lignes) — `logger.debug/info/warn/error(msg, meta)`
- Existe, peu importé
- JSON stringify en prod, **aucune intégration Sentry / Datadog**

### 3.8 Analytics / Observability
- **PostHog intégré** (`components/posthog-provider.tsx`, `lib/analytics.ts`) — events typés (signup, signin, activation, chat_query, email_generated…)
- Server-side capture + client JS SDK
- `PostHogPageTracker` monté dans dashboard layout
- **Pas de Sentry** pour erreurs

### 3.9 Session & refresh tokens
**Google** (`auth.ts:196-220`) :
```ts
if (token.googleRefreshToken && Date.now() > (token.googleTokenExpiry - 5 * 60 * 1000)) {
  const response = await fetch("https://oauth2.googleapis.com/token", { ... });
}
```
**Microsoft** (`auth.ts:175-194`) — même pattern dans callback JWT.
**Gmail / Calendar** — auto-refresh sur 401 :
- `lib/calendar.ts:32`
- `lib/calendar-microsoft.ts:94-96`

Blocages :
- Pas de redirection utilisateur si refresh échoue — session peut devenir zombie
- Stockage JWT → révocation immédiate impossible

### 3.10 Middleware & rate limiting
**Fichier :** `apps/web/src/middleware.ts` (104 lignes)
- IP-based : 200 req/min global, 10 req/min sur `/api/auth`
- Store in-memory (cleanup auto 5 min)
- Reset au redéploiement

### 3.11 Manquant / Blocages transversaux
- Pas de Sentry / centralisation d'erreurs
- 27+ `.catch(() => {})` silencieux
- Pages evals/mcp sans feedback toast
- Logger sous-utilisé
- Error boundaries basiques
- Pas de redirection 401 post-expiry

### 3.12 Points forts
- Refresh tokens proactif (Google + Microsoft)
- Auto-retry 401 sur calendar APIs
- Rate limiting middleware
- PostHog analytics typés
- Logger centralisé (squelette prêt)
- Error boundaries Next.js présents

---

## Synthèse zone par zone

| Zone | État | Criticité |
|---|---|---|
| Landing | ✅ solide | basse |
| Admin gates | ⚠️ incohérent (UI absent, API partiel, app admin exposée) | **haute** |
| Error handling | ❌ silent failures massifs, pas de Sentry | **haute** |

### Priorités structurelles
1. Protéger les pages `/settings/evals` et `/settings/mcp` (gate UI + gate API)
2. Intégrer Sentry (ou équivalent) pour capture d'erreurs
3. Remplacer les `.catch(() => {})` côté UI par `toast.error` + logger
4. Documenter / sécuriser l'accès à `apps/admin` (middleware auth ou IP allowlist)
