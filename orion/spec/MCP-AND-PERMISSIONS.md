# Orion — MCP servers + permissions (réplique de ce repo)

> « context7 + tout ce qu'on utilise ici dans ce repo ». Relevé sur la config RÉELLE de
> `C:/Users/ombel/leads` (`.mcp.json` + `.claude/settings.local.json`) le 2026-06-28.
> **Posé par pack0** à la racine du repo Orion. Deux niveaux : (A) serveurs MCP déclarés au
> repo (`.mcp.json`, stdio) ; (B) connecteurs au niveau compte claude.ai à garder connectés.

## A. `.mcp.json` (racine repo Orion) — serveurs stdio

Ce repo ne déclare que **context7** en `.mcp.json` ; Playwright est utilisé via la session.
Pour Orion on déclare les **deux** explicitement (la QA hostile a besoin de Playwright MCP) :

```json
{
  "mcpServers": {
    "context7": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@upstash/context7-mcp@latest"],
      "env": {}
    },
    "playwright": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@playwright/mcp@latest", "--isolated", "--browser", "chromium"],
      "env": {}
    }
  }
}
```
- Wrapper Windows `cmd /c npx` identique à ce repo (context7).
- `--isolated` (profil jetable) + `--browser chromium` ; ajouter `--headless` en CI. Règle **un seul navigateur à la fois** (CLAUDE.md) — la QA hostile ne lance pas d'agent Playwright en arrière-plan pendant qu'elle pilote.

## B. `.claude/settings.local.json` (racine repo Orion) — permissions + MCP activés

Réplique de l'allowlist de ce repo, **adaptée à Orion** (`@orion/web`, chemins Orion). Évite les
prompts de permission sur les commandes courantes et autorise les MCP lecture.

```json
{
  "permissions": {
    "allow": [
      "WebSearch",
      "Bash(pnpm dev*)", "Bash(pnpm build*)", "Bash(pnpm lint*)", "Bash(pnpm test*)",
      "Bash(pnpm tsc*)", "Bash(pnpm run *)", "Bash(pnpm -C *)", "Bash(pnpm --filter *)",
      "Bash(pnpm exec *)", "Bash(pnpm dlx *)", "Bash(pnpm install*)",
      "Bash(pnpm db:push*)", "Bash(pnpm db:migrate:apply*)", "Bash(pnpm db:studio*)",
      "Bash(pnpm db:generate*)", "Bash(pnpm e2e*)", "Bash(pnpm eval:run*)",
      "Bash(npx tsc *)", "Bash(npx vitest *)", "Bash(npx playwright *)", "Bash(npx drizzle-kit *)", "Bash(npx tsx *)",
      "Bash(git add*)", "Bash(git commit*)", "Bash(git fetch*)", "Bash(git checkout*)",
      "Bash(git rev-parse*)", "Bash(git worktree*)", "Bash(git status*)", "Bash(git log*)",
      "Bash(git diff*)", "Bash(git show*)", "Bash(git branch*)", "Bash(git ls-files*)",
      "Bash(gh pr view*)", "Bash(gh pr diff*)", "Bash(gh pr list*)", "Bash(gh pr checks*)",
      "Bash(gh repo view*)", "Bash(gh api repos/*/contents/*)",
      "Bash(vercel env pull *)", "Bash(vercel env ls*)",
      "Bash(ls*)", "Bash(cat*)", "Bash(grep *)", "Bash(rg *)", "Bash(head *)", "Bash(tail *)",
      "Bash(find *)", "Bash(wc -l*)", "Bash(echo *)", "Bash(mkdir *)", "Bash(chmod +x *)",
      "PowerShell(Get-Content *)", "PowerShell(Get-ChildItem *)", "PowerShell(Test-Path *)",
      "PowerShell(Select-String *)", "PowerShell(Measure-Object *)", "PowerShell(Get-Item *)",
      "mcp__context7__resolve-library-id", "mcp__context7__query-docs",
      "mcp__playwright__browser_navigate", "mcp__playwright__browser_snapshot",
      "mcp__playwright__browser_take_screenshot", "mcp__playwright__browser_console_messages",
      "mcp__playwright__browser_network_requests", "mcp__playwright__browser_navigate_back",
      "mcp__playwright__browser_wait_for", "mcp__playwright__browser_resize",
      "mcp__rippletide__recall", "mcp__rippletide__get_context", "mcp__rippletide__list_entities"
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["context7", "playwright"]
}
```
- Mutateurs Playwright (click/type/fill) **hors allowlist** → confirmation requise (garde-fou DB partagée + un-seul-navigateur).
- `rippletide` = MCP mémoire utilisé ici (note mémoire : peut être inerte sans config/jq — gardé pour parité).

## C. Connecteurs claude.ai / compte (PAS dans le repo) — à garder connectés pour Orion

Ces serveurs sont fournis par le compte claude.ai (pas un `.mcp.json` repo) ; une session Orion
doit les avoir connectés selon le besoin :

| Connecteur | Outils | Usage Orion |
|---|---|---|
| **Apollo.io** | `mcp__claude_ai_Apollo_io__*` (search/enrich/people-match/job-postings) | enrichissement firmo/contacts + job-postings (entrée Tier 0/1) |
| **datagouv** (data.gouv.fr) | `mcp__datagouv__*` (search_datasets/query_resource_data) | **signaux souverains FR** : BODACC, recherche-entreprises (le edge FR, hero démo) |
| **Vercel** | `mcp__plugin_vercel_vercel__*` (deploy/logs/runtime-errors) | déploiement preview/prod + logs |
| Gmail / Google Calendar / Drive / Composio | `mcp__claude_ai_*` | optionnels (non requis pour le slice signal→brief→outbound) |

## Où ça va (pack0)
| Fichier | Chemin Orion | REUSE / NET-NEW |
|---|---|---|
| `.mcp.json` | racine repo Orion | NET-NEW (réplique de `leads/.mcp.json` + ajout playwright) |
| `.claude/settings.local.json` | racine repo Orion | NET-NEW (réplique de `leads/.claude/settings.local.json:1`, adaptée @orion/web) |

Le reste de la config tooling (playwright.config.ts, global-setup auth-fixture, vitest, CI) est dans `CONFIG-TOOLING.md` — même lot pack0.
