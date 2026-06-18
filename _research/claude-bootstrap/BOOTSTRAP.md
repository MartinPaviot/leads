# Claude Code — bootstrap sur une machine neuve (Rippletide retiré, skipDangerous gardé)

Deux décisions câblées ici :
- **Rippletide : retiré** (hooks d'egress + MCP mémoire + section Hook-First de CLAUDE.md).
- **`skipDangerousModePermissionPrompt: true` : conservé** (déjà dans `user-settings.json`).

Rappel : ~70 % de la config voyage avec `git clone` (tout `.claude/` + `CLAUDE.md` + `.mcp.json`).
Ce dossier ne contient que ce qui NE suit PAS le clone.

---

## Étape 0 — interactif (tu tapes, aucun prompt ne le fait)

```bash
# Installer Claude Code + extension VS Code, puis :
claude                 # -> /login (Max). Les connecteurs claude.ai (Gmail/Calendar/Drive/Apollo) reviennent seuls.
gh auth login          # scopes: repo, workflow, read:org, gist
git clone https://github.com/MartinPaviot/leads.git && cd leads
```

---

## Étape 1 — déposer les fichiers user-global

```bash
cp _research/claude-bootstrap/user-settings.json "$HOME/.claude/settings.json"
cp _research/claude-bootstrap/statusline-command.sh "$HOME/.claude/statusline-command.sh"
chmod +x "$HOME/.claude/statusline-command.sh"
```

`user-settings.json` contient déjà : plugin Vercel activé, effort xhigh, theme auto,
remoteControlAtStartup, agentPushNotif, **skipDangerousModePermissionPrompt true**, statusline,
et un noyau d'allowlist (git/gh/npm/tsc/vitest/playwright/vercel/grep/PowerShell). Le reste
(domaines WebFetch, etc.) regrossira à l'usage — ne pas recopier l'ancien accumulat.

---

## Étape 2 — le prompt de bootstrap (un paste à la racine du repo)

```
Tu bootstrappes Claude Code pour `leads` sur une machine neuve. Repo cloné, je suis loggé Max,
~/.claude/settings.json et statusline déjà déposés. Fais DANS L'ORDRE, montre le résultat de chaque
étape, ARRÊTE-toi pour tout step interactif.

1. MCP user-scope (les MCP projet arrivent via le clone dans .mcp.json — APRÈS le nettoyage
   Rippletide il ne doit rester que context7) :
     claude mcp add --scope user playwright -- cmd /c npx -y @playwright/mcp@latest
     claude mcp add --scope user --transport http datagouv https://mcp.data.gouv.fr/mcp
     npx playwright install chromium

2. Plugin Vercel :
     claude plugin marketplace add anthropics/claude-plugins-official
     claude plugin install vercel@claude-plugins-official
   Je ferai l'OAuth de la MCP Vercel (mcp.vercel.com) quand demandé.

3. Nettoyage Rippletide dans le repo cloné (le faire AVANT de relancer la session, sinon les
   hooks se déclencheraient — ils sont inertes sur Windows mais on les retire proprement) :
     rm -rf .claude/hooks
     rm -f .claude/settings.json           # ce fichier ne contenait QUE le bloc hooks Rippletide
   Puis édite :
     - .mcp.json : supprime l'entrée "rippletide" (garde "context7")
     - CLAUDE.md : supprime toute la section "Hook-First Planning Instructions" en tête
                   (et la consigne de trailer "Co-Authored-By: Rippletide" si tu n'en veux plus)
     - _credentials/bootstrap.json : supprime le bloc "rippletide"
   Montre-moi le git diff avant que je décide de commit.

4. Lien Vercel : lance `vercel link` (je choisis team/projet). Si le CLI manque : npm i -g vercel.

5. Active l'output-style : /output-style detail-over-vision  (fichier déjà cloné).

6. Récapitule ce qui reste à ma main : _credentials/bootstrap.json (IMAP/captcha/SMS/payment),
   .cacerts.pem (uniquement derrière un antivirus qui intercepte le TLS), copie du dossier
   ~/.claude/projects/<projet>/memory/ si je veux garder la mémoire fichier.
```

---

## Envoyer un mail de test (vers nos propres adresses)

Comment déclencher un envoi sortant vers `martin@elevay.dev` /
`martin.paviot@outlook.com` sans toucher de prospect (garde-fou allowlist +
côté expéditeur Resend + scripts probe) : **`SEND-TEST-EMAIL.md`** (dans ce dossier).

## Les `.env` à remplir

Liste exhaustive groupée + template copiable : **`ENV.md`** (dans ce dossier).
Trois fichiers, tous gitignorés : `app/apps/web/.env.local`, `app/apps/admin/.env.local`,
et `.env.prod`/`.env.run` (générés par `vercel env pull`, pas à la main).
Raccourci si la machine est liée à Vercel : `vercel env pull app/apps/web/.env.local`.

## Reste 100 % manuel (secrets — jamais en clair dans un commit)

`_credentials/bootstrap.json` (vérifier que `_credentials/` est gitignoré) :
```
{ "email": {imap_host, imap_port, imap_user, imap_password, catch_all_domain},
  "captcha": {provider, api_key},
  "sms": {provider, api_key, base_url},
  "payment": {card_ref, monthly_cap_usd} }
```
(plus de bloc `rippletide`.)
