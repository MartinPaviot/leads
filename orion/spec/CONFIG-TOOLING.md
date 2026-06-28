# CONFIG OUTILLAGE / TEST / MCP — Orion

Config prête à poser pour le repo Orion (repo séparé, MÊME stack qu'Elevay :
Next 15 ^15.5.15, Vitest ^4.1.8, @playwright/test ^1.60.0, pnpm 10.15.1, Node 22).
DB partagée `leads`, tenant `elevay`, RLS `withTenantTx`. App testée = Next sur
localhost. La QA hostile (CLAUDE.md → EVALUATE) pilote l'app LIVE via Playwright
MCP — **un seul navigateur à la fois**.

Convention de légende dans tout ce doc :

- **REUSE** = copie quasi à l'identique d'un fichier Elevay (la source `file:line`
  est citée). On ne réinvente pas un harnais qui marche.
- **NET-NEW** = spécifique Orion, écrit ici pour la première fois (l'auth-fixture
  JWE notamment — Elevay, lui, passe par le provider Credentials).

Versions exactes (gelées, identiques à Elevay) :

| Paquet | Version |
|---|---|
| next | ^15.5.15 |
| @playwright/test | ^1.60.0 |
| vitest | ^4.1.8 |
| @vitejs/plugin-react | (aligné Elevay) |
| happy-dom | ^20.10.2 |
| @testing-library/react + jest-dom | (aligné Elevay) |
| next-auth | 5.0.0-beta.30 |
| @auth/core | 0.41.0 (résolu par next-auth@5.0.0-beta.30) |
| bcryptjs | ^3.0.3 |
| pnpm | 10.15.1 |
| node | 22 |

---

## 1. PLAYWRIGHT — `playwright.config.ts` + scripts

**REUSE** — réplique de `C:\Users\ombel\leads\app\apps\web\playwright.config.ts:1-63`.
Deux deltas Orion : (a) la commande `webServer` passe par `pnpm --filter @orion/web dev`
(monorepo), (b) ajout de `globalSetup` + `storageState` pour piloter l'app
authentifiée sans OAuth humain (cf. §2). Le reste est identique mot pour mot
(`fullyParallel:false`, `workers` 2/CI 1, timeouts, trace/screenshot/video
`retain-on-failure`, projet `chromium` unique).

Fichier : `app/apps/web/playwright.config.ts`

```typescript
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Orion E2E tests (repo `leads`, tenant `elevay`).
 *
 * Auth strategy: NET-NEW vs Elevay. L'OAuth re-login étant human-only, le
 * global-setup FORGE un cookie de session Auth.js (JWE) pour un user réel du
 * tenant `elevay` et le persiste dans un storageState. Tous les tests
 * démarrent donc authentifiés, sans toucher au provider OAuth.
 * Voir e2e/global-setup.ts (§2 de spec/CONFIG-TOOLING.md).
 *
 * DB partagée + RLS : ne JAMAIS muter la DB en E2E. Les specs sont lecture
 * seule (GET d'API + navigation). Pas de seed/cleanup de tenant ici — on
 * réutilise le tenant `elevay` existant en read-only.
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    // L'auth-fixture forgée par global-setup. Chaque test repart authentifié.
    storageState: ".auth/elevay-tenant.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_SERVER
    ? undefined
    : {
        // Orion = monorepo pnpm/Turbo : on démarre le web via le filtre.
        command: `pnpm --filter @orion/web dev --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          NODE_ENV: "development",
          NEXT_PUBLIC_POSTHOG_KEY: "phc_e2e_test",
          NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        },
      },
});
```

**Scripts `package.json`** (REUSE — `app/apps/web/package.json:13-15`). À poser dans
`app/apps/web/package.json` (champ `name` = `@orion/web`) :

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "lint": "next lint",
    "tsc": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:install": "playwright install chromium"
  }
}
```

Premier run E2E : `pnpm --filter @orion/web e2e:install` puis
`pnpm --filter @orion/web e2e`.

---

## 2. AUTH E2E FIXTURE — global-setup qui FORGE le cookie JWE Auth.js

**NET-NEW** (Orion). Elevay drive le formulaire Credentials (bcrypt) via
`tests/e2e/helpers.ts:61` `loginAs` ; Orion **ne peut pas** : l'OAuth re-login est
human-only et on ne crée pas de password pour le tenant `elevay` partagé. On
**forge** donc une session Auth.js v5 (stratégie JWT → cookie JWE
`authjs.session-token`) pour un user réel du tenant `elevay`, et on l'écrit dans
un storageState Playwright. Tous les tests repartent authentifiés.

Faits qui font marcher la forge (source : mémoire `reference_forge-local-session`,
vérifiée sur Elevay le 2026-06-24) :

- Stratégie session = **JWT** ; cookie `authjs.session-token` (dev http, pas de
  config cookie custom) ; JWE `dir` / `A256CBC-HS512`.
- Chiffrer avec `encode({ token, secret, salt, maxAge })` de **`@auth/core@0.41.0`**
  (la version que `next-auth@5.0.0-beta.30` résout). **`salt` DOIT égaler le nom du
  cookie** (`authjs.session-token`).
- `secret` = `AUTH_SECRET` de `.env.local`. **Piège** : dotenv/@next/env **étend les
  `\n`** dans les valeurs entre guillemets → le vrai secret a souvent un newline
  final ; matcher octet pour octet (charger l'env de la même façon, ou strip des
  quotes + `\\n`→newline).
- Claims attendus par le callback session : `{ name, email, sub, id, tenantId,
  appUserId, role }` où `id` = `auth_user.id`.
- User réel via **`DATABASE_URL_OWNER`** : `auth_user` (id/name/email) jointe à
  `users` (clerk_id/tenant_id/role) pour le tenant `elevay`. Préférer un user avec
  une ligne `connected_mailboxes` pour que l'inbox s'hydrate.
- Côté Playwright, poser le cookie avec **`url`** (pas `domain`) ; ici on écrit
  directement un storageState que `use.storageState` recharge.
- **La session forgée expire** (côté Playwright ~30 min d'inactivité) → le
  global-setup la régénère à chaque run. Read-only : on ne fait que des SELECT +
  un cookie.

Fichier : `app/apps/web/e2e/global-setup.ts`

```typescript
import { encode } from "@auth/core/jwt";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

/**
 * NET-NEW (Orion). Forge un cookie de session Auth.js (JWE) pour un user réel
 * du tenant `elevay` et l'écrit dans .auth/elevay-tenant.json (storageState
 * Playwright). Lancé une fois avant la suite (playwright.config → globalSetup).
 *
 * Read-only : un seul SELECT + l'écriture du fichier d'auth. Ne mute JAMAIS la
 * DB partagée. Régénéré à chaque run (la session expire après ~30 min).
 */

const COOKIE_NAME = "authjs.session-token";
const SALT = COOKIE_NAME; // salt DOIT égaler le nom du cookie
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const AUTH_PATH = path.resolve(__dirname, "../.auth/elevay-tenant.json");

// Piège du `\n` étendu : matcher AUTH_SECRET octet pour octet. @next/env
// l'expose déjà étendu dans process.env quand chargé via next ; en standalone
// on ré-applique l'expansion sur l'éventuel littéral "\\n".
function readAuthSecret(): string {
  const raw = process.env.AUTH_SECRET;
  if (!raw) throw new Error("global-setup: AUTH_SECRET manquant (.env.local)");
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

async function resolveElevayUser() {
  // Override possible par env pour la CI (pas d'accès owner DB) :
  if (process.env.E2E_AUTH_USER_ID && process.env.E2E_TENANT_ID) {
    return {
      id: process.env.E2E_AUTH_USER_ID,
      email: process.env.E2E_USER_EMAIL ?? "demo@elevay.dev",
      name: process.env.E2E_USER_NAME ?? "Elevay Demo",
      tenantId: process.env.E2E_TENANT_ID,
      appUserId: process.env.E2E_APP_USER_ID ?? process.env.E2E_AUTH_USER_ID,
      role: (process.env.E2E_USER_ROLE ?? "admin") as "admin" | "member",
    };
  }
  // Sinon résolution live via le rôle owner (SELECT uniquement).
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) throw new Error("global-setup: DATABASE_URL_OWNER manquant");
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const rows = await sql/* sql */`
      SELECT au.id, au.email, au.name, u.tenant_id, u.id AS app_user_id, u.role
      FROM auth_user au
      JOIN users u ON u.clerk_id = au.id
      JOIN tenants t ON t.id = u.tenant_id
      WHERE t.slug = 'elevay'
      ORDER BY (
        SELECT count(*) FROM connected_mailboxes cm WHERE cm.user_id = u.id
      ) DESC
      LIMIT 1
    `;
    if (!rows.length) throw new Error("global-setup: aucun user tenant `elevay`");
    const r = rows[0];
    return {
      id: r.id as string,
      email: r.email as string,
      name: (r.name as string) ?? r.email,
      tenantId: r.tenant_id as string,
      appUserId: r.app_user_id as string,
      role: r.role as "admin" | "member",
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function globalSetup() {
  const secret = readAuthSecret();
  const u = await resolveElevayUser();

  const maxAge = 30 * 24 * 60 * 60; // 30 j
  const token = {
    name: u.name,
    email: u.email,
    sub: u.id,
    id: u.id,
    tenantId: u.tenantId,
    appUserId: u.appUserId,
    role: u.role,
  };

  const value = await encode({ token, secret, salt: SALT, maxAge });

  const storageState = {
    cookies: [
      {
        name: COOKIE_NAME,
        value,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
        expires: Math.floor(Date.now() / 1000) + maxAge,
      },
    ],
    origins: [] as Array<{ origin: string; localStorage: { name: string; value: string }[] }>,
  };

  mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  writeFileSync(AUTH_PATH, JSON.stringify(storageState, null, 2));

  // Sanity : confirmer que le cookie décrypte côté serveur AVANT la suite.
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { cookie: `${COOKIE_NAME}=${value}` },
  });
  const json = (await res.json().catch(() => null)) as { user?: unknown } | null;
  if (!json?.user) {
    throw new Error(
      "global-setup: cookie forgé non décrypté (AUTH_SECRET mismatch — piège du \\n ?)"
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[e2e] session forgée pour ${u.email} (tenant elevay) → ${AUTH_PATH}`);
}
```

`.gitignore` (Orion) : ajouter `\.auth/` (porte un cookie de session — jamais
commité) et `.playwright-mcp/` + `playwright-report/` + `test-results/`.

---

## 3. PLAYWRIGHT MCP — `mcp.json` (QA hostile) + règle un-seul-navigateur

**NET-NEW config, paquets officiels.** La QA hostile (EVALUATE) pilote l'app LIVE
via le serveur **`@playwright/mcp`** (Microsoft, ID Context7 `/microsoft/playwright-mcp`).
On garde **Context7** (docs libs) déjà utilisé par Elevay (`@upstash/context7-mcp`).
Sur Windows, wrapper `cmd /c npx` requis (comme `C:\Users\ombel\leads\.mcp.json`).

Fichier : `orion/.mcp.json` (racine du repo Orion)

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "-y", "@playwright/mcp@latest",
        "--browser", "chromium",
        "--viewport-size", "1280x720",
        "--storage-state", ".auth/elevay-tenant.json",
        "--allowed-origins", "http://localhost:3000;http://localhost:*",
        "--output-dir", ".playwright-mcp"
      ],
      "env": {}
    },
    "context7": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@upstash/context7-mcp@latest"],
      "env": {}
    }
  }
}
```

Flags (doc CLI `@playwright/mcp` à jour) :

- `--storage-state .auth/elevay-tenant.json` — **réutilise l'auth-fixture forgée
  en §2**. C'est le pont JWE → MCP : le navigateur MCP démarre authentifié sur le
  tenant `elevay` sans OAuth. (N'a d'effet qu'en profil isolé/au démarrage ;
  régénérer si la session a expiré ~30 min.)
- `--allowed-origins "http://localhost:3000;http://localhost:*"` — borne la QA à
  localhost (app testée = Next sur localhost ; couvre 3000 par défaut et 3100 e2e).
- `--viewport-size "1280x720"` — repro standard ; pour le bug founder demi-écran,
  relancer avec `--viewport-size "760x900"`.
- `--output-dir .playwright-mcp` — screenshots/traces de la QA (gitignore).
- **Headed par défaut** (la QA observe le navigateur). En CI sans display, ajouter
  `--headless`. Ne PAS combiner `--isolated` + agents parallèles.

**Règle un-seul-navigateur (CLAUDE.md hard rule).** Le serveur Playwright MCP
pilote **UN seul navigateur**. Ne JAMAIS lancer d'agent de fond touchant à
Playwright pendant qu'on l'utilise — ça hijacke la session. Les agents de fond
sont réservés au travail non-navigateur. Conséquence config : **une seule instance
MCP**, profil persistant (pas de `--isolated` multi-agent). Garde-fou DB partagée :
ne mettre dans l'allowlist permissions QUE les outils MCP **lecture** (snapshot,
screenshot, navigate, console, network, wait, resize) ; laisser les outils
**mutateurs** (`browser_click`, `browser_type`, `browser_fill_form`,
`browser_evaluate`, `browser_run_code_unsafe`, `browser_press_key`,
`browser_select_option`, `browser_file_upload`) **hors allowlist** → ils
demanderont confirmation avant de pouvoir muter le tenant `elevay`.

Fichier : `orion/.claude/settings.local.json`

```json
{
  "permissions": {
    "allow": [
      "WebSearch",
      "mcp__context7__resolve-library-id",
      "mcp__context7__query-docs",
      "mcp__playwright__browser_navigate",
      "mcp__playwright__browser_navigate_back",
      "mcp__playwright__browser_snapshot",
      "mcp__playwright__browser_take_screenshot",
      "mcp__playwright__browser_console_messages",
      "mcp__playwright__browser_network_requests",
      "mcp__playwright__browser_wait_for",
      "mcp__playwright__browser_resize",
      "Bash(pnpm dev*)", "Bash(pnpm build*)", "Bash(pnpm lint*)",
      "Bash(pnpm test*)", "Bash(pnpm tsc*)", "Bash(pnpm exec *)",
      "Bash(pnpm --filter *)", "Bash(pnpm dlx *)", "Bash(pnpm install*)",
      "Bash(npx playwright *)", "Bash(npx vitest *)", "Bash(npx tsx *)",
      "Bash(pnpm e2e*)", "Bash(pnpm eval:run*)",
      "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)",
      "Bash(git add*)", "Bash(git commit*)", "Bash(git rev-parse*)",
      "Bash(gh pr view*)", "Bash(gh pr checks*)", "Bash(gh pr list*)"
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["playwright", "context7"]
}
```

Rippletide volontairement omis (hook inerte ici : pas de config + pas de jq).
Apollo/Gmail/Calendar/Drive/Vercel sont des connecteurs claude.ai gérés hors
`.mcp.json` — ne pas les redéclarer.

---

## 4. VITEST — `vitest.config.ts` (happy-dom + setup)

**REUSE adapté.** Base = `C:\Users\ombel\leads\app\apps\web\vitest.config.ts:1-51`
(loader `.env.local` qui ne passe que `ANTHROPIC_*`/`OPENAI_*`, alias `@`→`src`,
`testTimeout: 60_000`, coverage v8). **Delta Orion** : `environment: "happy-dom"`
(au lieu de `"node"`) + `setupFiles` (jest-dom + cleanup) pour les tests de
composants React 19, conforme au CLAUDE.md Orion (« Vitest happy-dom + Testing
Library »).

Fichier : `app/apps/web/vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync, existsSync } from "fs";

function loadDotenv(dir: string): Record<string, string> {
  const envPath = path.join(dir, ".env.local");
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, "utf-8");
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export default defineConfig(() => {
  const env = loadDotenv(__dirname);
  return {
    plugins: [react()],
    test: {
      environment: "happy-dom",
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      globals: true,
      testTimeout: 60_000,
      env: Object.fromEntries(
        Object.entries(env).filter(([k]) => k.startsWith("ANTHROPIC_") || k.startsWith("OPENAI_")),
      ),
      coverage: {
        provider: "v8" as const,
        include: ["src/app/api/**/*.ts", "src/lib/**/*.ts", "src/hooks/**/*.ts", "src/components/**/*.tsx"],
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
        reporter: ["text", "text-summary"],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
```

Fichier : `app/apps/web/vitest.setup.ts` (NET-NEW — le setup que `setupFiles`
charge) :

```typescript
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Démonte l'arbre React rendu entre chaque test (happy-dom).
afterEach(() => {
  cleanup();
});
```

DevDeps requis (alignés Elevay) : `happy-dom@^20.10.2`,
`@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`,
`vitest@^4.1.8`.

---

## 5. EVAL / CI

**`eval:run`** (REUSE du contrat de commande Elevay — `pnpm eval:run` dans
`app/apps/web`). À ajouter aux scripts `@orion/web` quand le gate d'éval existe ;
sinon le câbler en no-op explicite pour ne pas casser la CI :

```json
{
  "scripts": {
    "eval:run": "tsx eval/run.ts"
  }
}
```

**Workflow CI** — **REUSE** de `C:\Users\ombel\leads\.github\workflows\ci.yml:1-58`,
filtre changé en **`@orion/web`**. Deux jobs : `tsc + vitest` et `gitleaks`.
pnpm `10.15.1`, Node `22`, `NODE_OPTIONS=--max-old-space-size=6144` (le `tsc` web
OOM sans ça sur le runner). E2E **hors** CI par défaut (la QA hostile Playwright/MCP
est manuelle, un-seul-navigateur, et touche la DB partagée).

Fichier : `orion/.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

jobs:
  typecheck-test:
    name: tsc + vitest
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      # tsc web dépasse le ~2GB par défaut de Node sur le runner (OOM-killed).
      NODE_OPTIONS: --max-old-space-size=6144
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
        with:
          version: 10.15.1
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: app/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - name: Typecheck (web)
        run: pnpm --filter @orion/web tsc
      - name: Unit tests (web)
        run: pnpm --filter @orion/web test

  secret-scan:
    name: gitleaks
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_ENABLE_COMMENTS: "false"
          GITLEAKS_ENABLE_SUMMARY: "true"
```

---

## 6. OÙ ÇA VA — fichiers POSÉS par pack0 (Foundation), racine du repo Orion

Tous les chemins ci-dessous sont **relatifs à la racine du repo Orion** et sont la
responsabilité de **`pack0` (Foundation)**. (Pendant le build dans le worktree
`leads`, ils vivent sous `orion/…` ; au split en repo séparé ils tombent à la
racine.)

| # | Fichier (racine repo Orion) | Type | Source / note |
|---|---|---|---|
| 1 | `app/apps/web/playwright.config.ts` | REUSE | calque `app/apps/web/playwright.config.ts:1-63` (deltas : `pnpm --filter @orion/web dev` + `globalSetup` + `storageState`) |
| 1 | `app/apps/web/package.json` (scripts `e2e`, `e2e:install`, `eval:run`) | REUSE | `app/apps/web/package.json:13-15` ; `name` = `@orion/web` |
| 2 | `app/apps/web/e2e/global-setup.ts` | NET-NEW | forge JWE Auth.js → storageState |
| 2 | `app/apps/web/.auth/elevay-tenant.json` | généré (gitignore) | produit par global-setup au runtime |
| 3 | `.mcp.json` | NET-NEW config | serveurs `playwright` + `context7` |
| 3 | `.claude/settings.local.json` | NET-NEW config | permissions MCP lecture seule + activation |
| 4 | `app/apps/web/vitest.config.ts` | REUSE adapté | `app/apps/web/vitest.config.ts:1-51` (delta : `happy-dom` + `setupFiles`) |
| 4 | `app/apps/web/vitest.setup.ts` | NET-NEW | jest-dom + cleanup happy-dom |
| 5 | `.github/workflows/ci.yml` | REUSE | `.github/workflows/ci.yml:1-58` (filtre → `@orion/web`) |
| 6 | `.gitignore` (entrées `.auth/`, `.playwright-mcp/`, `playwright-report/`, `test-results/`) | NET-NEW | secrets de session + artefacts QA |

Dépendances entre packs : `pack0` pose le harnais ci-dessus ; les packs
parallèles (`pack2…pack6`) n'écrivent leurs tests Vitest QUE contre des modules
produits par `pack0`+`pack1`, et ne `tsc`ent qu'avec ce harnais en place.
```
