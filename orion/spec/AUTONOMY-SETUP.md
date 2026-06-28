# Orion — AUTONOMY-SETUP.md

> Ce qu'il manque pour qu'une session Claude Code exécute un pack Orion **en
> autonomie dès le prompt**, et le scaffolding concret à poser. Ancré sur la config
> RÉELLE d'Elevay (`C:/Users/ombel/leads/.claude/…`, `_harness/…`) relevée le
> 2026-06-28, et sur la doc Claude Code (permission-modes, hooks, memory).
>
> **Ne re-dit pas** ce qui est déjà spécifié ailleurs dans `spec/` :
> - env (`DATABASE_URL`, `DATABASE_URL_OWNER`, `AUTH_SECRET`, flags) → `00-PREREQUISITES.md` §1.
> - `.mcp.json`, `settings.local.json` (allowlist MCP), auth-fixture Playwright JWE,
>   `vitest.config.ts`, `ci.yml`, `.gitignore` (`.auth/`, `.playwright-mcp/`) →
>   `CONFIG-TOOLING.md` + `MCP-AND-PERMISSIONS.md` (lot **pack0**).
>
> Ici on traite **uniquement** les trous d'autonomie restants : chargement
> CLAUDE.md, politique de permissions **committée**, hooks (secret-scan +
> self-correction), refs `_harness`/`_reports`/mémoire mortes, agents/commands,
> `gh auth`. Tout le reste renvoie aux deux docs ci-dessus.

---

## 0. Le constat — pourquoi, en l'état, une session N'EST PAS autonome

Quatre causes la bloquent **dès le premier prompt**, indépendamment de la qualité du code :

1. **Le CLAUDE.md d'Orion n'est pas à la racine du repo.** Il vit sous
   `orion/spec/CLAUDE.md`. Claude Code n'auto-charge QUE `./CLAUDE.md`,
   `./.claude/CLAUDE.md` (racine du repo ouvert) et `~/.claude/CLAUDE.md`. Une
   session ouverte à la racine du repo Orion **ne le lit jamais** → aucune des hard
   rules, aucune table de commandes, aucune directive « ne demande pas la
   permission » n'est en contexte. La session part aveugle.

2. **Aucune politique de permissions COMMITTÉE.** Le seul fichier de permissions
   prévu est `.claude/settings.local.json` — or il est (a) **gitignoré et
   per-machine** : il ne voyage pas avec le repo, donc sur un clone neuf / une autre
   machine l'allowlist est **vide** → chaque `pnpm`, `git`, `tsc` déclenche un prompt
   de permission ; (b) **sans `deny`, sans `hooks`, sans `defaultMode`**. Et le mode
   par défaut de Claude Code est `"default"` (vérifié : `~/.claude/settings.json:57`
   = `"defaultMode": "default"`) → tout ce qui n'est pas explicitement dans
   l'allowlist **s'arrête et demande**. Sans `settings.json` committé, l'autonomie
   dépend d'un fichier que personne d'autre n'a.

3. **Le hook secret-scan n'est pas réellement câblé — et n'existe pas côté Orion.**
   Fait vérifié : chez Elevay le fichier `.claude/hooks/secret-scan.sh` existe, mais
   **aucun `settings.json` ne l'enregistre** (pas de `settings.json` projet ; le
   `~/.claude/settings.json` user n'a pas de bloc `"hooks"`). Un fichier de hook
   **non enregistré ne s'exécute pas**. Côté Orion il n'y a ni le fichier ni
   l'enregistrement. Conséquence : `CLAUDE.md` (Orion) **promet** un garde-fou
   secret-scan qui, tel quel, n'existe pas → un `git commit` peut faire entrer un
   secret dans l'historique d'un repo qui sera public.

4. **Le CLAUDE.md d'Orion référence des fichiers qui n'existent pas.** Il pointe
   vers `_harness/CHARTER.md`, `_harness/escalation.md` (les off-ramps de la règle
   « ne demande pas la permission »), `_harness/milestones.json`, `progress.txt`,
   `_reports/spending.md`, `harness-health.md`, et le système de mémoire
   `.claude/.../memory/MEMORY.md`. **Aucun n'existe côté Orion.** Une session qui
   suit le CLAUDE.md à la lettre — « escalade dans escalation.md après 5 échecs »,
   « vérifie le budget avant toute dépense », « rappelle la mémoire avant de
   décider » — frappe des `read` qui échouent et n'a ni gate de checkpoint, ni
   budget, ni recovery au crash, ni apprentissage cross-session.

Tant que ces quatre points ne sont pas réglés, « autonomie dès le prompt » est
faux : la session soit s'arrête sur un prompt de permission, soit travaille sans
ses règles, soit casse sur une ref morte, soit commit un secret.

---

## 1. TABLEAU EXHAUSTIF DES TROUS

État : **MANQUANT** = rien posé · **PARTIEL** = drafté mais insuffisant/non committé · **OK** = couvert ailleurs.

| Élément | Rôle pour l'autonomie | État | Source Elevay à copier (chemin) | Fix |
|---|---|---|---|---|
| **CLAUDE.md à la racine du repo** | Auto-chargé chaque session ; porte hard rules + table commandes + « ne demande pas » | **MANQUANT** (vit sous `orion/spec/CLAUDE.md`) | `C:/Users/ombel/leads/CLAUDE.md` (modèle de structure) | Déplacer/copier `orion/spec/CLAUDE.md` → **racine repo Orion** `CLAUDE.md` (ou `.claude/CLAUDE.md`). <200 lignes (il fait ~82, OK). |
| **`.claude/settings.json` COMMITTÉ** (allow/deny + mode) | Politique de permission **partagée** → zéro prompt sur les commandes pré-approuvées, sur **toute** machine/clone | **MANQUANT** (seul `settings.local.json` gitignoré existe) | Elevay n'en a pas non plus (anti-pattern à corriger) ; allowlist source = `.claude/settings.local.json` | Créer `orion/.claude/settings.json` committé (bloc §2.1). `settings.local.json` reste pour le per-machine. |
| **`defaultMode`** | `default`=prompt sur non-allowlisté ; `acceptEdits`=édits auto ; `auto`=classifier server-side (zéro prompt) | **MANQUANT** (hérite `default`) | `~/.claude/settings.json:57` = `"default"` | Mettre `"defaultMode": "acceptEdits"` (édits/lectures auto, allowlist couvre Bash) ; `"auto"` si Opus/Sonnet 4.6+ & CC ≥ 2.1.83 (sinon ignoré). Voir §2.1. |
| **`deny` rules** | Bloque le destructeur même si allow large (deny outrank allow) | **MANQUANT** | — | Ajouter `deny` (rm -rf /, `Read(.env*)`, `DATABASE_URL_OWNER` au runtime, force-push). Bloc §2.1. |
| **Hook PreToolUse secret-scan (FICHIER)** | Bloque un commit/push portant un secret (repo Orion sera public) | **MANQUANT** | `C:/Users/ombel/leads/.claude/hooks/secret-scan.sh` | Copier tel quel → `orion/.claude/hooks/secret-scan.sh` (+ `chmod +x`). jq-optionnel déjà géré. |
| **Hook secret-scan ENREGISTRÉ** | Le fichier seul ne s'exécute pas ; il faut le bloc `"hooks"` dans settings | **MANQUANT (même chez Elevay)** | Aucune (à créer ; Elevay ne l'enregistre nulle part de visible) | Enregistrer PreToolUse `Bash` dans `settings.json` committé. Bloc §2.1. |
| **Hook PostToolUse tsc/lint (self-correction)** | Re-type-check après chaque Edit → Claude voit l'erreur et corrige sans humain | **MANQUANT** (Elevay n'en a pas) | — (net-new) | Ajouter PostToolUse `Edit\|Write` → `pnpm --filter @orion/web tsc`. Bloc §2.2 (+ note coût). |
| **`.mcp.json` (context7 + playwright)** | Docs libs + QA hostile navigateur | **OK** | `C:/Users/ombel/leads/.mcp.json` | Déjà spécifié `CONFIG-TOOLING.md §3` / `MCP-AND-PERMISSIONS.md §A`. |
| **`.claude/settings.local.json` (allowlist MCP+Bash)** | Réduit les prompts per-machine | **PARTIEL** (gitignoré, pas de deny/hooks) | `C:/Users/ombel/leads/.claude/settings.local.json` | Garder pour le per-machine ; le **baseline partagé** passe en `settings.json` (§2.1). Specifié `CONFIG-TOOLING.md §3`. |
| **Sub-agents (`.claude/agents/`)** | `code-reviewer`, `spec-kiro` délèguent review/spec en autonomie | **MANQUANT** | `C:/Users/ombel/leads/.claude/agents/{code-reviewer,spec-kiro}.md` | Copier les 2 ; adapter hard rules (`@orion/web`, tenant `elevay`, chemins `src/`). |
| **Commands (`.claude/commands/`)** | `/next` (cycle complet), `/code-review`, `/investigate`, `/status`, `/plan` | **MANQUANT** | `C:/Users/ombel/leads/.claude/commands/*.md` (+ `*.sh`) | Copier ; adapter chemins. `/next` est le moteur d'autonomie bout-en-bout. |
| **Output-style (`detail-over-vision`)** | Discipline de sortie (file:line, no-emoji, no-hype, memory hygiene) | **MANQUANT** côté repo (actif en user global) | `C:/Users/ombel/leads/.claude/output-styles/detail-over-vision.md` | Déjà actif via `~/.claude/settings.json:74` ; copier dans le repo pour que ça voyage. |
| **`_harness/CHARTER.md`** | Référencé par CLAUDE.md (méthodo phases) | **MANQUANT (ref morte)** | `C:/Users/ombel/leads/_harness/CHARTER.md` | Soit créer un CHARTER Orion minimal (§4), soit retirer la ref du CLAUDE.md. **Reco : créer.** |
| **`_harness/escalation.md`** | Off-ramp de « ne demande pas » (où écrire après 5 échecs) | **MANQUANT (ref morte)** | `C:/Users/ombel/leads/_harness/escalation.md` | Créer le template (§4). Sans lui, la règle d'arrêt n'a pas de cible. |
| **`_harness/milestones.json`** | Gate de checkpoint (= STOP pour le founder) | **MANQUANT (ref morte)** | `C:/Users/ombel/leads/_harness/milestones.json` | Créer depuis les 8 packs (`00-EXECUTION-GUIDE.md §1`). Template §4. |
| **`progress.txt`** | Crash-recovery (« sur restart, lis progress.txt ») | **MANQUANT (ref morte)** | `C:/Users/ombel/leads/_harness/progress.txt` | Créer (vide/seed). Template §4. |
| **`_reports/spending.md`** | Budget gate (« vérifie le total vs cap avant toute charge ») | **MANQUANT (ref morte)** | `C:/Users/ombel/leads/_reports/spending.md` | Créer avec cap + ligne 0. Template §4. |
| **`_reports/harness-health.md`** | Santé du run (pass-rate ; observabilité) | **MANQUANT (ref morte)** | `C:/Users/ombel/leads/_reports/harness-health.md` | Créer (en-tête + table vide). Template §4. |
| **Mémoire cross-session** | `MEMORY.md` index + one-fact files ; rappel avant décision, écriture immédiate | **MANQUANT** | `C:/Users/ombel/.claude/projects/C--Users-ombel-leads/memory/MEMORY.md` (+ 67 fichiers) | Créer le dossier mémoire du projet Orion + `MEMORY.md` seed (§4). Per-machine, **gitignoré** côté repo. |
| **`gh auth` (push/PR autonome)** | `git push`, `gh pr create` sans 403 | **MANQUANT/à vérifier** | mémoire `ombel-machine-push-via-gh` | `gh auth setup-git` (gh.exe dans Program Files) pour pusher comme MartinPaviot ; GCM `ombelinecarcel-tech` = 403. §5 checklist. |
| **env `.env.local` (DB/auth/AI)** | Migrations + tests + boot autonomes | **OK (spécifié)** | — | `00-PREREQUISITES.md §1` ; doit **exister sur la machine** (pas dans le repo). |
| **`DATABASE_URL_OWNER` (migrations)** | Appliquer migrations additives sans humain | **OK (spécifié)** | — | `00-PREREQUISITES.md §1` ; opérateur-only, 0 hit dans `src`. |
| **Dev server + ports + auth-fixture Playwright** | QA hostile authentifiée sans OAuth humain | **OK (spécifié)** | `app/apps/web/playwright.config.ts` + `e2e/global-setup.ts` | `CONFIG-TOOLING.md §1-2`. |
| **`eval:run`** | Gate d'éval (cycle EVALUATE) | **OK (spécifié)** | — | `CONFIG-TOOLING.md §5` (no-op explicite tant que le gate n'existe pas). |
| **jq-optionalité des hooks** | jq absent du PATH (Git Bash) → un hook jq-only no-op | **OK** (le secret-scan a déjà python/node/sed fallback) | `secret-scan.sh:18-33` | Garder le fallback ; tout nouveau hook = jq-optionnel. mémoire `jq-missing-in-git-bash`. |
| **`.gitignore` (secrets/artefacts)** | `.env.local`, `.auth/`, mémoire ne doivent jamais être committés | **PARTIEL** | `CONFIG-TOOLING.md §6` (a `.auth/`, `.playwright-mcp/`) | Compléter avec `.env*`, `settings.local.json`, `.claude/**/memory/`. Bloc §2.4. |
| **secret-scan côté CI** | Filet réseau au cas où le hook local saute | **OK (spécifié)** | `.github/workflows/ci.yml` job `gitleaks` | `CONFIG-TOOLING.md §5`. Double garde : hook local + gitleaks CI. |

---

## 2. LES BLOCS DE CONFIG PRÊTS — copier tel quel

### 2.1 `orion/.claude/settings.json` (COMMITTÉ) — permissions + mode + hooks

C'est **le** fichier manquant qui fait l'autonomie : politique partagée (voyage avec
le repo), `deny` de sécurité, et **enregistrement des hooks**. À committer (≠
`settings.local.json` qui reste per-machine et gitignoré).

```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(pnpm dev*)", "Bash(pnpm build*)", "Bash(pnpm lint*)", "Bash(pnpm test*)",
      "Bash(pnpm tsc*)", "Bash(pnpm run *)", "Bash(pnpm -C *)", "Bash(pnpm --filter *)",
      "Bash(pnpm exec *)", "Bash(pnpm dlx *)", "Bash(pnpm install*)",
      "Bash(pnpm db:push*)", "Bash(pnpm db:migrate:apply*)", "Bash(pnpm db:studio*)",
      "Bash(pnpm db:generate*)", "Bash(pnpm e2e*)", "Bash(pnpm eval:run*)",
      "Bash(npx tsc *)", "Bash(npx vitest *)", "Bash(npx playwright *)",
      "Bash(npx drizzle-kit *)", "Bash(npx tsx *)",
      "Bash(git add*)", "Bash(git commit*)", "Bash(git fetch*)", "Bash(git checkout*)",
      "Bash(git rev-parse*)", "Bash(git worktree*)", "Bash(git status*)", "Bash(git log*)",
      "Bash(git diff*)", "Bash(git show*)", "Bash(git branch*)", "Bash(git ls-files*)",
      "Bash(git push*)",
      "Bash(gh pr view*)", "Bash(gh pr diff*)", "Bash(gh pr list*)", "Bash(gh pr checks*)",
      "Bash(gh pr create*)", "Bash(gh repo view*)", "Bash(gh api repos/*/contents/*)",
      "Bash(ls*)", "Bash(grep *)", "Bash(rg *)", "Bash(head *)", "Bash(tail *)",
      "Bash(find *)", "Bash(wc -l*)", "Bash(echo *)", "Bash(mkdir *)", "Bash(chmod +x *)",
      "Bash(vercel env pull *)", "Bash(vercel env ls*)",
      "PowerShell(Get-Content *)", "PowerShell(Get-ChildItem *)", "PowerShell(Test-Path *)",
      "PowerShell(Select-String *)", "PowerShell(Measure-Object *)", "PowerShell(Get-Item *)",
      "WebSearch",
      "mcp__context7__resolve-library-id", "mcp__context7__query-docs",
      "mcp__playwright__browser_navigate", "mcp__playwright__browser_navigate_back",
      "mcp__playwright__browser_snapshot", "mcp__playwright__browser_take_screenshot",
      "mcp__playwright__browser_console_messages", "mcp__playwright__browser_network_requests",
      "mcp__playwright__browser_wait_for", "mcp__playwright__browser_resize"
    ],
    "deny": [
      "Bash(rm -rf /)", "Bash(rm -rf ~)", "Bash(rm -rf /*)",
      "Bash(git push --force*)", "Bash(git push -f*)",
      "Bash(git reset --hard*)",
      "Bash(*--no-verify*)", "Bash(*--no-gpg-sign*)",
      "Read(.env)", "Read(.env.*)", "Read(./.env*)",
      "Read(**/.env)", "Read(**/.env.*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/secret-scan.sh\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/typecheck.sh\""
          }
        ]
      }
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["context7", "playwright"]
}
```

Notes honnêtes :
- **`acceptEdits`** (et non `auto`) est le choix sûr ici : édits/lectures fichiers
  passent sans prompt, le Bash est couvert par l'allowlist, et ça marche sur
  **tout** modèle/version. `"auto"` (classifier server-side, zéro prompt même
  hors-allowlist) n'est actif **que** sur Opus/Sonnet **4.6+** via l'API Anthropic
  et Claude Code **≥ 2.1.83** — sinon la clé est ignorée silencieusement. Si la
  session tourne sur Opus 4.8 (le cas ici) et CC à jour, passer à `"auto"` est un
  gain net ; le laisser à `acceptEdits` ne casse rien.
- **`deny` outrank `allow`** : `git push --force`, `--no-verify`, lecture `.env*`
  sont bloqués même si une allow large matche.
- **`git push*`** est en allow — combiné au `deny --force`, la session peut pousser
  des fast-forward mais pas réécrire l'historique.
- `$CLAUDE_PROJECT_DIR` est injecté par Claude Code = racine du repo ouvert.

### 2.2 `orion/.claude/hooks/typecheck.sh` (PostToolUse — self-correction)

Re-type-check après chaque édition et **renvoie l'erreur à Claude** (exit 2 =
stderr réinjecté dans le contexte → il corrige sans humain). jq-optionnel.

```bash
#!/bin/bash
# PostToolUse (matcher: Edit|Write|MultiEdit) — self-correction TypeScript.
# Lance le tsc du package @orion/web et, si ça casse, renvoie la sortie à Claude
# (exit 2) pour qu'il corrige immédiatement, sans intervention humaine.
#
# Coût : un tsc projet est lourd à CHAQUE édition. Deux garde-fous :
#  (1) on ne déclenche que pour des fichiers .ts/.tsx (sinon exit 0) ;
#  (2) timeout dur pour ne pas bloquer la session.
# Si le coût devient gênant : passer ce hook sur le hook Stop (un seul tsc en fin
# de tour) plutôt que PostToolUse, ou restreindre via une compile incrémentale.

RAW=$(cat)
REPO="${CLAUDE_PROJECT_DIR:-$PWD}"

# Extrait le chemin du fichier édité (jq -> python -> node -> sed), pour ne lancer
# tsc QUE sur une édition TypeScript.
get_path() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$RAW" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null && return
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s' "$RAW" | python -c 'import sys,json;d=json.load(sys.stdin).get("tool_input",{});print(d.get("file_path") or d.get("path") or "")' 2>/dev/null && return
  fi
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$RAW" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s).tool_input||{};process.stdout.write(t.file_path||t.path||"")}catch(e){}})' 2>/dev/null && return
  fi
  printf '%s' "$RAW" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

FILE=$(get_path)
case "$FILE" in
  *.ts|*.tsx) ;;            # on continue
  *) exit 0 ;;              # pas du TS -> rien à faire
esac

# tsc du package (timeout 120s). NODE_OPTIONS pour éviter l'OOM du tsc web.
OUT=$(cd "$REPO" && NODE_OPTIONS=--max-old-space-size=6144 \
  timeout 120 pnpm --filter @orion/web tsc 2>&1)
STATUS=$?

[[ $STATUS -eq 0 ]] && exit 0
# 124 = timeout : on n'échoue pas la session là-dessus, on prévient seulement.
if [[ $STATUS -eq 124 ]]; then
  echo "[typecheck] tsc timeout (>120s) — non bloquant, relance manuelle: pnpm --filter @orion/web tsc" >&2
  exit 0
fi

{
  echo "[typecheck] tsc @orion/web a échoué après ton édition de $FILE :"
  echo ""
  echo "$OUT" | tail -40
  echo ""
  echo "Corrige ces erreurs de type avant de continuer."
} >&2
exit 2
```

`chmod +x orion/.claude/hooks/typecheck.sh`. Honnête : ce hook est un **enabler
optionnel** (Elevay n'en a pas). Le coût d'un tsc par édition est réel ; si gênant,
le déplacer sur le hook **Stop** (un seul tsc en fin de tour). Le secret-scan, lui,
est **non négociable** (repo public).

### 2.3 `orion/.claude/hooks/secret-scan.sh` (PreToolUse — non négociable)

**Copie octet pour octet** de `C:/Users/ombel/leads/.claude/hooks/secret-scan.sh`
(99 lignes, jq→python→node→sed, scanne les lignes `+` du diff cached + le message
`-m`, exit 2 + explication si match). Aucune adaptation. Puis `chmod +x`. Son
enregistrement est dans le bloc `hooks.PreToolUse` de §2.1 — **le fichier seul ne
suffit pas**.

### 2.4 `.gitignore` (compléments autonomie) — à ajouter aux entrées de `CONFIG-TOOLING.md §6`

```gitignore
# --- secrets / per-machine (jamais committer) ---
.env
.env.*
!.env.example
.claude/settings.local.json

# --- artefacts QA / session (déjà partiellement dans CONFIG-TOOLING §6) ---
.auth/
.playwright-mcp/
playwright-report/
test-results/

# La mémoire cross-session vit hors repo (~/.claude/projects/.../memory) ; si
# jamais on en pose une copie in-repo, l'ignorer :
.claude/**/memory/
```

`settings.json` (lui) **est committé** ; seul `settings.local.json` est ignoré.

---

## 3. CE QU'IL FAUT CRÉER vs COPIER d'Elevay

Chemins source = Elevay réel (`C:/Users/ombel/leads/…`) ; cible = racine du repo Orion.

### 3.1 COPIER (quasi à l'identique — adapter chemins `src/`, `@orion/web`, tenant `elevay`)

| Source Elevay | Cible Orion | Adaptation |
|---|---|---|
| `.claude/hooks/secret-scan.sh` | `.claude/hooks/secret-scan.sh` | aucune (+ `chmod +x`) |
| `.claude/agents/code-reviewer.md` | `.claude/agents/code-reviewer.md` | hard rules → `@orion/web`, tenant `elevay`, chemins `src/`, **directives Orion** (cold sends Elevay-owned, jamais Instantly ; `tenantId` du Bearer ; FullEnrich banni) |
| `.claude/agents/spec-kiro.md` | `.claude/agents/spec-kiro.md` | chemins `_specs/`, `src/` |
| `.claude/commands/{next,code-review,investigate,status,plan}.md` | idem | commandes `pnpm --filter @orion/web …` |
| `.claude/commands/{plan-command,review-plan-command}.sh` | idem | aucune (Rippletide optionnel, peut no-op sans jq) |
| `.claude/output-styles/detail-over-vision.md` | `.claude/output-styles/detail-over-vision.md` | aucune |

### 3.2 CRÉER (net-new Orion)

| Fichier | Pourquoi |
|---|---|
| `CLAUDE.md` **à la racine** | déplacer depuis `orion/spec/CLAUDE.md` (cause #1 du §0) |
| `.claude/settings.json` | politique committée + hooks (§2.1) — n'existe pas chez Elevay |
| `.claude/hooks/typecheck.sh` | self-correction (§2.2) — enabler optionnel |
| `_harness/CHARTER.md`, `escalation.md`, `milestones.json`, `progress.txt` | refs mortes du CLAUDE.md (§4) |
| `_reports/spending.md`, `harness-health.md` | refs mortes du CLAUDE.md (§4) |
| `~/.claude/projects/<repo-Orion>/memory/MEMORY.md` | mémoire cross-session (§4) |

Déjà couverts ailleurs (ne pas refaire) : `.mcp.json`, `settings.local.json`,
`playwright.config.ts`, `e2e/global-setup.ts`, `vitest.config.ts`, `ci.yml`,
`.gitignore` de base → `CONFIG-TOOLING.md` / `MCP-AND-PERMISSIONS.md`.

---

## 4. DÉCISION sur les refs `_harness` du CLAUDE.md

**Décision : GARDER les refs et fournir des `_harness`/`_reports` minimaux.** Les
retirer du CLAUDE.md ferait sauter, avec elles, les mécanismes mêmes de l'autonomie
sûre : l'off-ramp d'escalade (cible de la règle « ne demande pas, sauf 5 échecs »),
le gate de checkpoint (= le seul STOP légitime), le budget gate, le crash-recovery.
Le coût de création est de quelques fichiers courts ; le bénéfice est la boucle de
contrôle complète. On crée donc des **templates minimaux** (pas les 60+ rapports
d'Elevay — juste les fichiers que le CLAUDE.md nomme).

### `_harness/CHARTER.md` (minimal)

```markdown
# Orion — CHARTER

## Mission
Slice démontrable signal → brief → outbound pour le tenant `elevay`, repo SÉPARÉ
`@orion/web`, DB partagée `leads` (RLS tenant `elevay`). Voir `spec/00-ARCHITECTURE.md`.

## Méthodo (par feature)
OFFICE HOURS → SPEC → BUILD → EVALUATE → DOC UPDATE (détaillé dans CLAUDE.md).
Phases amont (Calibrate / Research / Plan) : la recherche produit est figée dans
`spec/` (requirements/design/tasks). Ne pas re-spécifier ; exécuter les packs.

## Packs & parallélisation
8 lots `pack0…pack7` — voir `spec/00-EXECUTION-GUIDE.md`. pack0 (Foundation) +
pack1 (Schema) avant tout pack parallèle.

## Règles d'arrêt
STOP seulement pour : checkpoint milestone (tous features verts), cap budget,
feature échouée 5× (→ `_harness/escalation.md`), crash irrécupérable.
```

### `_harness/escalation.md` (minimal — la cible de l'off-ramp)

```markdown
# Escalation log

> Écrire ici tout blocage qui sort de l'autonomie : feature échouée 5×, décision
> qui nécessite le founder (OAuth réel, action physique, arbitrage produit), océan
> (réécriture archi). Format : date · pack/feature · symptôme · ce qui a été tenté
> · ce qu'il faut du founder.

(aucune escalade ouverte)
```

### `_harness/milestones.json` (depuis les 8 packs)

```json
{
  "milestones": [
    { "id": "pack0", "name": "Foundation",            "checkpoint": false, "status": "pending" },
    { "id": "pack1", "name": "Schema & contrats",     "checkpoint": false, "status": "pending" },
    { "id": "pack2", "name": "Ingestion",             "checkpoint": false, "status": "pending" },
    { "id": "pack3", "name": "Brief + MCP",           "checkpoint": false, "status": "pending" },
    { "id": "pack4", "name": "Output + Gates",        "checkpoint": true,  "status": "pending" },
    { "id": "pack5", "name": "Tier2 signals (EDGE)",  "checkpoint": false, "status": "pending" },
    { "id": "pack6", "name": "UI",                    "checkpoint": false, "status": "pending" },
    { "id": "pack7", "name": "Demo + Integration",    "checkpoint": true,  "status": "pending" }
  ]
}
```

### `_harness/progress.txt` (seed crash-recovery)

```text
# Orion — progress (append-only ; lire au restart : git log + branches + ceci)
T0  scaffolding harness posé (CLAUDE.md racine, settings.json, hooks, _harness, _reports)
```

### `_reports/spending.md` (budget gate)

```markdown
# Spending — Orion

Cap : <À DÉFINIR PAR LE FOUNDER> USD. Vérifier le total vs cap AVANT toute charge ;
logger chaque charge. À cap → STOP.

| Date | Poste | Montant | Total cumulé |
|------|-------|---------|--------------|
| —    | (init)| 0       | 0            |
```

### `_reports/harness-health.md` (observabilité)

```markdown
# Harness health — Orion

Sain = 60–80 % de pass au 1er essai. Append une ligne par sprint.

| Sprint | Features tentées | PASS 1er essai | Taux | Notes |
|--------|------------------|----------------|------|-------|
| —      | 0                | 0              | —    | init  |
```

### Mémoire cross-session (per-machine, gitignorée)

Créer `~/.claude/projects/<id-repo-Orion>/memory/MEMORY.md` (l'`<id>` est dérivé du
chemin du repo par Claude Code, ex. `C--Users-ombel-orion`). Seed :

```markdown
# Memory index — Orion

(rien encore ; écrire un one-fact file `project_*.md` / `feedback_*.md` /
`reference_*.md` dès qu'un fait non-trivial est appris, puis l'indexer ici)
```

---

## 5. CHECKLIST autonomie — vrai = un prompt tourne seul de bout en bout

Permissions & mode
- [ ] `CLAUDE.md` est **à la racine** du repo Orion (pas sous `orion/spec/`) et fait <200 lignes.
- [ ] `.claude/settings.json` **committé** existe (allow + deny + `defaultMode`) — bloc §2.1.
- [ ] `defaultMode` = `acceptEdits` (ou `auto` si Opus/Sonnet 4.6+ & CC ≥ 2.1.83).
- [ ] L'allowlist couvre tout le Bash du cycle : `pnpm tsc/test/build/dev/e2e/eval:run/db:*`, `git *`, `gh pr *`, `npx *`.
- [ ] `deny` bloque `rm -rf /`, `git push --force`, `--no-verify`, `Read(.env*)`.
- [ ] `settings.local.json` (per-machine) présent pour les overrides locaux — `CONFIG-TOOLING.md §3`.

Hooks
- [ ] `.claude/hooks/secret-scan.sh` copié + `chmod +x` (repo Orion sera public).
- [ ] Le secret-scan est **enregistré** dans `settings.json` (`hooks.PreToolUse`, matcher `Bash`) — fichier seul = inerte.
- [ ] (optionnel) `.claude/hooks/typecheck.sh` posé + enregistré (`hooks.PostToolUse`).
- [ ] Tous les hooks sont **jq-optionnels** (fallback python/node/sed) — jq absent du PATH.

Refs du CLAUDE.md (plus de ref morte)
- [ ] `_harness/CHARTER.md`, `escalation.md`, `milestones.json`, `progress.txt` existent (§4).
- [ ] `_reports/spending.md` (avec cap) + `harness-health.md` existent (§4).
- [ ] Dossier mémoire `~/.claude/projects/<repo>/memory/MEMORY.md` créé (§4).

Agents / commands / style
- [ ] `.claude/agents/{code-reviewer,spec-kiro}.md` copiés + adaptés (`@orion/web`, tenant `elevay`, directives Orion).
- [ ] `.claude/commands/{next,code-review,investigate,status,plan}.md` (+ `.sh`) copiés.
- [ ] `.claude/output-styles/detail-over-vision.md` présent dans le repo.

MCP
- [ ] `.mcp.json` (context7 + playwright) posé — `CONFIG-TOOLING.md §3`.
- [ ] `enabledMcpjsonServers` + `enableAllProjectMcpServers: true` dans `settings.json`.

Git / push
- [ ] `gh auth setup-git` exécuté (push comme MartinPaviot ; GCM `ombelinecarcel-tech` = 403).
- [ ] `gh auth status` OK ; `gh pr create` autorisé par l'allowlist.

Env / DB / tenant
- [ ] `.env.local` présent sur la machine : `DATABASE_URL`, `AUTH_SECRET`, (`DATABASE_URL_OWNER` pour migrations) — `00-PREREQUISITES.md §1`.
- [ ] Tenant `elevay` existe + rôle restreint `elevay_app` (RLS) — `00-PREREQUISITES.md §1.2/1.3`.
- [ ] `grep DATABASE_URL_OWNER src` = 0 (owner jamais au runtime).

QA / eval
- [ ] `playwright.config.ts` + `e2e/global-setup.ts` (auth-fixture JWE) posés — `CONFIG-TOOLING.md §1-2`.
- [ ] `vitest.config.ts` + `vitest.setup.ts` posés — `CONFIG-TOOLING.md §4`.
- [ ] `eval:run` câblé (réel ou no-op) — `CONFIG-TOOLING.md §5`.
- [ ] `.github/workflows/ci.yml` (tsc+vitest + gitleaks, filtre `@orion/web`) — `CONFIG-TOOLING.md §5`.

`.gitignore`
- [ ] `.env*`, `settings.local.json`, `.auth/`, `.playwright-mcp/`, `playwright-report/`, `test-results/`, `.claude/**/memory/` ignorés (§2.4).

Quand **toutes** les cases sont vraies, une session ouverte à la racine du repo
Orion auto-charge ses règles, ne s'arrête sur aucun prompt de permission pour le
cycle code→test→tsc→commit→push, se corrige seule sur erreur de type, ne peut pas
committer un secret, a ses off-ramps/budget/mémoire, et pousse + ouvre des PR sans
intervention humaine.
```
