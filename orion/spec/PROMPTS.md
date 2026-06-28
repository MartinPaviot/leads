# Orion — TOUS les prompts, dans l'ordre d'exécution

> Un seul fichier, du premier geste au dernier pack. Copie-colle le bloc d'une étape dans
> une session Claude Code. Séquence : **1 SETUP → 1 Vague 0 → 5 Vague 1 (en //) → 1 Vague 2**.
> Pic de parallélisme = **5 sessions** (Vague 1), chacune dans son propre git worktree.

---

## ÉTAPE 1 — SETUP (1 session, dans le repo Orion VIDE)

Ouvre Claude Code à la racine du repo Orion et colle ceci. Aie sous la main : les 2 chaînes
Supabase (app `:6543` / owner `:5432`), `ANTHROPIC_API_KEY` (/v1), `APOLLO_API_KEY`, un mot de
passe admin. (Détail = `PROMPT-00-SETUP.md` ; mécanismes = `SETUP-RUNBOOK.md`.)

```
Tu es la session SETUP d'Orion (pré-lancement opérateur). Le repo est VIDE. Ta mission :
exécuter TOI-MÊME chaque étape d'amorçage automatisable, me demander les seules entrées
humaines (chaînes DB, clés API), exécuter ce que tu peux, puis finir par un rapport
"CE QUE JE DOIS FAIRE (humain)" + le prompt suivant. NE COMMENCE PAS à construire de
features (pas de pack0/pack1) dans cette session — arrête-toi au feu vert.

Source de vérité : C:/Users/ombel/leads/orion (corpus déjà rédigé).

0) Copie le corpus dans ce repo :
   cp -r /c/Users/ombel/leads/orion/spec ./spec
   cp -r /c/Users/ombel/leads/orion/research ./research
   cp -r /c/Users/ombel/leads/orion/brand ./brand
   cp    /c/Users/ombel/leads/orion/README.md ./README.md
   Puis LIS, dans l'ordre : spec/SETUP-RUNBOOK.md (fait foi sur les mécanismes),
   spec/00-PREREQUISITES.md, spec/MCP-AND-PERMISSIONS.md, spec/AUTONOMY-SETUP.md,
   spec/LAUNCH-KIT.md. Suis SETUP-RUNBOOK à la lettre.

1) Amorçage (SETUP-RUNBOOK §1) : .nvmrc=22 ; corepack enable && corepack prepare
   pnpm@10.15.1 --activate ; .gitignore d'amorçage (§1.4) ; commit
   "chore(foundation): bootstrap Orion repo (spec/research/brand + Node 22 + pnpm 10.15.1)" ;
   git push -u origin main (gh = MartinPaviot, déjà configuré). NE FAIS PAS pnpm install
   (pas de package.json — pack0 le scaffolde). NE CRÉE PAS package.json/tsconfig/next.config.

2) Posture autonomie + MCP :
   - CLAUDE.md à la racine = copie de spec/CLAUDE.md.
   - .mcp.json (context7 + playwright) + .claude/settings.local.json (allowlist LECTURE
     SEULE) = blocs de spec/MCP-AND-PERMISSIONS.md §A/§B copiés tels quels ; vérifie
     0 outil mutateur Playwright dans "allow".
   - .claude/settings.json + hooks (secret-scan + tsc) = spec/AUTONOMY-SETUP.md §2-4 ;
     chmod +x les .sh.
   - Commit (config versionnée, aucun secret dedans).

3) Secrets que tu génères TOI-MÊME (jamais commités) :
   - AUTH_SECRET : npx auth secret (valeur SANS guillemets, sans \n).
   - Clé MCP : RAW = "mcp_" + 16 octets hex ; keyHash = bcrypt(RAW, 10) ;
     keyPrefix = RAW.slice(0,8)+"..." ; émets l'entrée McpApiKeyEntry JSON
     (installe bcryptjs en tmp si besoin, cf §4.3). IMPRIME le RAW en clair —
     je dois le sauvegarder (c'est le Bearer de la démo).
   - Hash mot de passe admin : bcrypt('<motdepasse_que_tu_me_demandes>', 12).

4) Écris app/apps/web/.env.local depuis le modèle §2. Remplis ce que tu peux
   (AUTH_SECRET, AUTH_URL=http://localhost:3000, ORION_TENANT_ID=elevay, GDPR_REGION=eu,
   TARGETING_GATE_ENABLED=on, RESEARCH_AGENT_ENABLED=1, ORION_INGEST_ENABLED=on,
   ORION_EXPORT_ENABLED=on). Laisse des placeholders <A_REMPLIR> NETS pour :
   DATABASE_URL (elevay_app @ :6543), DATABASE_URL_OWNER (postgres @ :5432),
   ANTHROPIC_API_KEY, APOLLO_API_KEY, FIBER_API_KEY (source data sponsor, optionnel),
   INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY. Fiber = ENTREE (pas un sink) ; les cles SINK
   (Instantly/OrangeSlice/Lopus) ne vont JAMAIS en env (DB integration_credentials).
   Vérifie que .env.local est bien gitignore.

5) Génère le SQL prêt-à-exécuter dans setup/ (gitignore setup/*.local.sql : il porte les hash) :
   - setup/00-roles.sql : CREATE ROLE elevay_app + GRANT + ALTER DEFAULT PRIVILEGES (§3),
     idempotent.
   - setup/01-tenant-key.local.sql : INSERT tenant 'elevay' + auth_user (PWHASH déjà rempli)
     + users admin + jsonb_set append de l'entrée mcpApiKeys (keyHash déjà rempli) — SQL de §4.

6) Demande-moi les 2 chaînes Supabase (app :6543 / owner :5432) + les clés API. Si je te
   les donne (ou si je les ai déjà mises dans .env.local) : exécute TOI-MÊME
   psql "$DATABASE_URL_OWNER" -f setup/00-roles.sql puis -f setup/01-tenant-key.local.sql,
   et vérifie (elevay_app rolsuper=f/rolbypassrls=f ; SELECT id FROM tenants WHERE id='elevay' ;
   round-trip MCP curl initialize → 200 une fois le dev server up). Sinon, imprime les
   commandes exactes pour que je les lance.

7) Lance toutes les vérifs de SETUP-RUNBOOK §8 que tu peux (boot minimal 3 vars, aucune clé
   sink en env, ports :6543/:5432, flags du role).

8) TERMINE par un rapport "CE QUE JE DOIS FAIRE (humain)" :
   (a) le RAW de la clé MCP à sauvegarder ;
   (b) la liste exacte des <A_REMPLIR> de .env.local ;
   (c) les commandes psql à lancer si tu n'as pas pu te connecter ;
   (d) les connecteurs claude.ai à connecter : Apollo, datagouv, Vercel ;
   (e) ce que tu as DÉJÀ fait (fichiers créés + commits poussés) ;
   (f) l'ÉTAPE SUIVANTE : "ouvre une NOUVELLE session Claude Code dans ce repo et colle
       le prompt Vague 0" (ÉTAPE 2 de PROMPTS.md).
   NE PASSE PAS à pack0/pack1 — arrête-toi ici.

Règles : no-emoji ; Conventional Commits ; git add explicite (jamais git add .) ;
re-vérifie branche+HEAD avant chaque commit ; jamais d'écriture role owner au runtime
(owner = migrations only) ; tenant elevay uniquement ; Context7 avant toute config de lib.
```

---

## ÉTAPE 1bis — RE-SYNC (uniquement si le corpus source a été corrigé APRÈS ton SETUP)

À coller dans une session Claude Code du repo Orion quand la source `C:/Users/ombel/leads/orion` a
été corrigée après que le SETUP a déjà committé l'ancien corpus. NE construit rien.

```
Tu es la session RE-SYNC d'Orion. Le corpus de specs (source: C:/Users/ombel/leads/orion) a été
corrigé (audit de cohérence : Fiber = source d'ENTREE pas un sink ; layout monorepo-miroir
app/apps/web/src ; ledger __elevay_migrations ; rôle elevay_app ; taxonomie = vocab scoring
signal-detectors.ts ; Orion N'ENVOIE PAS, il exporte des briefs ; citations file:line ;
db:push interdit sur la DB prod partagée). Ce repo a les ANCIENNES versions committées (dont un
CLAUDE.md racine "Elevay-first"). Importe le corpus corrigé, réaligne les artefacts dérivés, vérifie
qu'il ne reste AUCUN défaut, committe. NE CONSTRUIS RIEN (pas de pack0/pack1).

1) Re-sync depuis la source :
   cp -rf /c/Users/ombel/leads/orion/spec/*     ./spec/
   cp -rf /c/Users/ombel/leads/orion/research/*  ./research/
   cp -rf /c/Users/ombel/leads/orion/brand/*     ./brand/
   cp -f  /c/Users/ombel/leads/orion/README.md   ./README.md
   (NE touche PAS : app/, app/apps/web/.env.local, .claude/settings.local.json, setup/*.local.sql.)

2) Réaligne les artefacts générés à partir de docs qui ont changé :
   - CLAUDE.md racine = copie EXACTE du corpus : cp -f ./spec/CLAUDE.md ./CLAUDE.md
   - .claude/settings.json + hooks : compare à spec/AUTONOMY-SETUP.md §2 ; ré-applique SI divergence
     (0 outil mutateur Playwright dans allow + hooks enregistrés).
   - .mcp.json + .claude/settings.local.json : compare à spec/MCP-AND-PERMISSIONS.md §A/§B ; ré-applique SI divergence.
   - app/apps/web/.env.local : vérifie qu'il a toujours toutes les vars requises du modèle
     spec/SETUP-RUNBOOK.md §2. NE CHANGE PAS les valeurs (DB prod confirmée). Aucune clé sink en env.

3) Vérification "zéro défaut résiduel" — tout doit être 0 (sauf mentions légitimes "Fiber = entrée") :
     grep -rni "orion_app" spec/ | grep -v "jamais\|n'existe\|ORION_APP_SECRET"   # -> 0
     grep -rn  "__orion_migrations" spec/ | grep -v "PAS\|jamais\|Superseded"      # -> 0
     grep -rn  "record-signal.ts:86" spec/                                          # -> 0
     grep -rniE "fiber" spec/ | grep -iE "= *sink|destination de sortie|export_to_outbound *fiber" # revoir
     head -4 CLAUDE.md   # doit parler d'ORION, jamais "leadsens/Elevay ... GTM engine"
   Si un résidu : NE le corrige PAS dans spec/ (la source leads fait foi) — liste-le file:line dans ton rapport.

4) Commit + push (pathspecs explicites) :
   git add spec research brand README.md CLAUDE.md .claude .mcp.json
   git commit -m "docs(spec): sync corpus corrigé (audit de cohérence) + CLAUDE.md racine Orion-first

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: <URL de ta propre session Claude Code>"
   git push

5) Rapport : fichiers re-synchronisés, artefacts réalignés, résultat des vérifs, et l'ÉTAPE SUIVANTE :
   "ouvre une nouvelle session et colle le prompt Vague 0 (ÉTAPE 2)". NE PASSE PAS à pack0/pack1.

Règles : no-emoji ; git add explicite ; re-vérifie branche+HEAD avant commit ; ne modifie ni
app/apps/web/.env.local (valeurs) ni setup/*.local.sql ; tenant elevay uniquement.
```

---

## ÉTAPE 2 — Vague 0 (1 session, séquentiel pack0 puis pack1)

Nouvelle session Claude Code dans le repo Orion (sur `main`), après le feu vert du SETUP.

```
Tu es la session FONDATION d'Orion (Vague 0). Tu fais pack0 PUIS pack1, dans l'ordre.
Lis d'abord, dans cet ordre : spec/00-ARCHITECTURE.md, spec/00-EXECUTION-GUIDE.md,
spec/00-PREREQUISITES.md, spec/MCP-AND-PERMISSIONS.md, spec/CONFIG-TOOLING.md, spec/CLAUDE.md.

1) pack0 — exécute spec/packages/pack0-foundation.md de bout en bout.
   Branche : feat/orion-pack0-foundation (depuis main). Pose .mcp.json (context7+playwright) +
   .claude/settings.local.json (cf spec/MCP-AND-PERMISSIONS.md), playwright.config.ts + auth-fixture +
   vitest + CI (cf spec/CONFIG-TOOLING.md). Ouvre la PR, squash-merge sur main.
2) pack1 — branche feat/orion-pack1-schema (depuis main À JOUR). Exécute spec/packages/pack1-schema.md.
   Critère dur : pack1 produit TOUS les contrats partagés (taxonomy.ts, ingest/types.ts, ingest/jobs.ts,
   outbound/types.ts, outreach-brief.schema.ts, campaign-engine/brief.ts) → pack2/3/4/5/6 doivent tsc
   en n'important QUE pack0+pack1. Squash-merge sur main.

Règles : DB partagée leads, tenant elevay UNIQUEMENT (rôle elevay_app, withTenantTx + set_config(...,true)
LOCAL, jamais d'écriture owner au runtime, ne JAMAIS MODIFIER/RÉÉCRIRE lib/guardrails/sending-gate.ts —
copie Elevay vendorée d'evaluateSend, INCHANGÉE (tripwire) ; n'écris pas ton propre gate, passe par le
wrapper orion-send-gate.ts qui réexporte evaluateSend) ; tables
additives via le runner __elevay_migrations (db:migrate:apply, 0107+) — JAMAIS db:push sur la DB prod partagée (destructif) ; createFunction Inngest 2-arg ; Anthropic /v1.
Commits : Conventional Commits, 1 changement logique chacun, git add explicite, re-vérifie branche+HEAD
avant chaque commit, trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>. Ne touche QUE les fichiers
possédés par pack0 puis pack1. Termine sur "voilà la vérification" avec tsc+tests verts.
```

---

## ENTRE-DEUX — crée les 5 worktrees (une fois pack1 mergé sur main)

```bash
cd <orion-repo>
git fetch origin && git checkout main && git pull --ff-only
git worktree add ../orion-pack2 -b feat/orion-pack2-ingestion     main
git worktree add ../orion-pack3 -b feat/orion-pack3-brief-mcp     main
git worktree add ../orion-pack4 -b feat/orion-pack4-output-gates  main
git worktree add ../orion-pack5 -b feat/orion-pack5-tier2-signals main
git worktree add ../orion-pack6 -b feat/orion-pack6-ui            main
```
Ouvre **une session Claude Code dans chaque dossier `../orion-packN`**, colle le prompt
correspondant. Après merge de chaque PR : `git worktree remove ../orion-packN`.

---

## ÉTAPE 3 — Vague 1 (5 sessions EN PARALLÈLE)

### Session → ../orion-pack2 (Ingestion + offline-discovery — le wedge)
```
Tu es la session pack2 d'Orion. Prérequis : pack0+pack1 mergés sur main.
Tu es déjà sur la branche feat/orion-pack2-ingestion dans ton worktree dédié (../orion-pack2)
— n'en change pas. Worktree neuf : lance d'abord pnpm install --frozen-lockfile.
Lis : spec/00-ARCHITECTURE.md, spec/00-EXECUTION-GUIDE.md, spec/00-PREREQUISITES.md,
spec/MCP-AND-PERMISSIONS.md, spec/CLAUDE.md, puis spec/packages/pack2-ingestion.md ET
spec/demo-hero-FROZEN.md (le wedge offline-discovery s'y ancre). N'importe QUE pack0+pack1.
Construis : IngestSource/IngestItem (CSV + Apollo/waterfall) → identity-resolve → compose → acquire
signals → score ; les outils MCP ingest_csv/get_ingest_job ; ET le WEDGE offline-discovery (CSV
won/lost labellisé → reconstruction point-in-time [J-90→J] depuis sources datées → lift discriminant
denom=lost → filtres non-évidence × acquérabilité → prior cross-tenant à froid). Test dur : sur le seed
hero FIGÉ, leadership_change.vp_eng sort à ~4,2× et le confounder investor_overlap s'effondre sur le
stratum froid (deal_source=outbound).
Règles : tenant elevay/RLS, brief zéro prose, no-emoji. Boucle code→test→verify→commit atomique
(Conventional Commits, scope ingest/signals, git add explicite, re-vérifie branche+HEAD, trailer
Co-Authored-By: Claude <noreply@anthropic.com>). Rebase sur origin/main avant la PR.
PR feat(orion): pack2 — ingestion + offline-discovery, base main, squash-merge.
```

### Session → ../orion-pack3 (Brief + MCP)
```
Tu es la session pack3 d'Orion. Prérequis : pack0+pack1 sur main.
Tu es déjà sur la branche feat/orion-pack3-brief-mcp dans ton worktree dédié (../orion-pack3)
— n'en change pas. Worktree neuf : lance d'abord pnpm install --frozen-lockfile.
Lis : spec/00-ARCHITECTURE.md, 00-EXECUTION-GUIDE.md, 00-PREREQUISITES.md, MCP-AND-PERMISSIONS.md,
CLAUDE.md, puis spec/packages/pack3-brief-mcp.md, research/signal-outreach-brief-2026-06-27.md.
N'importe QUE pack0+pack1.
Construis : get_outreach_brief (réutilise buildIntelligenceBrief ; assemble sections A–G +
citableFacts[]/doNotClaim[], ZÉRO prose) ; extension serveur MCP (annotations readOnly/destructive,
outputSchema + structuredContent, resources dossier prospect, bump protocolVersion 2025-06-18) ;
find_prospects, get_signals, explain_priority. Patche l'envelope tools/call Elevay pour structuredContent
(autorisé, séquentiel après pack0). Règles : tenant elevay/RLS, no-emoji.
Boucle code→test→verify→commit (Conventional, scope brief/mcp, git add explicite, re-vérifie HEAD,
trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>). Rebase sur origin/main avant la PR.
PR feat(orion): pack3 — outreach brief + MCP, base main, squash-merge.
```

### Session → ../orion-pack4 (Output + Gates)
```
Tu es la session pack4 d'Orion. Prérequis : pack0+pack1 (+ contrat brief de pack3) sur main.
Tu es déjà sur la branche feat/orion-pack4-output-gates dans ton worktree dédié (../orion-pack4)
— n'en change pas. Worktree neuf : lance d'abord pnpm install --frozen-lockfile.
Lis : les 00-*, MCP-AND-PERMISSIONS.md, CLAUDE.md, puis spec/packages/pack4-output-gates.md,
research/partner-apis-2026-06-27.md. N'importe QUE pack0+pack1.
Construis : OutboundDestination ; export_to_outbound qui passe CHAQUE lead par evaluateSend (oracle
d'éligibilité) AVANT push ; adaptateurs RÉELS = Instantly (custom_variables scalaires) + Orange Slice
(webhook colonne JSON plat) + Lopus (webhook générique) + webhook HMAC. PAS de FiberAdapter/LopusAdapter
REST (Fiber = entrée, pas sortie). Clés partenaires per-tenant via integration_credentials.
Règles : gate non-contournable, tenant elevay/RLS, jamais d'envoi cold via infra cliente, no-emoji.
Boucle code→test→verify→commit (Conventional, scope outbound, git add explicite, re-vérifie HEAD,
trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>). Rebase sur origin/main avant la PR.
PR feat(orion): pack4 — outbound export + gates, base main, squash-merge.
```

### Session → ../orion-pack5 (Tier-2 signals + Fiber input)
```
Tu es la session pack5 d'Orion. Prérequis : pack0+pack1 (+ framework ingest pack2) sur main.
Tu es déjà sur la branche feat/orion-pack5-tier2-signals dans ton worktree dédié (../orion-pack5)
— n'en change pas. Worktree neuf : lance d'abord pnpm install --frozen-lockfile.
Lis : les 00-*, MCP-AND-PERMISSIONS.md, CLAUDE.md, puis spec/packages/pack5-tier2-signals.md,
spec/demo-hero-FROZEN.md, research/signals-world-class-2026-06-27.md. N'importe QUE pack0+pack1.
Construis les SignalSource souverains/hard-to-get HORODATÉS (reconstruction point-in-time à froid) :
leadership_change.vp_eng (Fiber Tracker + Unipile/LinkedIn + BODACC) — le signal du hero — SEC/EDGAR
Form D, ATS publics Greenhouse/Lever/Ashby, GitHub/npm, velocity (signal_snapshots diff), crt.sh.
Mappe chaque rawType via taxonomy.ts (toCanonicalSignal). Plus la source INPUT Fiber TRACKER
(webhook Svix → fiberSignalIngestor). Le reveal contact /v1/contact-details/single est PACK2
(enrich/fiber-reveal.ts) : ne PAS le réimplémenter ici ; sa clé x-api-key vient de FIBER_API_KEY en env
pour la démo. Règles : tenant elevay/RLS, never-throw, no-emoji.
Boucle code→test→verify→commit (Conventional, scope signals, git add explicite, re-vérifie HEAD,
trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>). Rebase sur origin/main avant la PR.
PR feat(orion): pack5 — tier-2 signals + fiber, base main, squash-merge.
```

### Session → ../orion-pack6 (UI design Elevay)
```
Tu es la session pack6 d'Orion. Prérequis : pack0 sur main (consomme les API pack2/3/4 — mocke si pas
encore mergées). Tu es déjà sur la branche feat/orion-pack6-ui dans ton worktree dédié (../orion-pack6)
— n'en change pas. Worktree neuf : lance d'abord pnpm install --frozen-lockfile.
Lis : les 00-*, MCP-AND-PERMISSIONS.md, CLAUDE.md, puis spec/packages/pack6-ui.md, spec/ui-spec.md.
N'importe QUE pack0 (+ contrats lib/* de pack1).
Construis l'UI identique à Elevay (tokens partagés, Inter/JetBrains Mono, accent #2C6BED, NO-EMOJI,
demi-écran 680-960px) : écrans Sources/Ingestion, Prospects (rankés priority_score), Brief (dossier
why-now + citations), Export (destinations + verdict gate). Seule édition autorisée hors tes fichiers :
globals.css (extraction tokens, documentée). Règle un-seul-navigateur : tu es la seule session Playwright.
Boucle code→test→verify→commit (Conventional, scope ui, git add explicite, re-vérifie HEAD, trailer
Co-Authored-By: Claude <noreply@anthropic.com>). Rebase sur origin/main avant la PR.
PR feat(orion): pack6 — UI (design Elevay), base main, squash-merge.
```

Throttle possible : d'abord 3 (pack2, pack3, pack5), puis 2 (pack4, pack6).

---

## ÉTAPE 4 — Vague 2 (1 session, pack7)

Nouvelle session dans le repo Orion (sur `main` post-Vague-1).

```
Tu es la session pack7 d'Orion. Prérequis : pack0–pack6 mergés sur main.
Lis : les 00-*, MCP-AND-PERMISSIONS.md, CLAUDE.md, puis spec/packages/pack7-demo-integration.md,
spec/demo-hero-FROZEN.md.
Branche : feat/orion-pack7-demo (depuis main).
Construis : chargement du seed hero FIGÉ dans le tenant elevay (insert PUIS score ; matérialise les
événements DATÉS en properties.signals[]/signal_snapshots pour que [J-90→J] FIRE ; TARGETING_GATE_ENABLED=on ;
1 compte-piège unreviewed) ; le parcours démo (upload → offline-discovery → restitution 90s : preuve +
confiance honnête + reveal confounder investor_overlap qui s'effondre sur le froid + action + 1
confirmation) ; l'acquisition à froid d'un prospect via leadership_change.vp_eng (Fiber/LinkedIn/BODACC) ;
hardening (transport MCP HTTPS, generateOpener non-vide). Migrations 0108+.
Boucle code→test→verify→commit (Conventional, scope demo, git add explicite, re-vérifie HEAD, trailer
Co-Authored-By: Claude <noreply@anthropic.com>). PR feat(orion): pack7 — demo + hero seed,
base main, squash-merge.
```
