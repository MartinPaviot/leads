# Orion — Runbook d amorcage (AVANT de lancer les prompts)

> Ce que **l operateur/founder** fait a la main, **avant** de coller le moindre prompt du
> `LAUNCH-KIT.md`. Niveau commande, rien de hand-wave : chaque etape a sa commande exacte, sa
> verification, et le mecanisme reel sur lequel elle s appuie. Quand un mecanisme manque dans le
> code/les specs, c est dit franchement avec le fallback.
>
> **Source de verite** : les `file:line` cites viennent du code Elevay reel
> (`C:/Users/ombel/leads/app/apps/web/src/...`) — c est la provenance a copier, pas un import.
> En cas de conflit avec une formulation anterieure d une spec, **ce runbook tranche pour ce qui
> touche aux mecanismes verifies** (un ecart connu est signale `DIVERGENCE` ci-dessous).
>
> **DIVERGENCE majeure a connaitre tout de suite** : `00-ARCHITECTURE.md §6` et
> `00-PREREQUISITES.md §1.2` disent de stocker la cle `mcp_*` en **sha256**. **C est faux contre le
> code reel.** Le verificateur (`app/api/mcp/route.ts:228-267`) fait `bcryptjs.compare(token,
> keyHash)`. Une cle stockee en sha256 ne matchera **jamais** -> 401 sur tout appel MCP. Ce runbook
> mint la cle en **bcrypt (cost 10)**, conforme a `app/api/mcp/keys/route.ts:50-119`. Voir §4.

---

## 0. Vue d ensemble (ordre des operations)

Sequence numerotee. Les dependances dures sont entre parentheses.

```
[1] Repo Orion amorce (clone vide + copie spec/research/brand + Node 22 + corepack pnpm 10.15.1)
        |
        v
[3] DB partagee + roles  ---- (independant du repo : se fait en psql direct sur Supabase)
     elevay_app (runtime, restreint)  +  owner postgres (migrations only)
        |
        v
[4] Tenant elevay + user admin + cle mcp_*  (psql owner, hors-bande ; cle bcrypt)
        |  (besoin de [3] : roles/DB joignables)
        v
[2] .env.local   (besoin de [4] : ORION_TENANT_ID, et des 2 DATABASE_URL de [3])
        |
        +--> [5] Config MCP/permissions du repo (.mcp.json + .claude/settings.local.json)
        |        (independant ; pose des [1] pour que meme la Vague 0 ait Playwright/context7)
        |
        +--> [6] Transport demo HTTPS (ngrok/Vercel)   -- differable jusqu a pack7
        |
        +--> [7] Migrations & seed   -- db:push (dev, pack1) / db:migrate:apply owner ; seed = pack7
        |
        v
[8] CHECKLIST PRE-LANCEMENT cochee  ->  ouvrir LAUNCH-KIT.md, coller le prompt Vague 0
```

Points cles :
- **[3] et [4] ne dependent pas du repo** : ce sont des operations psql directes sur l instance
  Supabase qui portera le tenant `elevay`. On peut (et on doit) les faire meme si pack0 n a pas
  encore scaffolde `package.json`/`tsconfig`.
- **[2] depend de [4]** : `.env.local` a besoin de `ORION_TENANT_ID` (l id du tenant cree en [4])
  et des deux chaines `DATABASE_URL`/`DATABASE_URL_OWNER` (roles de [3]).
- **`package.json` / `tsconfig` ne sont PAS crees a la main** : c est `pack0` (Vague 0) qui les
  scaffolde (cf `packages/pack0-foundation.md §0`). L operateur cree seulement le repo, copie le
  corpus, fige Node/pnpm, et pose les 2 fichiers de config MCP ([5]).
- Le **seed** (tenant peuple, hero FIGE) est le travail de `pack7`, **pas** de l operateur. [4] ne
  cree que la **ligne** tenant + user + cle ; le contenu metier vient plus tard.

---

## 1. Le repo Orion (amorcage)

Orion est un repo **separe** (`@orion/web`), DB partagee. L objectif de cette etape : un repo Git
vide, le corpus de spec dedans, et le toolchain fige (Node 22 + pnpm 10.15.1 via corepack). On
**ne cree pas** `package.json`/`tsconfig`/`next.config` a la main : `pack0` les scaffolde.

```bash
# 1.1 Creer le repo distant (GitHub) puis cloner — adapter l org/nom.
gh repo create <org>/orion --private --clone
cd orion
# (ou : mkdir orion && cd orion && git init -b main)

# 1.2 Copier le corpus de spec/research/brand depuis le repo leads dans le repo Orion.
#     Sous Git Bash :
cp -r /c/Users/ombel/leads/orion/spec    ./spec
cp -r /c/Users/ombel/leads/orion/research ./research
cp -r /c/Users/ombel/leads/orion/brand   ./brand
cp    /c/Users/ombel/leads/orion/README.md ./README.md   # facultatif

# 1.3 Figer Node 22 (.nvmrc, identique a Elevay) + activer corepack/pnpm 10.15.1.
printf '22\n' > .nvmrc
nvm use 22 || nvm install 22            # si nvm-windows
corepack enable
corepack prepare pnpm@10.15.1 --activate
node -v        # -> v22.x
pnpm -v        # -> 10.15.1

# 1.4 Pre-creer le .gitignore d amorcage (pack0 completera .auth/, .playwright-mcp/, etc.)
cat > .gitignore <<'EOF'
node_modules/
.next/
.env
.env.local
.env*.local
.auth/
.playwright-mcp/
playwright-report/
test-results/
EOF

# 1.5 Premier commit.
git add .nvmrc .gitignore spec research brand README.md
git commit -m "chore(foundation): bootstrap Orion repo (spec/research/brand + Node 22 + pnpm 10.15.1)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin main
```

Apres ca, **ne pas** `pnpm install` : il n y a pas encore de `package.json` (pack0 le pose). La
Vague 0 fera `git checkout -b feat/orion-pack0` puis scaffold + `pnpm install --frozen-lockfile`.

> **Ou vivra `@orion/web`** : `pack0` calque le layout Elevay (`app/package.json` racine monorepo +
> `app/apps/web/package.json` = le package `@orion/web`). Donc l app web tombera sous
> **`app/apps/web/`**. C est la que `.env.local` ira (§2) — cree le dossier maintenant si tu veux
> deposer l env avant pack0 : `mkdir -p app/apps/web`.

---

## 2. `.env.local` — le fichier complet, pret a copier

**Qui lit quoi (mecanisme reel) :**
- **Next.js (dev/build/runtime)** auto-charge `app/apps/web/.env.local`. Pas de loader custom :
  `db/index.ts` et `auth.ts` lisent `process.env.*` directement. C est le fichier canonique.
- **Vitest** ne passe que `ANTHROPIC_*`/`OPENAI_*` au test (loader filtre,
  `CONFIG-TOOLING.md §4`) — donc l env complet n est pas necessaire pour `pnpm test`.
- **Scripts `tsx`** ne chargent **pas** l env tout seuls : ils dependent du flag
  `--env-file=.env.local` (ex. `tsx --env-file=.env.local scripts/...`). **PIEGE** : le script de
  migration `db:migrate:apply` (= `tsx scripts/apply-migrations.ts`) **n a pas** `--env-file` dans
  `package.json` et lit **`DATABASE_URL` uniquement** (`apply-migrations.ts:43-47`). Voir §7 pour
  le contournement.
- **drizzle-kit** (`db:push`/`db:studio`) lit `DATABASE_URL` via `drizzle.config.ts:8` et
  auto-charge `.env`/`.env.local`.

**Emplacement** : `app/apps/web/.env.local` (a cote du `package.json` de `@orion/web`).
**Jamais commite** : couvert par `.gitignore` (§1.4) **et** par le hook `secret-scan` au commit.
**Les cles partenaires sink (Instantly / Orange Slice / Lopus / webhook) ne vont PAS ici** : elles
sont per-tenant **chiffrees dans `integration_credentials`** (D7). Un test `env-shape` (pack7)
asserte qu aucune cle sink n est lue depuis `process.env`. **Fiber** est une cle d **entree**
(`x-api-key` per-tenant) — egalement en DB, pas en env.

```bash
# Generer un secret Auth.js fort :
npx auth secret        # imprime un AUTH_SECRET base64 ; ou : openssl rand -base64 33
```

Fichier `app/apps/web/.env.local` (remplir les `...`) :

```dotenv
# ============================================================
# Orion — .env.local  (tenant elevay, DB partagee leads)
# JAMAIS commite. Cles sink (Instantly/OrangeSlice/Lopus/Fiber) = en DB, pas ici.
# ============================================================

# --- DB partagee : DEUX roles distincts (cf §3) -------------------------------
# Runtime = role RESTREINT elevay_app (soumis RLS). Supavisor transaction-mode :6543.
DATABASE_URL=postgresql://elevay_app:...@<host>.pooler.supabase.com:6543/postgres   # REQUIS
# Owner = role postgres, MIGRATIONS ONLY, jamais lu par le code (tripwire grep=0 dans src).
# Operateur-only. Pointe le port direct :5432 (DDL hors pool).
DATABASE_URL_OWNER=postgresql://postgres:...@<host>.supabase.com:5432/postgres      # REQUIS (migrations/seed)

# --- Scope tenant -------------------------------------------------------------
# Id de la ligne tenants creee en §4. Court-circuite getElevayTenantId() (pack0).
ORION_TENANT_ID=elevay                                                              # REQUIS (recommande)

# --- Auth (Auth.js v5 / next-auth beta.30) ------------------------------------
AUTH_SECRET=...                # REQUIS — `npx auth secret`. AUTH_SECRET est primaire ;
                               # NEXTAUTH_SECRET n est qu un alias de repli (beta-access.ts:43).
AUTH_URL=http://localhost:3000     # dev. (NEXTAUTH_URL = alias de repli.)
# OAuth (login humain) — optionnels pour booter ; requis pour se connecter via Google/Microsoft.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
# Sign-up : invitation-only par defaut en prod (auth.ts:147). Laisser off pour la demo.
# SELF_SERVE_SIGNUP_ENABLED=
# BETA_SIGNUP_CODE=

# --- LLM (Anthropic principal) ------------------------------------------------
ANTHROPIC_API_KEY=sk-ant-...                                                        # REQUIS
# baseURL : DOIT finir par /v1 (ai-provider.ts:38-46 ; allowlist SSRF :67-80).
# Defaut US = https://api.anthropic.com/v1. EU souverain :
ANTHROPIC_API_BASE=https://eu.anthropic.com/v1   # optionnel (defaut US /v1)
ANTHROPIC_REGION=eu                              # optionnel (raccourci vers la base EU)
OPENAI_API_KEY=sk-proj-...        # recommande : embeddings + fallback circuit-breaker
# MISTRAL_API_KEY=                # opt : provider EU-souverain
# LLM_PROVIDER=anthropic          # anthropic|mistral|auto
# AI_DISABLED=                    # =1 pour couper tout LLM (kill-switch)

# --- Inngest (bg jobs / crons) ------------------------------------------------
INNGEST_EVENT_KEY=...             # requis pour les jobs
INNGEST_SIGNING_KEY=...

# --- Sources d ENTREE (Tier 0/1) ----------------------------------------------
APOLLO_API_KEY=...                # requis pour la source apollo_*
# CRUNCHBASE_API_KEY=             # opt : funding (complement SEC)
# PAPPERS_API_KEY=                # opt : registre FR (Sirene reste keyless)
# ZEFIX_API_USER=                 # opt : registre CH
# ZEFIX_API_PASSWORD=

# --- GDPR / region ------------------------------------------------------------
GDPR_REGION=eu                    # active la garde EU-host sur DATABASE_URL au boot
LAWFUL_BASIS_GATE=eu              # gate 5 (base legale)
# DSAR_ERASE_ENABLED=

# --- Flags demo (cf 00-PREREQUISITES §1.1, G5) --------------------------------
TARGETING_GATE_ENABLED=on         # CLE DEMO : sans ca, pas de skip not_targeted (climax muet)
RESEARCH_AGENT_ENABLED=1          # recherche per-prospect
ORION_INGEST_ENABLED=on           # net-new (defaut OFF dans le code ; on pour la demo)
ORION_EXPORT_ENABLED=on           # net-new (idem)

# --- Observabilite (opt) ------------------------------------------------------
# SENTRY_DSN=
# NEXT_PUBLIC_POSTHOG_KEY=
```

**Verifications :**
```bash
# Boot minimal = ces 3 vars suffisent a demarrer (REQ-29) :
grep -E '^(DATABASE_URL|AUTH_SECRET|ANTHROPIC_API_KEY)=' app/apps/web/.env.local | wc -l   # -> 3
# baseURL Anthropic finit bien par /v1 :
grep -E '^ANTHROPIC_API_BASE=' app/apps/web/.env.local   # doit se terminer par /v1 (ou ligne absente = defaut /v1)
# Aucune cle sink en env (doit etre vide) :
grep -Ei 'INSTANTLY|ORANGE|LOPUS|FIBER|WEBHOOK_SECRET' app/apps/web/.env.local || echo "OK: aucune cle sink"
```

> **Piege du `\n` (AUTH_SECRET)** : dotenv/@next/env etend les `\n` dans une valeur entre
> guillemets. Si tu mets `AUTH_SECRET` entre `"..."` avec un `\n`, le secret reel portera un
> newline. Pour la forge du cookie e2e (`CONFIG-TOOLING.md §2`) il faut matcher **octet pour
> octet** — le plus simple : valeur **sans guillemets**, sans `\n`.

---

## 3. La DB partagee + les roles

Orion ne cree **pas** de base : il se branche sur la **DB Supabase `leads`** d Elevay, scope tenant
`elevay`, isolation RLS. Deux roles, deux usages :

| Role | Var env | Usage | Port |
|---|---|---|---|
| `elevay_app` (non-owner, RLS-subject) | `DATABASE_URL` | **runtime** (lectures/ecritures app via `withTenantTx`) | Supavisor `:6543` (transaction-mode) |
| `postgres` (owner) | `DATABASE_URL_OWNER` | **migrations/DDL/seed one-shot**, hors-bande | direct `:5432` |

**Mecanisme RLS reel** (`db/rls.ts:44-54`) : le seul binding tenant autorise est
`withTenantTx(tenantId, fn)`, qui ouvre une transaction et fait
`SELECT set_config('app.tenant_id', <id>, true)` — **3e argument `true` = transaction-local**.
**PIEGE verifie** (`rls.ts:19-23`, incident 2026-06-10) : **jamais** `set_config(..., false)`
(session-local) — ca empoisonne les backends pooles Supavisor en mode transaction. Un tripwire
grep le tree (`__tests__/rls.test.ts`) -> 0 occurrence de `set_config(..., false)`.

**Modele de roles** (`drizzle/0103_rls_backfill.sql`) : 4 tables `postgres`-owned (ENABLE RLS) + 8
tables `elevay_app`-owned (ENABLE + **FORCE** RLS). Policy : permissive si `app.tenant_id` non set,
sinon `tenant_id = current_setting('app.tenant_id', true)`.

**GAP HONNETE — il n existe AUCUNE migration `CREATE ROLE elevay_app` / `GRANT` dans le repo.**
`0103` ne fait que **referencer** `elevay_app` comme role pre-existant. La creation des roles, la
reassignation d ownership des tables et les GRANT sont une **operation Supabase manuelle**,
hors-bande, a la charge de l operateur. Fallback (a executer en owner sur l instance de demo) :

```bash
# Se connecter en owner (psql + la chaine owner Supabase) :
psql "$DATABASE_URL_OWNER"
```
```sql
-- 3.1 Verifier si le role runtime existe deja :
SELECT rolname FROM pg_roles WHERE rolname = 'elevay_app';

-- 3.2 S il manque, le creer (login, NON superuser, NON bypassrls) :
CREATE ROLE elevay_app LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- 3.3 GRANT de base (schema public + tables/sequences existantes) :
GRANT USAGE ON SCHEMA public TO elevay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO elevay_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO elevay_app;
-- Les futures tables (net-new Orion) heritent automatiquement :
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO elevay_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO elevay_app;
```

> **G4 (rappel)** : chaque table **net-new** Orion (`integration_credentials`, `ingest_*`,
> `export_*`, `outbound_destinations`, `signal_snapshots`) doit aussi recevoir ENABLE/FORCE RLS +
> une policy `tenant_id = current_setting('app.tenant_id', true)`. C est porte par les migrations
> pack1/pack7 (owner one-shot), pas par cette etape — mais le `ALTER DEFAULT PRIVILEGES` ci-dessus
> garantit que `elevay_app` aura les GRANT des leur creation.

**Verifications :**
```sql
-- Roles en place :
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('elevay_app','postgres');
-- (elevay_app : rolsuper=f, rolbypassrls=f)
```
```bash
# DATABASE_URL pointe bien le pooler :6543, DATABASE_URL_OWNER le :5432 direct :
grep -E '^DATABASE_URL=' app/apps/web/.env.local        | grep -q ':6543' && echo "app -> 6543 OK"
grep -E '^DATABASE_URL_OWNER=' app/apps/web/.env.local  | grep -q ':5432' && echo "owner -> 5432 OK"
```

---

## 4. Le tenant `elevay` + user + cle `mcp_*`

Sans une ligne `tenants` `elevay` + au moins un `users` admin + une cle `mcp_*`, **tout appel MCP
renvoie 401** et le seed n a pas de tenant a interroger. Le `tenantId` vient **toujours** du Bearer
(invariant #1), jamais d un argument.

**GAP HONNETE** : aucun script du repo ne cree le couple `auth_user`+`users`, ni ne pose un mot de
passe credentials, ni ne mint une cle `mcp_*` hors-ligne. `seed-pilae-tenant.ts` cree **seulement**
une ligne tenant et est epingle a l id `pilae`. La procedure ci-dessous est donc **du SQL direct en
owner** (le `ensure-elevay-tenant.ts` evoque par pack7 n existe pas encore au stade pre-lancement).

### 4.1 Tenant + auth_user + users (psql owner)

**Schemas reels** : `tenants` (`core.ts:20-27` : id/name/plan/settings/timestamps, seul `name`
obligatoire) ; `auth_user` (`auth.ts:21-41` : id/email/emailVerified/`password_hash` bcrypt) ;
`users` (`core.ts:29-51` : id/`clerk_id`=auth_user.id/`tenant_id`/email/role). La jointure
runtime est `users.clerk_id == auth_user.id` ; le scope vient de `users.tenant_id`.

```bash
# Generer le hash bcrypt du mot de passe de login (cost 12) — voir 4.3 pour installer bcryptjs :
PWHASH=$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" 'MotDePasseFort!')
echo "$PWHASH"   # commence par $2a$12$ ou $2b$12$

psql "$DATABASE_URL_OWNER"
```
```sql
-- 4.1.a Tenant a id DETERMINISTE 'elevay' (= ORION_TENANT_ID ; evite le lookup par nom).
INSERT INTO tenants (id, name, plan, settings)
VALUES ('elevay', 'Elevay', 'trial', '{"mcpApiKeys":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 4.1.b auth_user (login credentials ; coller le hash bcrypt genere ci-dessus).
INSERT INTO auth_user (id, email, "emailVerified", password_hash)
VALUES (gen_random_uuid()::text, 'admin@elevay.dev', now(), '<COLLER_PWHASH>')
ON CONFLICT (email) DO NOTHING
RETURNING id;     -- noter <AUTH_ID>

-- 4.1.c users (app) rattache au tenant en role admin ; clerk_id = auth_user.id.
INSERT INTO users (id, clerk_id, tenant_id, email, role)
VALUES (gen_random_uuid()::text, '<AUTH_ID>', 'elevay', 'admin@elevay.dev', 'admin')
ON CONFLICT (clerk_id) DO NOTHING;
```

Le login fonctionne alors via le provider Credentials (`auth.ts:336,359` compare contre
`password_hash`), et la presence de la ligne `users` court-circuite `resolveUserTenant`
(`auth.ts:82-88`) — aucun tenant solo n est cree.

> **DIVERGENCE secondaire** : `CONFIG-TOOLING.md §2` (global-setup e2e) requete `tenants` par
> `t.slug = 'elevay'`. **La table `tenants` n a pas de colonne `slug`** (`core.ts:20-27`). Deux
> parades : (a) garder l id deterministe `elevay` + poser `ORION_TENANT_ID=elevay` (§2) et les
> overrides `E2E_TENANT_ID`/`E2E_AUTH_USER_ID` de `global-setup.ts:200-209` ; (b) faire corriger le
> SELECT en `t.id = 'elevay'` (ou `lower(t.name)='elevay'`) cote pack0. Tant que (a) est en place,
> rien ne bloque.

### 4.2 Cle `mcp_*` (bcrypt — pas sha256)

**Mecanisme reel** (`app/api/mcp/keys/route.ts:12-119`) : `rawKey = "mcp_" + 16 octets hex` ;
`keyHash = bcrypt(rawKey, 10)` ; `keyPrefix = rawKey.slice(0,8) + "..."`. Verification
(`app/api/mcp/route.ts:228-267`) : scan de tous les tenants, check `keyPrefix` puis
`bcryptjs.compare(token, keyHash)`. Shape `McpApiKeyEntry` (`tenant-settings.ts:431-446`) :
`{ id, name, keyHash, keyPrefix, createdAt, keyOwnerId? }`.

L endpoint d emission `POST /api/mcp/keys` **exige l app en marche + une session admin** — pas
disponible au stade pre-lancement. On mint donc **hors-ligne** (bcrypt + jsonb append) :

```bash
# Generer la cle en clair (a CONSERVER une seule fois — c est le Bearer de la demo) :
RAW=$(node -e "console.log('mcp_'+require('crypto').randomBytes(16).toString('hex'))")
echo "RAW (a garder secret) : $RAW"
# Hash bcrypt cost 10 + prefix, au format McpApiKeyEntry :
node -e '
const b=require("bcryptjs"),c=require("crypto");
const raw=process.argv[1];
const entry={id:c.randomUUID(),name:"orion-demo",keyHash:b.hashSync(raw,10),
  keyPrefix:raw.slice(0,8)+"...",createdAt:new Date().toISOString()};
console.log(JSON.stringify(entry));' "$RAW"
# -> copier le JSON imprime (= <ENTRY_JSON>)
```
```sql
-- Append atomique dans tenants.settings.mcpApiKeys[] (psql owner) :
UPDATE tenants
SET settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{mcpApiKeys}',
  coalesce(settings->'mcpApiKeys', '[]'::jsonb) || '[<ENTRY_JSON>]'::jsonb,
  true)
WHERE id = 'elevay';
```

### 4.3 Installer bcryptjs pour les commandes node ci-dessus

`bcryptjs` n est pas un CLI ; il faut le module sous la main. Tant que pack0 n a pas tourne :

```bash
mkdir -p /tmp/orion-keygen && cd /tmp/orion-keygen && npm i bcryptjs@^3
# puis lancer les `node -e` de 4.1/4.2 depuis ce dossier (node resout bcryptjs localement).
```
Apres pack0 + `pnpm install`, on peut aussi les lancer depuis `app/apps/web/` (bcryptjs y est dep).

### 4.4 Verification (une fois l app en marche — Vague 0 dev server, ou pack7)

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $RAW" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq .
# Attendu : 200, reponse JSON-RPC valide (tenantId resolu = elevay, cote serveur).
```
Si 401 : la cle a probablement ete stockee en sha256 (DIVERGENCE §0) ou le `keyPrefix` ne matche
pas les 8 premiers caracteres du RAW. Re-mint en bcrypt (4.2).

---

## 5. Config MCP/permissions du repo

A poser **des l amorcage** (apres §1), pour que **meme la session Vague 0** dispose de Playwright +
context7. Contenu integral et a jour dans `MCP-AND-PERMISSIONS.md` + `CONFIG-TOOLING.md §3` —
**copier tel quel**, ne pas re-deriver. Resume operatoire :

```bash
# 5.1 .mcp.json a la racine du repo Orion (wrapper Windows `cmd /c npx`) :
#     serveurs context7 (@upstash/context7-mcp) + playwright (@playwright/mcp).
#     Copier le bloc de MCP-AND-PERMISSIONS.md §A (ou CONFIG-TOOLING §3 pour la variante
#     avec --storage-state .auth/elevay-tenant.json).
cp /c/Users/ombel/leads/.mcp.json ./.mcp.json   # point de depart (context7) ; AJOUTER le serveur playwright

# 5.2 .claude/settings.local.json : allowlist MCP LECTURE SEULE
#     (snapshot/screenshot/navigate/console/network/wait/resize) + outils MUTATEURS hors allowlist
#     (garde-fou DB partagee) + enabledMcpjsonServers:["context7","playwright"].
#     Copier le bloc de MCP-AND-PERMISSIONS.md §B.
mkdir -p .claude
```

Regles dures rappelees :
- **Un seul navigateur a la fois** (CLAUDE.md) : pas d agent de fond Playwright pendant qu une
  session pilote ; pas de `--isolated` multi-agent.
- Les outils mutateurs (`browser_click/type/fill_form/evaluate/run_code_unsafe/press_key/
  select_option/file_upload`) restent **hors** `allow` -> confirmation requise (protege le tenant
  `elevay` partage).
- **Verif** : `grep -c "browser_click\|browser_type\|browser_evaluate" .claude/settings.local.json`
  -> doit etre **0** dans `allow`.

```bash
# 5.3 Commit (les fichiers de config sont versionnes ; pas de secret dedans) :
git add .mcp.json .claude/settings.local.json
git commit -m "chore(mcp): pose .mcp.json (context7+playwright) + permissions lecture seule

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Connecteurs claude.ai (niveau compte, PAS dans le repo)** — a garder connectes avant la Vague 0
(cf `MCP-AND-PERMISSIONS.md §C`) :
- **Apollo.io** (`mcp__claude_ai_Apollo_io__*`) — enrichissement firmo/contacts + job-postings.
- **datagouv** (`mcp__datagouv__*`) — signaux souverains FR (BODACC, recherche-entreprises) : l edge
  FR du hero demo.
- **Vercel** (`mcp__plugin_vercel_vercel__*`) — deploiement preview/prod + logs.
- Gmail/Calendar/Drive : optionnels (hors slice signal->brief->outbound).

---

## 6. Transport demo (pack7)

Claude Desktop exige **HTTPS** vers `/api/mcp` ; le serveur est du **POST JSON-RPC sans SSE**
(`route.ts:938`). Il faut un tunnel HTTPS public vers le dev server local (port 3000). **Differable
jusqu a pack7** (le slice MVP/e2e peut piloter la surface MCP en `http://localhost`), mais a valider
avant toute demo Claude Desktop.

```bash
# Option A — ngrok (le plus rapide) :
ngrok http 3000          # -> URL https://<sub>.ngrok-free.app ; pointer Claude Desktop dessus

# Option B — Vercel preview deploy (URL https stable) :
#   deploiement via le connecteur Vercel / `vercel` CLI ; rootDirectory = app/apps/web.

# Valider le round-trip initialize + tools/list (remplacer l URL + le Bearer) :
curl -s -X POST https://<sub>.ngrok-free.app/api/mcp \
  -H "Authorization: Bearer $RAW" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq .
curl -s -X POST https://<sub>.ngrok-free.app/api/mcp \
  -H "Authorization: Bearer $RAW" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq '.result.tools | length'
```

> Le tunnel reel + l appairage OAuth/Bearer cote Claude Desktop sont **operateur-only** (action
> humaine). pack7 fournit les commandes et le statut attendu (`signal-agent-prd §5`,
> `pack7-demo-integration.md §7`), mais ne peut pas etablir le tunnel a ta place.

---

## 7. Migrations & seed

**Mecanisme reel** : le runner drizzle-kit (`db:migrate`) est **cable a `exit 1`** (le journal
s arrete a l idx 12/14 alors que `drizzle/` contient bien plus de `.sql`). Le seul applicateur est
le runner custom `scripts/apply-migrations.ts` (`db:migrate:apply`), qui cree/maintient le ledger
`__elevay_migrations` (filename PK + hash sha256), applique chaque `.sql` non enregistre dans sa
propre transaction. Migrations **additives + `IF NOT EXISTS`** -> re-run sur. Ledger partage ->
numerotation Orion **continue a partir de 0106** (pack1 : 0107+ ; pack7 : 0108+).

```bash
# --- DEV (dans @orion/web), schema en place rapidement (pack1) ---
pnpm --filter @orion/web db:push      # drizzle-kit push, lit DATABASE_URL (role app suffit en dev local)

# --- APPLIQUER les migrations versionnees (prod/demo) ---
# PIEGE : apply-migrations.ts lit DATABASE_URL UNIQUEMENT (pas DATABASE_URL_OWNER) et
# package.json ne passe pas --env-file. Donc on pointe DATABASE_URL sur l owner le temps de l appel :
cd app/apps/web
DATABASE_URL="$DATABASE_URL_OWNER" pnpm exec tsx scripts/apply-migrations.ts
# (ou : DATABASE_URL="$DATABASE_URL_OWNER" pnpm exec tsx --env-file=.env.local scripts/apply-migrations.ts
#  en s assurant que la valeur DATABASE_URL injectee est bien la chaine owner)
```

**Ne jamais** migrer prod/demo depuis une branche non mergee sans validation (memoire
`always-apply-migrations`). Build = instance dev (`leadsens-localdev`) ; demo = l instance qui porte
le tenant `elevay`.

**Seed** : c est le travail de **pack7** (`scripts/seed-demo.ts` + `scripts/seed-hero-frozen.ts`),
**insert-then-score** (jamais de `priorityScore` plaque a la main). L operateur ne seede pas a la
main au pre-lancement ; il s assure seulement que tenant+roles+cle existent (§3/§4) pour que pack7
puisse tourner.

---

## 8. CHECKLIST PRE-LANCEMENT

Cocher dans l ordre. Chaque case a sa preuve (commande/sortie).

**Repo**
- [ ] Repo Orion cree, `spec/` + `research/` + `brand/` copies, premier commit pousse (§1.5).
- [ ] `node -v` = v22.x ; `pnpm -v` = 10.15.1 (corepack actif) ; `.nvmrc` = 22.
- [ ] `package.json`/`tsconfig` **NON** crees a la main (laisses a pack0).

**DB + roles**
- [ ] `SELECT rolname FROM pg_roles WHERE rolname='elevay_app'` -> 1 ligne (role runtime existe).
- [ ] `elevay_app` : `rolsuper=f`, `rolbypassrls=f` ; GRANT + ALTER DEFAULT PRIVILEGES poses (§3).
- [ ] `DATABASE_URL` -> pooler `:6543` ; `DATABASE_URL_OWNER` -> direct `:5432`.

**Tenant + cle**
- [ ] Ligne `tenants` id=`elevay` presente (`SELECT id,name FROM tenants WHERE id='elevay'`).
- [ ] `auth_user` admin + `users` (role=admin, tenant_id='elevay', clerk_id=auth_user.id) crees.
- [ ] Cle `mcp_*` mintee en **bcrypt** (pas sha256) et appendue a `settings.mcpApiKeys[]` ; RAW
      conserve hors-bande (1 seule fois).

**.env.local** (`app/apps/web/.env.local`)
- [ ] Boot minimal present : `DATABASE_URL` + `AUTH_SECRET` + `ANTHROPIC_API_KEY` (3/3).
- [ ] `ANTHROPIC_API_BASE` finit par `/v1` (ou absent = defaut US `/v1`).
- [ ] `ORION_TENANT_ID=elevay` ; `DATABASE_URL_OWNER` present (commente « operateur-only » dans
      `.env.example`, mais reel ici pour les migrations).
- [ ] `TARGETING_GATE_ENABLED=on` (sinon climax `not_targeted` muet) ; `ORION_INGEST_ENABLED=on`,
      `ORION_EXPORT_ENABLED=on`, `RESEARCH_AGENT_ENABLED=1`.
- [ ] Aucune cle sink (Instantly/OrangeSlice/Lopus/Fiber/WEBHOOK_SECRET) en env.
- [ ] Fichier non traque (`git status` ne le liste pas ; hook secret-scan en place).

**Config MCP/permissions**
- [ ] `.mcp.json` : `context7` + `playwright` declares (wrapper `cmd /c npx`).
- [ ] `.claude/settings.local.json` : allowlist **lecture seule** ; **0** outil mutateur dans
      `allow` ; `enabledMcpjsonServers:["context7","playwright"]`.
- [ ] Connecteurs claude.ai connectes : Apollo, datagouv, Vercel.

**Transport (differable jusqu a pack7)**
- [ ] Tunnel HTTPS pret (ngrok/Vercel) ; `initialize` + `tools/list` repondent 200 via le tunnel.

**Migrations (au moment ou pack1/pack7 le demandent, pas avant)**
- [ ] `db:push` dispo en dev ; `apply-migrations.ts` lance avec `DATABASE_URL` pointe sur l owner.

---

Une fois **toutes** les cases ci-dessus cochees -> **ouvrir `LAUNCH-KIT.md`, coller le prompt
Vague 0 (session A : pack0 puis pack1)**.
