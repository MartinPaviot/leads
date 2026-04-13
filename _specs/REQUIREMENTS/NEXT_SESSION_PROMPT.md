# Prompt de reprise — T0 + T1 full autonomy (version détaillée)

**À copier-coller tel quel comme premier message d'une nouvelle session Claude Code.**
**Martin ne sera pas disponible pour valider. Tu exécutes de bout en bout.**

---

# SECTION 1 — BOOTSTRAP

## 1.1 Environnement (windows-bash, node-managed)

Commands check au démarrage (exécute les 5 en parallèle) :

```bash
git status && git log --oneline | head -20
cd app/apps/web && pwd && ls
cd app/apps/web && cat package.json | head -30
cd app/apps/web && ls drizzle/ | tail -5
cd app/apps/web && ls src/app/(dashboard)
```

Si l'un échoue → lire `CLAUDE.md` "First run setup" § et bootstrapper.

## 1.2 Lecture obligatoire avant d'écrire une ligne de code (ordre impératif)

Chaque doc **doit** être lu intégralement, pas juste scanné.

1. `CLAUDE.md` (racine) — règles Rippletide hook-first + commit trailer + Kiro + garde-fous
2. `_specs/REQUIREMENTS/README.md` — index, totaux, décisions ouvertes, paths
3. `_specs/REQUIREMENTS/13-errors-edge-cases.md` — patterns d'erreur à respecter (standards du projet)
4. `_specs/PROD_SETUP.md` — ce qui est en prod, ne pas casser
5. Les **8 fichiers de spec** des BUGFIX précédents pour voir la méthode Kiro appliquée :
   - `_specs/BUGFIX-01-mail-calendar-endpoint/{requirements,design,tasks}.md`
   - `_specs/BUGFIX-02-members-invite/{requirements,design,tasks}.md`
   - `_specs/BUGFIX-03-workflows-multi-action/{requirements,design,tasks}.md`
   - `_specs/BUGFIX-04-sequences-scheduler/{requirements,design,tasks}.md`
   - `_specs/BUGFIX-05-admin-gates/{requirements,design,tasks}.md`
   - `_specs/BUGFIX-06-silent-failures/{requirements,design,tasks}.md`
   - `_specs/BUGFIX-07-engagement-webhooks/{requirements,design,tasks}.md`
6. `C:\Users\marti\.claude\projects\C--Users-marti-leads\memory\MEMORY.md` + tous les fichiers de mémoire référencés — règles persistantes.
7. Si Rippletide MCP connecté → `get_context("T0 T1 elevay implementation")` pour recall().

## 1.3 Inventaire initial à produire (fichier `_reports/session-start.md`)

Avant de toucher au code, écrire :
- SHA HEAD actuel
- Branche courante
- Ouverture tsconfig check + vitest run → état initial (doit être propre : 0 erreur typecheck, tous tests verts)
- Liste des silent catches existants (grep `catch\s*\{\s*\}` + `.catch\(\(\) => \{\s*\}\)` + `.catch\(\(\) => null\)`) → doit être vide ou liste courte. Si nouveaux silent catches apparus depuis BUGFIX-06, les noter pour cleanup pendant T0.
- État des migrations Drizzle : `ls drizzle/*.sql | tail -5`.

---

# SECTION 2 — RÈGLES NON NÉGOCIABLES

## 2.1 Hook-first (règle Rippletide)

Avant toute production de code, planning, architecture, refactor, test :
1. Consulter le hook `[Coding Rules from Rippletide]` (UserPromptSubmit).
2. Déclarer dans la 1re phrase de la réponse : `Applying rules: <liste>` ou `Applying rules: none returned by hook`.
3. Les rules s'appliquent au plan ET au code généré.

## 2.2 Git workflow

- **Branche main** protégée. Jamais de commit direct sur main sauf merge de feature.
- **Branche par feature :**
  - T0 : `fix/T0-saignements` (unique, tous les 8 fixes dedans)
  - T1 Phase 1 foundation N : `feat/T1-found-<name>` (ex: `feat/T1-found-pagination`)
  - T1 Phase 2 critique N : `feat/T1-<etape>-<items>` (ex: `feat/T1-signin-I1-I2-I4`)
- **Commit message format :**
  ```
  <type>(<scope>): <titre court one-line>

  <body multi-paragraphe expliquant le quoi + pourquoi + surprises trouvées>

  Co-Authored-By: Rippletide <admin@rippletide.com>
  ```
  Types : `fix`, `feat`, `refactor`, `test`, `docs`, `chore`, `perf`.
- **Jamais de `--no-verify`.**
- **Jamais de `--amend` si le commit est déjà dans une PR ou merged.**
- **Jamais de `reset --hard`, `push --force`, `branch -D` sans autorisation explicite dans ce prompt.** Pour T0+T1, **aucune destructive action n'est autorisée.**
- **Merge main :** fast-forward si possible, sinon merge commit (pas rebase forcé).
- **Commits fréquents :** toutes les 30 min OU après chaque tâche atomique terminée. Pas de commits fleuves.

## 2.3 Silent failures = ZÉRO

Cohérent BUGFIX-06. Patterns interdits :

```ts
// ❌ INTERDIT
try { ... } catch { }
try { ... } catch (e) { /* ignore */ }
fetch(url).catch(() => {})
fetch(url).catch(() => null)
await promise.catch(() => {})
```

Patterns exigés :

**Client-side :**
```ts
import { toast } from "@/components/ui/toast"; // adapter à l'import réel

try {
  // ...
} catch (err) {
  toast.error(err instanceof Error ? err.message : "Action failed. Try again.");
  console.warn("context: action failed", err);
  // Optional : mettre state en "error" pour UI retry
}
```

**Server-side (API routes) :**
```ts
import { logger } from "@/lib/logger";

try {
  // ...
} catch (err) {
  logger.error("context: operation failed", { err, tenantId, userId });
  return Response.json({ error: "Operation failed" }, { status: 500 });
}
```

**Async fire-and-forget (Inngest triggers, side effects non-critiques) :**
```ts
import { logger } from "@/lib/logger";

somePromise()
  .catch((err) => logger.warn("context: side-effect failed", { err, meta }));
```

**Règle supplémentaire :** après chaque modification d'un fichier, grep `catch\s*\{\s*\}|\.catch\(\(\) => \{\s*\}\)|\.catch\(\(\) => null\)` sur ce fichier. Si hit → fix avant commit.

## 2.4 Typecheck + tests obligatoires

Après chaque feature (pas chaque commit, mais chaque feature/task atomique) :

```bash
cd app/apps/web && npx tsc --noEmit -p .
cd app/apps/web && npx vitest run
```

Les deux doivent être verts. Si rouge → fix avant merge. Si bloqué → `_harness/escalation.md`.

## 2.5 Kiro methodology (par feature)

Chaque feature T1 (et T0.8 password-reset) → un dossier `_specs/<FEATURE_ID>/` avec 3 fichiers :

**`requirements.md`** (template) :
```markdown
# <Feature> — Requirements

## User story
Comme <role>, je veux <action> pour <bénéfice>.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN ... WHEN ... THEN ...
- ...

## Edge cases
- Concurrency (2 users simultanés)
- Network failure mid-flow
- Invalid input (types, bounds, encoding)
- Already-completed action (idempotency)
- Permission denied
- Rate limit

## Evaluation (how to test manually)
1. ...
2. ...
```

**`design.md`** (template) :
```markdown
# <Feature> — Design

## System fit
Dépendances sur : <systèmes existants>
Impact sur : <systèmes modifiés>

## Data model
Nouvelles tables / colonnes / indexes.
Migration Drizzle : `drizzle/00XX_<name>.sql`.

## API contracts
- `METHOD /api/path` → payload in / out Zod schemas
- ...

## Data flow
ASCII or mermaid diagram.

## Failure handling
- Error path 1 : <action>
- Error path 2 : <action>

## Security
- Auth requis ? Rôle ?
- Rate limit ?
- Validation input ?
```

**`tasks.md`** (template) :
```markdown
# <Feature> — Tasks

## Order (dependency-respecting)
- [ ] T1. <task> — verify: <command> — test: <test name>
- [ ] T2. <task> — verify: <command> — test: <test name>
- ...

## Post-tasks
- [ ] Typecheck ok
- [ ] Vitest ok
- [ ] Regression pass
- [ ] PR description filled
```

## 2.6 Tests patterns

Chaque fix bug → 1 test de régression minimum.
Chaque feature → tests unitaires des helpers + tests d'intégration si critical path.
Emplacement : `app/apps/web/src/**/*.test.ts(x)` colocalisés OU `app/apps/web/tests/`.

Vitest config déjà setup. Utiliser :
- `describe` / `it` / `expect` pour unit
- `@testing-library/react` pour components (déjà installé)
- `msw` pour mock fetch si besoin
- DB mocks : **éviter** — préférer tests pures helpers + intégration via server actions mockées.

Pattern nommage test : `it("should <behavior> when <condition>")`.

## 2.7 Décisions produit — valeurs par défaut

Pour chaque décision ouverte dans `_specs/REQUIREMENTS/*.md` §4, prendre la recommandation déjà écrite dans le doc. Si pas de reco explicite, appliquer ces défauts universels :

| Décision type | Défaut |
|---|---|
| v1 vs v2 | v1 minimal (le plus petit qui livre la valeur + note scope v2) |
| Hard gate vs soft gate | Soft gate (moins friction, mêmes garanties si bien designé) |
| Enum fixe vs free-text | Enum curated + option "Other..." avec free-text |
| Auto vs ask | Ask (user confirm destructive/structurant, auto sur non-destructive) |
| Client-only vs server | Server (plus sécure, plus scalable) |
| Real-time vs polling | SSE pour streams longs, polling 2s sinon, WS seulement si bidirectionnel indispensable |
| Sync vs async (backend) | Async via Inngest si > 2s d'exécution |
| Cache client vs server | Server (plus cohérent, survit restart) |
| Tenant-scope vs user-scope (settings) | User-scope pour préférences (filter views, column custom), tenant-scope pour business logic (ICP, workflows) |
| Destructive confirm | Typed "DELETE" seulement pour : delete tenant, delete all data, bulk delete >50 items |
| Logs storage | DB table pour analytics/audit queryable, file pour diagnostics sysadmin |
| Migration strategy | Additive first (add col nullable), then backfill, then drop old (3 deploys) |

**Tout choix non couvert → logger dans `_specs/REQUIREMENTS/DECISIONS_LOG.md` :**

```markdown
## <date> — <feature>: <question>

**Choix :** <option>
**Raisonnement :** <1-3 phrases>
**Alternatives considérées :** <liste courte>
**Réversibilité :** facile / moyenne / difficile
```

**Ne jamais stopper pour demander.** Si doute entre 2 options équivalentes : prends la plus simple, log, continue.

## 2.8 Destructive actions — autorisations T0+T1

Autorisé sans demander :
- Créer des branches nouvelles
- Merger via fast-forward ou merge commit sur main (après PASS local)
- Créer des fichiers / dossiers / specs / migrations
- Modifier du code existant
- Supprimer du code clairement mort (avec commentaire explicite dans le commit)
- Exécuter `npm/pnpm install` pour ajouter deps nouvelles si justifiées
- Lancer `drizzle-kit generate` + `drizzle-kit push` sur la DB locale

**Interdit sans demander :**
- `git reset --hard`, `git push --force`, `git branch -D <branche>`
- `pnpm remove <dep>` si la dep est utilisée ailleurs
- Modifier `.env*`, `CLAUDE.md`, `_credentials/`
- Supprimer `_specs/` ou `_reports/` existants
- Toucher à `apps/admin/` (app séparée, hors scope T0+T1)
- Migrations destructives (drop column, drop table, rename qui perd data)
- `git commit --no-verify`
- Push to remote (tout reste local, Martin push manuellement après)

---

# SECTION 3 — T0 : SAIGNEMENTS ARRÊTÉS (8 fixes, ~22-30h)

## 3.1 Branche + Kiro spec

```bash
git checkout main && git pull
git checkout -b fix/T0-saignements
mkdir -p _specs/T0-saignements
```

Créer `_specs/T0-saignements/requirements.md`, `design.md`, `tasks.md` (templates §2.5). `tasks.md` doit lister les 8 items ci-dessous.

## 3.2 T0.1 — Onboarding P7 : `needsOnboarding` bugué

**Fichier :** `app/apps/web/src/app/api/onboarding/status/route.ts`

**Problème :** ligne 75 actuel : `needsOnboarding: !onboardingCompleted && isNew`. Si user a créé des companies (TAM) mais pas terminé onboarding → `isNew = false` → wizard ne se relance jamais → user bloqué.

**Code actuel (extrait route.ts ~L53-75) :**
```ts
const onboardingCompleted = !!settings.onboardingCompleted;
// ...
const isNew = accounts === 0 && contactTotal === 0;
// ...
return NextResponse.json({
  isNew,
  // ...
  needsOnboarding: !onboardingCompleted && isNew,
  // ...
});
```

**Code cible :**
```ts
return NextResponse.json({
  isNew,
  // ...
  needsOnboarding: !onboardingCompleted,
  // ...
});
```

**Tests à ajouter (`app/apps/web/src/app/api/onboarding/status/route.test.ts`) :**
```ts
describe("GET /api/onboarding/status", () => {
  it("should return needsOnboarding=true when onboardingCompleted=false regardless of existing accounts", async () => {
    // Seed : tenant with 150 accounts + onboardingCompleted=false
    // Expect : needsOnboarding = true
  });

  it("should return needsOnboarding=false when onboardingCompleted=true even with 0 accounts", async () => {
    // Seed : tenant with 0 accounts + onboardingCompleted=true
    // Expect : needsOnboarding = false
  });

  it("should return isNew correctly independent of needsOnboarding", async () => {
    // Seed various states
  });
});
```

**Effort :** 30 min code + 1h tests.

## 3.3 T0.2 — Onboarding P6 : `currentStep` non persisté

**Fichiers touchés :**
- `app/apps/web/src/components/onboarding-wizard.tsx` (ajouter persistance state)
- `app/apps/web/src/app/api/onboarding/save/route.ts` (accepter `currentStep`)
- `app/apps/web/src/app/api/onboarding/status/route.ts` (renvoyer `currentStep`)

**Changements code :**

1. `save/route.ts` : accepter optionnel `currentStep` dans le body et persister dans `tenants.settings.onboardingCurrentStep`.
2. `status/route.ts` : ajouter dans la réponse `onboardingCurrentStep: settings.onboardingCurrentStep ?? null`.
3. `onboarding-wizard.tsx` :
   - Au mount, si `status.onboardingCurrentStep` existe ET `!onboardingCompleted` → `setStep(status.onboardingCurrentStep)`.
   - Après `setStep(newStep)` interne, fire `POST /api/onboarding/save { step: "_current", currentStep: newStep }` (save fire-and-forget).
   - Ajouter banner en haut du wizard si reprise : "Welcome back — picking up where you left off."

4. Edge case : si `currentStep` persisté = "building" → forcer revert à "icp" (car building est transitoire, user ne doit pas reprendre au milieu de l'async job).

**Tests :**
- E2E manuel description dans tasks.md : "Start wizard, go to step product, close modal, reload, verify wizard resumes at product with banner."
- Unit test `save/route.ts` : POST avec `currentStep` → DB updated.
- Unit test `status/route.ts` : returns `onboardingCurrentStep`.

**Effort :** 3h.

## 3.4 T0.3 — Home : challenge label mismatch

**Fichier :** `app/apps/web/src/app/(dashboard)/home/page.tsx:188-196`

**Code actuel :**
```tsx
{summary?.challenge === "Finding the right leads"
  ? "Your top prospects by fit score."
  : summary?.challenge === "Getting responses"
    ? "Reply rates and follow-up gaps."
    : summary?.challenge === "Closing deals"
      ? "Pipeline velocity and next steps."
      : summary?.challenge === "Expanding accounts"
        ? "Expansion signals across your accounts."
        : today}
```

**Wizard source (onboarding-wizard.tsx:47) :**
```ts
const CHALLENGES = ["Finding leads", "Getting responses", "Closing deals", "Expanding accounts"];
```

**Mismatch :** "Finding the right leads" (home) ≠ "Finding leads" (wizard). Premier cas ne match jamais → fallback date.

**Code cible home/page.tsx :**
```tsx
{summary?.challenge === "Finding leads"
  ? "Your top prospects by fit score."
  : summary?.challenge === "Getting responses"
    ? "Reply rates and follow-up gaps."
    : summary?.challenge === "Closing deals"
      ? "Pipeline velocity and next steps."
      : summary?.challenge === "Expanding accounts"
        ? "Expansion signals across your accounts."
        : today}
```

**Migration DB :** si data en prod a déjà stocké d'anciennes labels, exécuter :
```sql
UPDATE tenants SET settings = jsonb_set(settings, '{challenge}', '"Finding leads"')
WHERE settings->>'challenge' = 'Finding the right leads';
```

**Ajouter migration `drizzle/00XX_fix_challenge_label.sql`** (même si pas de schema change, pour log).

**Tests :** screenshot E2E manuel home avec chaque challenge.

**Effort :** 30 min.

## 3.5 T0.4 — Chat : silent catch `approveCard`

**Fichier :** `app/apps/web/src/app/(dashboard)/chat/page.tsx:458-459`

**Code actuel :**
```ts
} catch {
  // Silent fail
} finally {
  setCardExecuting((prev) => ({ ...prev, [cardKey]: false }));
}
```

**Code cible :**
```ts
} catch (err) {
  toast.error(
    err instanceof Error
      ? `Failed to create ${entityType}: ${err.message}`
      : "Failed to create. Please try again."
  );
  console.warn("chat: approveCard failed", { cardKey, proposalAction, err });
  // Remettre en pending pour retry
  setCardStatuses((prev) => ({ ...prev, [cardKey]: "pending" }));
} finally {
  setCardExecuting((prev) => ({ ...prev, [cardKey]: false }));
}
```

**Et :** ajouter handling `!res.ok` avant ligne 442 :
```ts
if (res.ok) {
  const created = await res.json();
  // ... existing ...
} else {
  const errorBody = await res.json().catch(() => ({ error: "Unknown error" }));
  if (res.status === 409) {
    toast.error(`A ${entityType} with this identifier already exists. [View existing](#)`);
    setCardStatuses((prev) => ({ ...prev, [cardKey]: "error" }));
  } else if (res.status === 422) {
    toast.error(`Validation failed: ${errorBody.error ?? "check required fields"}`);
    setCardStatuses((prev) => ({ ...prev, [cardKey]: "error" }));
  } else {
    toast.error(`Failed (${res.status}): ${errorBody.error ?? "server error"}`);
    setCardStatuses((prev) => ({ ...prev, [cardKey]: "pending" }));
  }
}
```

**Tests unit :**
- `approveCard` dispatched → success path persists `approved` status.
- `approveCard` → 500 path → toast + status pending.
- `approveCard` → 409 path → toast + status error.

**Effort :** 1-1.5h.

## 3.6 T0.5 — Accounts : bulk cap 20 silencieux

**Problème :** UI envoie N ids à `/api/enrich` ou `/api/signals`, serveur tronque à 20 sans dire. User croit avoir enrichi 100, seulement 20 touchés.

**Fichiers serveur :**
- `app/apps/web/src/app/api/enrich/route.ts:45` : `companyIds.slice(0, 20)`
- `app/apps/web/src/app/api/signals/route.ts:54` : idem

**Choix T0 (pas Inngest queue, trop gros) :** côté client, chunker par tranches de 20 avec progress toast.

**Fichiers client :**
- `app/apps/web/src/app/(dashboard)/accounts/page.tsx` (handlers `enrichAll`, `scoreAll`, `detectSignals`)

**Nouveau helper `app/apps/web/src/lib/chunk-bulk.ts` :**
```ts
export interface ChunkBulkOptions {
  ids: string[];
  chunkSize?: number;
  onProgress?: (done: number, total: number) => void;
  endpoint: string;
  buildPayload: (chunk: string[]) => Record<string, unknown>;
}

export async function chunkedBulkCall({
  ids,
  chunkSize = 20,
  onProgress,
  endpoint,
  buildPayload,
}: ChunkBulkOptions) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  let done = 0;
  const errors: unknown[] = [];
  for (const chunk of chunks) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(chunk)),
      });
      if (!res.ok) {
        errors.push({ chunk: done, status: res.status });
      }
    } catch (err) {
      errors.push({ chunk: done, err });
    }
    done += chunk.length;
    onProgress?.(done, ids.length);
  }
  return { done, total: ids.length, errors };
}
```

**Usage accounts/page.tsx (exemple enrichAll) :**
```ts
const enrichAll = useCallback(async () => {
  const unenriched = accounts.filter((a) => !isEnriched(a));
  if (unenriched.length === 0) {
    toast.info("All accounts are already enriched.");
    return;
  }
  setEnrichAllRunning(true);
  const toastId = toast.loading(`Enriching 0 / ${unenriched.length} accounts…`);
  try {
    const { done, errors } = await chunkedBulkCall({
      ids: unenriched.map((a) => a.id),
      endpoint: "/api/enrich",
      buildPayload: (chunk) => ({ companyIds: chunk }),
      onProgress: (d, t) => {
        toast.update(toastId, { description: `Enriching ${d} / ${t} accounts…` });
      },
    });
    if (errors.length === 0) {
      toast.success(`Enriched ${done} accounts.`, { id: toastId });
    } else {
      toast.warning(`Enriched ${done - errors.length * 20} accounts. ${errors.length} chunks failed.`, { id: toastId });
      console.warn("accounts: enrichAll partial failure", errors);
    }
    await fetchAccounts();
  } catch (err) {
    toast.error("Bulk enrichment failed.", { id: toastId });
    console.warn("accounts: enrichAll failed", err);
  } finally {
    setEnrichAllRunning(false);
  }
}, [accounts, fetchAccounts]);
```

Même pattern pour `scoreAll` et `detectSignals`.

**Tests :**
- Unit `chunkedBulkCall` : chunks correctement, onProgress appelé, errors collectés.
- E2E manuel : sélectionner 50 accounts, lancer enrich, vérifier toast progress + 50 traités.

**Effort :** 3h.

## 3.7 T0.6 — Accounts : badge "Suggested" trompeur

**Fichier :** `app/apps/web/src/app/(dashboard)/accounts/page.tsx:798` (environ)

**Problème :** badge `<Badge>Suggested</Badge>` appliqué à tous les contacts expanded, même ceux qui viennent de la DB normale.

**Code cible :**
```tsx
{(contact.source === "apollo_auto" || contact.properties?.suggestedBy === "apollo") && (
  <Badge variant="info">Suggested</Badge>
)}
```

**Vérifier :** lire le schema `contacts` pour confirmer que `source` et/ou `properties.suggestedBy` sont les bons champs. Sinon adapter.

**Tests :**
- Snapshot test du composant contact row avec / sans flag.

**Effort :** 30 min.

## 3.8 T0.7 — Landing : Twitter link générique

**Fichier :** `app/apps/web/src/app/(marketing)/page.tsx:427-437`

**Code actuel :**
```tsx
<a href="https://x.com" target="_blank" ...>
```

**Décision par défaut :** retirer l'icône Twitter entièrement (pas de compte Elevay officiel connu côté Claude).

**Code cible :** supprimer le `<a>` block Twitter + son contenant si c'est le seul icon social.

Laisser une note dans commit : "Remove generic Twitter link. Add back when Elevay's official X account exists — see `_specs/REQUIREMENTS/01-landing.md` L7".

**Tests :** aucun (pure suppression UI).

**Effort :** 15 min.

## 3.9 T0.8 — Password reset flow complet (P0 ABSOLU, ~12h)

**Scope :** 2 pages publiques + 2 API routes + 1 migration + 1 email template + tests. Kiro spec dédié.

**Kiro spec :** `_specs/T0-password-reset/requirements.md`, `design.md`, `tasks.md`.

### Data model

Nouvelle table `password_reset_tokens` (migration `drizzle/0009_password_reset_tokens.sql`) :

```sql
CREATE TABLE "password_reset_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL, -- SHA-256 hex of the token
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

Mise à jour `app/apps/web/src/db/schema.ts` :
```ts
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  requestedIp: text("requested_ip"),
  requestedUserAgent: text("requested_user_agent"),
});
```

### Helper lib

`app/apps/web/src/lib/password-reset.ts` :
```ts
import { randomBytes, createHash } from "crypto";
import { db } from "@/db";
import { passwordResetTokens, authUsers } from "@/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export async function createResetTokenForUser(userId: string, ip?: string, ua?: string) {
  // Invalidate any existing unused tokens
  await db.update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(passwordResetTokens.userId, userId),
      isNull(passwordResetTokens.usedAt),
    ));

  const { token, tokenHash } = generateResetToken();
  await db.insert(passwordResetTokens).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    requestedIp: ip,
    requestedUserAgent: ua,
  });
  return token;
}

export async function validateResetToken(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await db.select()
    .from(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ))
    .limit(1);
  return row ?? null;
}

export async function consumeResetToken(tokenId: string) {
  await db.update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}
```

### API endpoints

**`app/apps/web/src/app/api/auth/forgot-password/route.ts`** :
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { authUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createResetTokenForUser } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/emails/password-reset";
import { logger } from "@/lib/logger";
import { rateLimitByEmail, rateLimitByIp } from "@/lib/rate-limit"; // à créer si n'existe pas

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Always return same response to prevent enumeration
    return NextResponse.json({ ok: true });
  }
  const { email } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const ip = req.headers.get("x-forwarded-for") ?? "";
  const ua = req.headers.get("user-agent") ?? "";

  // Rate limit per email (3/h) and per IP (10/h)
  const okEmail = await rateLimitByEmail(normalizedEmail, "forgot-password", 3, 60 * 60);
  const okIp = await rateLimitByIp(ip, "forgot-password", 10, 60 * 60);
  if (!okEmail || !okIp) {
    // Silent — don't leak rate-limit
    return NextResponse.json({ ok: true });
  }

  try {
    const [user] = await db.select()
      .from(authUsers)
      .where(eq(authUsers.email, normalizedEmail))
      .limit(1);

    if (user) {
      const token = await createResetTokenForUser(user.id, ip, ua);
      await sendPasswordResetEmail(user.email, token);
    }
  } catch (err) {
    logger.error("forgot-password: failed", { err });
    // Still return ok to prevent enumeration
  }

  return NextResponse.json({ ok: true });
}
```

**`app/apps/web/src/app/api/auth/reset-password/route.ts`** :
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { authAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { validateResetToken, consumeResetToken } from "@/lib/password-reset";
import { logger } from "@/lib/logger";
import { sendPasswordChangedEmail } from "@/lib/emails/password-changed";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(10).max(256),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { token, password } = parsed.data;

  // Password policy check
  if (!isPasswordAcceptable(password)) {
    return NextResponse.json({ error: "Password does not meet requirements" }, { status: 400 });
  }

  try {
    const row = await validateResetToken(token);
    if (!row) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    // authAccounts.access_token stores password hash for credentials provider
    await db.update(authAccounts)
      .set({ access_token: hash })
      .where(and(
        eq(authAccounts.userId, row.userId),
        eq(authAccounts.provider, "credentials"),
      ));
    await consumeResetToken(row.id);

    // Send notification email
    const ip = req.headers.get("x-forwarded-for") ?? "";
    await sendPasswordChangedEmail(row.userId, ip);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("reset-password: failed", { err });
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}

function isPasswordAcceptable(pwd: string): boolean {
  // v1 policy : ≥10 chars, 1 digit, 1 lower, 1 upper
  return pwd.length >= 10 && /[0-9]/.test(pwd) && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd);
}
```

### Pages UI

**`app/apps/web/src/app/forgot-password/page.tsx`** :
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="...">
        <h1>Check your inbox</h1>
        <p>If an account exists for {email}, we've sent a reset link. Check your inbox within a minute.</p>
        <p>The link expires in 1 hour.</p>
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="...">
      <h1>Forgot your password?</h1>
      <p>Enter your email and we'll send you a reset link.</p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <button type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/sign-in">Back to sign in</Link>
    </form>
  );
}
```

**`app/apps/web/src/app/reset-password/page.tsx`** :
```tsx
"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!isPasswordAcceptable(password)) {
      setError("Password must be ≥10 chars, with at least 1 digit, 1 lowercase, 1 uppercase");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        router.push("/sign-in?reason=password-reset-success");
      } else {
        const data = await res.json().catch(() => ({ error: "Reset failed" }));
        setError(data.error ?? "Reset failed");
      }
    } catch (err) {
      setError("Network error. Try again.");
      console.warn("reset-password: submit failed", err);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return <div>Invalid link. <a href="/forgot-password">Request a new one</a>.</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="...">
      <h1>Set a new password</h1>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" placeholder="New password (≥10 chars)" />
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" placeholder="Confirm password" />
      {error && <div role="alert">{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

function isPasswordAcceptable(pwd: string): boolean {
  return pwd.length >= 10 && /[0-9]/.test(pwd) && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd);
}
```

### Lien "Forgot password?" sur `/sign-in`

Dans `app/apps/web/src/app/sign-in/page.tsx`, ajouter sous le champ password :
```tsx
<div className="flex justify-between items-center">
  <label htmlFor="password">Password</label>
  <Link href="/forgot-password" className="text-xs text-gray-500 hover:underline">
    Forgot password?
  </Link>
</div>
<PasswordInput ... />
```

### Emails

**`app/apps/web/src/lib/emails/password-reset.ts`** :
```ts
import { Resend } from "resend";
import { logger } from "@/lib/logger";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordResetEmail(to: string, token: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.elevay.com";
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await resend.emails.send({
      from: process.env.INVITE_FROM_ADDRESS ?? "Elevay <no-reply@elevay.com>",
      to,
      subject: "Reset your Elevay password",
      html: `
        <p>You requested a password reset. Click the link below within 1 hour:</p>
        <p><a href="${resetUrl}">Reset password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>For security, this link expires in 1 hour.</p>
      `,
    });
  } catch (err) {
    logger.error("password-reset email send failed", { err, to });
    throw err;
  }
}
```

**`app/apps/web/src/lib/emails/password-changed.ts`** (notification post-reset) :
```ts
export async function sendPasswordChangedEmail(userId: string, ip?: string) {
  // fetch user email, send notif "Your password was just reset from IP x. If this wasn't you, contact security@elevay.com"
}
```

### Tests

`app/apps/web/src/lib/password-reset.test.ts` :
- Generate token : returns { token, tokenHash }, tokenHash is sha256 of token.
- createResetTokenForUser : inserts row, invalidates previous.
- validateResetToken : returns row if valid, null if expired, null if used, null if non-existent.
- consumeResetToken : marks used.

### Criteria fin T0.8

- [ ] Migration `0009_password_reset_tokens.sql` créée + pushed local
- [ ] Schema Drizzle updated
- [ ] Library `lib/password-reset.ts` + tests
- [ ] API routes `/api/auth/forgot-password` + `/api/auth/reset-password`
- [ ] Pages `/forgot-password` + `/reset-password`
- [ ] Link "Forgot password?" on `/sign-in`
- [ ] Emails templates Resend
- [ ] Rate limit helper (si absent, créer `lib/rate-limit.ts` avec simple in-memory store)
- [ ] Tests Vitest
- [ ] Typecheck + vitest ok
- [ ] Commit avec trailer Rippletide

## 3.10 T0 — Critères de fin (checkpoint)

À la fin des 8 items :

```bash
cd app/apps/web
npx tsc --noEmit -p . # 0 erreur
npx vitest run # tous verts
# Compter les silent catches restants :
grep -r "catch\s*{\s*}" src/ | wc -l # ~0 (ceux hors de ton scope sont notés en escalation)
grep -r "\.catch((\s*)\s*=>\s*{\s*})" src/ | wc -l
```

Ensuite :
```bash
git checkout main
git merge fix/T0-saignements # fast-forward ou merge commit
echo "T0 COMPLETE at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> _harness/progress.txt
```

Écrire `_reports/t0-completion.md` :
- Liste des 8 fixes avec SHA
- Screenshots avant/après si applicable
- Risques résiduels (ce qui n'a pas été fait)
- Next : T1 Phase 1

---

# SECTION 4 — T1 PHASE 1 : FOUNDATIONS PARTAGÉES (13, ~80h)

**Objectif :** construire des primitives réutilisables AVANT les features par étape, pour éliminer duplication.

**Branche par foundation :** `feat/T1-found-<name>`. Merge main après PASS.

## 4.1 Foundation F1 — Server-side pagination hook (6h)

**Fichiers :**
- `app/apps/web/src/lib/hooks/use-paginated-list.ts` (nouveau)
- `app/apps/web/src/lib/api/paginated-response.ts` (shared response type)

**API standard serveur :** tout endpoint list doit accepter :
```
GET /api/<resource>?page=1&pageSize=25&sort=<field>&dir=asc|desc&<filter-fields>
```
Response shape :
```ts
{
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}
```

**Hook client :**
```ts
interface UsePaginatedListOptions<T> {
  endpoint: string;
  pageSize?: number;
  initialSort?: { field: string; dir: "asc" | "desc" };
  initialFilters?: Record<string, string | string[]>;
  transform?: (items: unknown[]) => T[];
}

interface UsePaginatedListReturn<T> {
  items: T[];
  total: number;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
  setPage: (p: number) => void;
  setSort: (field: string, dir: "asc" | "desc") => void;
  setFilter: (key: string, value: string | string[] | null) => void;
  refresh: () => void;
}

export function usePaginatedList<T>(options: UsePaginatedListOptions<T>): UsePaginatedListReturn<T>;
```

**Tests :** mock fetch avec MSW, test que query string est correctement construit, qu'un refresh re-fetch, que setPage fonctionne, que errors sont captés.

**Migration progressive :** pas besoin de convertir toutes les pages immédiatement. Chaque étape T1 phase 2 qui touche une liste l'utilise.

## 4.2 Foundation F2 — VirtualTable component (8h)

**Fichier :** `app/apps/web/src/components/ui/virtual-table.tsx`

**Deps :** `@tanstack/react-virtual` (ajouter via `pnpm add @tanstack/react-virtual` dans `app/apps/web`).

**API :**
```tsx
<VirtualTable
  items={items}
  columns={columns}
  rowHeight={48}
  onRowClick={(item) => {...}}
  onRowExpand={(item) => ...}
  loadingRows={10}  // skeleton count when items=[]
  pinFirstColumn
  stickyHeader
/>
```

`columns` = `Array<{ key: string; header: React.ReactNode; render: (item) => React.ReactNode; width?: number; sortable?: boolean; pinned?: "left" | "right" }>`.

**Tests :** rendu de 10k items sans lag (perf test), scroll maintient le focus, keyboard nav.

## 4.3 Foundation F3 — Bulk actions bar (6h)

**Fichiers :**
- `app/apps/web/src/lib/hooks/use-selection.ts`
- `app/apps/web/src/components/ui/bulk-actions-bar.tsx`

**Hook :**
```ts
export function useSelection<T extends { id: string }>(items: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // ... toggle, selectAll, clear, isSelected, count
  return { selected, toggle, selectAll, clear, isSelected, count: selected.size };
}
```

**Component :**
```tsx
<BulkActionsBar
  count={selection.count}
  actions={[
    { label: "Enrich", icon: <Zap />, onClick: handleEnrichSelected },
    { label: "Score", icon: <Target />, onClick: handleScoreSelected },
    { label: "Export", icon: <Download />, onClick: handleExportSelected },
    { label: "Delete", icon: <Trash />, variant: "danger", onClick: handleDeleteSelected },
  ]}
  onClear={selection.clear}
/>
```

Le component apparaît sticky en haut quand count > 0, remplace le page header.

## 4.4 Foundation F4 — Filter builder (10h)

**Fichier :** `app/apps/web/src/components/ui/filter-builder.tsx`

**Deps :** aucune nouvelle, utiliser primitives existantes.

**API :**
```tsx
<FilterBuilder
  fields={[
    { key: "industry", label: "Industry", type: "multi-select", options: INDUSTRIES },
    { key: "score", label: "Score", type: "number-range" },
    { key: "last_interaction", label: "Last interaction", type: "date-range" },
    { key: "tags", label: "Tags", type: "multi-text" },
  ]}
  value={filters}
  onChange={setFilters}
  onSaveView={async (name) => { /* POST /api/views */ }}
  savedViews={views}
/>
```

Chaque filter = `{ field, operator, value }`. Operators par type :
- `number` : eq, neq, gt, gte, lt, lte
- `text` : contains, not-contains, starts-with, ends-with, eq
- `multi-select` : includes-any, includes-all, excludes
- `date-range` : before, after, between, last-N-days
- `boolean` : is-true, is-false

Serialization : URL query params `filter[industry][includes-any]=SaaS,FinTech&filter[score][gte]=70`.

**Endpoint API associé (v1 minimal) :** `/api/views` (user-scoped, persisté).

Migration table `saved_views` :
```sql
CREATE TABLE saved_views (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  resource text NOT NULL, -- "accounts" | "contacts" | "deals" | ...
  name text NOT NULL,
  filters jsonb NOT NULL,
  sort jsonb,
  columns jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
```

## 4.5 Foundation F5 — Display panel (5h)

**Fichier :** `app/apps/web/src/components/ui/display-panel.tsx`

**Dropdown top-right des list pages :**
```tsx
<DisplayPanel
  columns={availableColumns}
  visibleColumns={userPrefs.visibleColumns}
  pinnedColumns={userPrefs.pinnedColumns}
  columnOrder={userPrefs.columnOrder}
  density={userPrefs.density}  // "compact" | "default" | "comfortable"
  onUpdate={async (newPrefs) => { /* PUT /api/user-preferences */ }}
/>
```

Persistance : endpoint `/api/user-preferences` (user-scoped, key-value JSON par resource).

## 4.6 Foundation F6 — Inline edit hook + undo toast (4h)

**Fichier :** `app/apps/web/src/lib/hooks/use-inline-edit.ts`

```ts
export function useInlineEdit<T>({
  initialValue,
  onSave,
  undoDuration = 10_000,
}: {
  initialValue: T;
  onSave: (newValue: T) => Promise<void>;
  undoDuration?: number;
}) {
  // State : editing, value, saving, lastSaved
  // Returns : { value, setValue, isEditing, startEdit, save, cancel }
  // On save : optimistic, toast with "Undo" action 10s
}
```

## 4.7 Foundation F7 — Empty states components (4h)

**Fichier :** `app/apps/web/src/components/ui/empty-state.tsx`

5 variants :
```tsx
<EmptyState
  variant="first-use" // | "no-filter-match" | "error" | "loading" | "no-permission"
  title="..."
  description="..."
  action={<Button>...</Button>}
  secondaryAction={<Button variant="ghost">...</Button>}
/>
```

Illustrations : simples (pas stock art, juste icônes Lucide larges + subtle gradient background).

## 4.8 Foundation F8 — Optimistic mutation hook (4h)

**Fichier :** `app/apps/web/src/lib/hooks/use-optimistic-mutation.ts`

```ts
export function useOptimisticMutation<T, R>({
  mutate,
  onSuccess,
  onError,
}: {
  mutate: (input: T) => Promise<R>;
  onSuccess?: (result: R, input: T) => void;
  onError?: (err: Error, input: T) => void;
}) {
  // Returns { trigger, pending }
  // Usage : trigger(input, { optimisticUpdate: () => setState, rollback: () => setState })
}
```

## 4.9 Foundation F9 — Keyboard shortcuts (6h)

**Fichier :** `app/apps/web/src/lib/hooks/use-hotkeys.ts` + `app/apps/web/src/components/ui/shortcut-help.tsx`

**Deps :** `react-hotkeys-hook` (léger, bien maintenu). Installer.

**Hook :**
```ts
useHotkey("cmd+k", openCommandPalette);
useHotkey("/", focusSearch);
useHotkey("c", openCreateMenu);
useHotkey("?", openShortcutHelp);
```

**Overlay help :** liste de tous les hotkeys enregistrés (auto-collected via un registry).

## 4.10 Foundation F10 — PostHog typed events (6h)

**Fichier :** `app/apps/web/src/lib/analytics.ts` (existe, étendre)

Pour chaque event identifié dans les 13 docs, ajouter :
```ts
export const posthogEvents = {
  landing_viewed: (props: { referrer?: string; utm_source?: string }) => capture("landing_viewed", props),
  signup_completed: (props: { user_id: string; method: "google" | "microsoft" | "credentials" }) => capture("signup_completed", props),
  // ... ~100 events typés
} as const;
```

Pattern : typed, autocomplete, static naming, tree-shakeable.

## 4.11 Foundation F11 — A11y pack (5h)

**Fichiers :**
- `app/apps/web/src/components/a11y/skip-link.tsx`
- `app/apps/web/src/components/a11y/live-region.tsx`
- `app/apps/web/src/lib/hooks/use-focus-trap.ts`
- `app/apps/web/src/app/globals.css` (ajouter `:focus-visible` styles)

Ajouter `<SkipLink />` en tête du `app/apps/web/src/app/layout.tsx`.
Settings `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` dans globals.

## 4.12 Foundation F12 — Responsive primitives (6h)

**Fichiers :**
- `app/apps/web/src/components/ui/responsive-stack.tsx`
- `app/apps/web/src/components/ui/responsive-table.tsx` (auto-switch to cards mobile)

Breakpoints standardisés Tailwind (déjà). Helper `useBreakpoint()` hook.

## 4.13 Foundation F13 — Sentry integration (10h)

**Deps :** `@sentry/nextjs`. Installer (`pnpm add @sentry/nextjs`).

**Setup :**
- `sentry.client.config.ts` + `sentry.server.config.ts` + `sentry.edge.config.ts` (suivre docs Next.js officielles)
- `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` env vars (ajouter à `_specs/PROD_SETUP.md`)
- `next.config.js` : wrap avec `withSentryConfig`
- Source maps upload en CI (après)
- Release tagging via git SHA

**Usage :**
- Breadcrumbs automatiques pour fetch / navigation.
- Manual capture : `Sentry.captureException(err, { tags: { feature: "X" }, extra: { ... } })`.
- `logger.ts` ajouter hook qui forward errors à Sentry.

**Error boundary replacement :** `global-error.tsx` et `(dashboard)/error.tsx` call `Sentry.captureException`.

## 4.14 T1 Phase 1 — Critères de fin

Tous les 13 foundations mergés main. `_reports/t1-phase1-completion.md` écrit.

---

# SECTION 5 — T1 PHASE 2 : ITEMS CRITIQUE PAR ÉTAPE (23, ~140h)

**Ordre d'attaque recommandé (par valeur × dépendance) :**

## 5.1 Ordre + items

| Ordre | Étape | Items CRITIQUE | Effort | Branche |
|---|---|---|---|---|
| 1 | 3 — Sign In | I1 (searchParams), I2 (callbackUrl), I4 (redirect if auth) | 3h | `feat/T1-signin-I1-I2-I4` |
| 2 | 2 — Sign Up | S1 (auto-login), S3 (redirect if auth) | 2.5h | `feat/T1-signup-S1-S3` |
| 3 | 4 — Onboarding | O3 (retry), O4 (score await), O5 (connect callback) | 19h | `feat/T1-onboarding-O3-O4-O5` |
| 4 | 5 — Home | H1 (hydrate), H3 (progressive reveal) | 11h | `feat/T1-home-H1-H3` |
| 5 | 6 — Chat | C2 (!res.ok), C3 (SPA redirect) | 2.5h | `feat/T1-chat-C2-C3` |
| 6 | 7 — Accounts | A1 (pagination), A3 (selectedRows) | 14h | `feat/T1-accounts-A1-A3` |
| 7 | 8 — Contacts | K1 (pagination), K2 (bulk), K3 (merge dupes) | 24h | `feat/T1-contacts-K1-K2-K3` |
| 8 | 10 — Meetings | M1 (edit notes), M2 (auto-send follow-up), M3 (MS Calendar) | 13h | `feat/T1-meetings-M1-M2-M3` |
| 9 | 11 — Opportunities | Y1 (timeline), Y2 (health score), Y3 (auto-progression) | 26h | `feat/T1-opps-Y1-Y2-Y3` |
| 10 | 9 — Sequences | Q1 (analytics), Q2 (post-launch edit) | 18h | `feat/T1-sequences-Q1-Q2` |
| 11 | 12 — Settings | N1 (GDPR), N2 (profile security) | 18h | `feat/T1-settings-N1-N2` |
| 12 | 13 — Errors | E2 (session UX), E3 (error boundaries), E5 (destructive confirms) | 16h | `feat/T1-errors-E2-E3-E5` |

Pour chaque étape : Kiro spec dans `_specs/T1-<etape>/` (1 seul spec pour le groupe d'items), build tasks en série, merge.

## 5.2 Détails par item

**Rappel :** chaque item est détaillé dans son fichier `_specs/REQUIREMENTS/<N>-<etape>.md` §1.X correspondant. Tu te réfères à ce doc pour :
- Les problèmes précis du code actuel
- Les exigences UX/API/A11y
- Les exemples de code
- Les tests à écrire
- Les décisions produit à prendre

**Règle :** AVANT d'écrire le code d'un item, relis la section correspondante de son doc REQUIREMENTS. Ne pars pas de mémoire.

**Pour chaque item, la tasks.md du Kiro doit lister :**
1. Les fichiers à toucher (exact paths).
2. Les nouveaux fichiers à créer (exact paths + purpose).
3. Les migrations Drizzle si nécessaires.
4. Les tests à ajouter (fichier + `describe`).
5. Le verify step (commande).

## 5.3 Règle de délégation

Si un item dépend d'une foundation non livrée en Phase 1 → bloqué → retour en Phase 1 livrer la foundation, puis revenir.

## 5.4 Criteria fin T1 Phase 2

- [ ] 23 items CRITIQUE mergés main
- [ ] Toutes les étapes ont au moins 1 sprint Kiro complet
- [ ] `_reports/t1-completion.md` exhaustif : features, SHA, analytics events added, known debts
- [ ] Typecheck + vitest + regression scripts verts
- [ ] `DECISIONS_LOG.md` mis à jour avec toutes les décisions prises autonome

---

# SECTION 6 — CRASH RECOVERY + OBSERVABILITY

## 6.1 Progress file

Fichier `_harness/progress.txt`, append-only :
```
2026-04-14T09:23:00Z | T0.1 | STARTED
2026-04-14T09:41:00Z | T0.1 | COMMITTED abc1234
2026-04-14T09:41:10Z | T0.2 | STARTED
2026-04-14T10:55:00Z | T0.2 | COMMITTED def5678
...
2026-04-14T15:30:00Z | T0 | MERGED main
2026-04-14T15:30:05Z | T1-F1 | STARTED
```

Au démarrage de session : read last line, resume à partir de là.

## 6.2 Observability

- Grep count des silent catches après chaque commit → log dans `_reports/silent-catches-count.txt`.
- Typecheck duration → log dans `_reports/typecheck-duration.txt`.
- Test count + pass rate → log dans `_reports/test-metrics.txt`.

## 6.3 Harness health

`_reports/harness-health.md` — append à la fin de chaque sprint :
- Sprint name + SHA
- Duration
- Tasks planned vs done
- Regressions détectées
- Deviations from plan (si tu as dû improviser)

## 6.4 Decisions log

`_specs/REQUIREMENTS/DECISIONS_LOG.md` — chaque décision non triviale prise en autonomie :

```markdown
## 2026-04-14 — T1-F1 pagination : URL state or state-only ?

**Choix :** URL state (query params).
**Raisonnement :** permet de partager un URL précis (state = page 3 sort by score), de hit back button et revenir, et d'éviter un state-store global.
**Alternatives :** juste useState local (plus simple mais pas shareable).
**Réversibilité :** facile (changer hook implem sans casser API consumers).
```

---

# SECTION 7 — ESCALATION + CRITERIA D'ARRÊT

## 7.1 Quand écrire `_harness/escalation.md`

Stop immédiatement et écris ce fichier si :
- 5 échecs consécutifs sur un même item (spec wrong, infrastructure blocker, ambiguïté irrésolvable)
- Crash irrécupérable (DB migration broken, prod broken, git state broken, deps cassées)
- Action destructive nécessaire qui n'est pas autorisée par §2.8
- Décision produit clé où 2 options ont un impact opposé et les docs ne tranchent pas
- Budget context window critique et un summary se perd plus qu'il n'aide

Template escalation.md :
```markdown
# Escalation — <date>

## What happened
<description précise>

## Why I stopped
<raison>

## State du repo
- Branche courante : <...>
- Dernier commit : <SHA>
- Uncommitted changes : <list>

## Options pour Martin
1. <option A> — risque, effort
2. <option B> — risque, effort
3. <option C>

## Recommendation
<si j'ai un favori>
```

## 7.2 Fin normale T1

Après merge du dernier item T1 Phase 2 :
1. Run `npx tsc --noEmit -p .` (doit être 0 erreur).
2. Run `npx vitest run` (tous verts).
3. Run `_harness/regression.sh` si existe.
4. Écrire `_reports/t1-completion.md` avec :
   - Liste des features livrées (T0.1-T0.8 + T1-F1 à F13 + T1 Phase 2 × 12 étapes)
   - SHAs des commits principaux
   - Events PostHog ajoutés (count)
   - Nouveaux tests (count)
   - Deps ajoutées
   - Env vars ajoutées (update `PROD_SETUP.md`)
   - Known debts / items T2 non faits
   - Recommendations pour next session
5. Écrire dans memory via `remember()` si Rippletide MCP : "T0+T1 livrés, SHA=<last>, prochaine tranche T2 items HAUTE."
6. Stop.

---

# SECTION 8 — DÉMARRAGE

Exécute dans cet ordre :

1. Lire les 5 docs de la §1.2.
2. Lire `_specs/REQUIREMENTS/NEXT_SESSION_PROMPT.md` (ce fichier, en entier).
3. Lire les 13 docs `_specs/REQUIREMENTS/01-*.md` à `13-*.md` (scan rapide, détails au moment du besoin).
4. Produire `_reports/session-start.md` (inventaire §1.3).
5. Créer `_harness/progress.txt` avec ligne de démarrage.
6. `TaskCreate` pour les 8 items T0 + les 13 foundations + les 12 étapes critiques = 33 tâches.
7. Attaquer T0.1. `TaskUpdate` STARTED / COMMITTED au fil.
8. Après T0 complet, écrire `_reports/t0-completion.md` + passer à T1 Phase 1.
9. Après T1 Phase 1 complet, écrire `_reports/t1-phase1-completion.md` + passer à T1 Phase 2.
10. Après T1 Phase 2 complet, écrire `_reports/t1-completion.md` + STOP.

**Ne stoppe jamais entre deux items. Ne demande jamais de confirmation.** Tu as tout le contexte nécessaire. Si tu hésites, `DECISIONS_LOG.md` et continue.

**Duration estimate :** 50-80 sessions Claude Code (context window reset entre sessions), ou ~2-3 mois calendar si Martin lance une session par jour.

Bonne session. Ship it.
