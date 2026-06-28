# Orion — Kit de lancement des sessions parallèles

Un prompt prêt-à-coller par session. Conventions git de niveau pro intégrées.

## Étape 0 — amorcer le repo Orion (une fois)
Le repo Orion est vide (premier commit). Copie d'abord le corpus de spec dedans pour que chaque
session soit autonome :
```
<orion-repo>/
  spec/        ← copie de leads/orion/spec/  (00-*, packages/, CLAUDE.md, CONFIG-TOOLING.md, MCP-AND-PERMISSIONS.md, demo-hero-FROZEN.md, LAUNCH-KIT.md, ...)
  research/    ← copie de leads/orion/research/  (les rapports cités par les briefs)
  brand/       ← copie de leads/orion/brand/
```
Prérequis opérateur (cf `spec/00-PREREQUISITES.md`) avant la Vague 0 : tenant `elevay` créé,
`DATABASE_URL` (DB dev `leads`), clés `ANTHROPIC`(/v1)/`APOLLO`/`CRUNCHBASE`, connecteurs claude.ai
(Apollo, datagouv, Vercel), flag `TARGETING_GATE_ENABLED=on`.

## Conventions git (professionnelles, non négociables)
- **Une branche par lot** : `feat/orion-packN-<slug>`, créée depuis la base de sa vague (ci-dessous).
- **Conventional Commits** : `type(scope): sujet`. Types : `feat|fix|refactor|test|chore|docs|perf`.
  Scope = domaine (`foundation|db|auth|inngest|ingest|brief|mcp|outbound|signals|ui|demo`).
  Sujet impératif, ≤ 72 caractères, sans point final, **sans emoji**.
- **1 commit = 1 changement logique**, indépendamment révertable. Sépare *schéma/migration*, *code*,
  *tests*, *refactor* (jamais mélangés). Le body explique le **pourquoi**, pas le quoi.
- **Historique propre** : `git rebase` (jamais `merge`) pour rester à jour sur la base ; pas de
  commits `wip`/`tmp`/`fix typo` — recompose-les (`git commit --amend` / rebase interactif local)
  avant push. Pas de fichiers générés ni de secrets commités.
- **Tree partagé** : `git add <pathspecs explicites>` — **jamais `git add .`**. Juste avant chaque
  commit : `git branch --show-current && git log --oneline -1` pour confirmer branche+HEAD.
- **PR par lot** : titre Conventional (`feat(orion): pack2 — ingestion + offline-discovery`), base =
  la base de la vague, body = **Résumé / Fichiers possédés / Plan de test / Verify / Risques**.
  **Squash-merge** (un commit propre par lot sur `main`).
- **Trailer de commit** (footer) :
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: <URL de ta propre session Claude Code>`

## Ordre des vagues (et base de chaque branche)
- **Vague 0** (séquentiel, 1 session) : `pack0` depuis `main` → squash-merge → `pack1` depuis `main`
  à jour → squash-merge. `main` porte alors le socle + les contrats partagés.
- **Vague 1** (parallèle, jusqu'à 5 sessions) : `pack2`, `pack3`, `pack4`, `pack5`, `pack6` — chacune
  depuis `main` (post-pack1). Fichiers possédés disjoints → zéro collision.
- **Vague 2** (1 session) : `pack7` depuis `main` (post-vague-1).

Préambule commun à TOUS les prompts (déjà inclus dans chacun ci-dessous) — chaque session :
lit `spec/00-ARCHITECTURE.md` → `spec/00-EXECUTION-GUIDE.md` → `spec/00-PREREQUISITES.md` →
`spec/MCP-AND-PERMISSIONS.md` → `spec/CLAUDE.md`, **puis** exécute son brief de bout en bout ; ne
touche QUE ses fichiers possédés ; boucle par tâche `code → test → verify → commit atomique`.

---

## PROMPT — Vague 0, session A (pack0 puis pack1)
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
LOCAL, jamais d'écriture owner au runtime, ne JAMAIS MODIFIER/réécrire lib/guardrails/sending-gate.ts —
copie Elevay INCHANGÉE d'evaluateSend (tripwire reuse-untouched) qui DOIT exister sous src/ ; le seul
net-new est le wrapper orion-send-gate.ts qui réexporte evaluateSend) ; tables
additives (migrations 0107+) ; runner __elevay_migrations ; createFunction Inngest 2-arg ; Anthropic /v1.
Commits : Conventional Commits, 1 changement logique chacun, git add explicite, re-vérifie branche+HEAD
avant chaque commit, trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> + Claude-Session: <URL de ta propre session Claude Code>. Ne touche QUE les fichiers
possédés par pack0 puis pack1. Termine sur "voilà la vérification" avec tsc+tests verts.
```

## PROMPT — Vague 1, session pack2 (Ingestion + offline-discovery)
```
Tu es la session pack2 d'Orion. Prérequis : pack0+pack1 mergés sur main.
Lis : spec/00-ARCHITECTURE.md, spec/00-EXECUTION-GUIDE.md, spec/00-PREREQUISITES.md,
spec/MCP-AND-PERMISSIONS.md, spec/CLAUDE.md, puis spec/packages/pack2-ingestion.md ET
spec/demo-hero-FROZEN.md (le wedge offline-discovery s'y ancre).
Branche : feat/orion-pack2-ingestion (depuis main). N'importe QUE des fichiers de pack0+pack1.
Construis : IngestSource/IngestItem (CSV + Apollo/waterfall) → identity-resolve → compose → acquire
signals → score ; les outils MCP ingest_csv/get_ingest_job ; ET le WEDGE offline-discovery (CSV
won/lost labellisé → reconstruction point-in-time [J-90→J] depuis sources datées → lift discriminant
denom=lost → filtres non-évidence × acquérabilité → prior cross-tenant à froid). Test dur : sur le seed
hero FIGÉ, leadership_change.vp_eng sort à ~4,2× et le confounder investor_overlap s'effondre sur le
stratum froid (deal_source=outbound).
Règles : tenant elevay/RLS, brief zéro prose, no-emoji. Boucle code→test→verify→commit atomique
(Conventional Commits, scope ingest/signals, git add explicite, re-vérifie branche+HEAD, trailer
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> + Claude-Session: <URL de ta propre session Claude Code>). PR feat(orion): pack2 — ingestion + offline-discovery,
base main, squash-merge.
```

## PROMPT — Vague 1, session pack3 (Brief + MCP)
```
Tu es la session pack3 d'Orion. Prérequis : pack0+pack1 sur main.
Lis : spec/00-ARCHITECTURE.md, 00-EXECUTION-GUIDE.md, 00-PREREQUISITES.md, MCP-AND-PERMISSIONS.md,
CLAUDE.md, puis spec/packages/pack3-brief-mcp.md, research/signal-outreach-brief-2026-06-27.md.
Branche : feat/orion-pack3-brief-mcp (depuis main). N'importe QUE pack0+pack1.
Construis : get_outreach_brief (réutilise buildIntelligenceBrief ; assemble sections A–G +
citableFacts[]/doNotClaim[], ZÉRO prose) ; extension serveur MCP (annotations readOnly/destructive,
outputSchema + structuredContent, resources dossier prospect, bump protocolVersion 2025-06-18) ;
find_prospects, get_signals, explain_priority. Patche l'envelope tools/call Elevay pour structuredContent
(autorisé, séquentiel après pack0). Règles : tenant elevay/RLS, no-emoji.
Boucle code→test→verify→commit (Conventional, scope brief/mcp, git add explicite, re-vérifie HEAD,
trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> + Claude-Session: <URL de ta propre session Claude Code>). PR feat(orion): pack3 — outreach brief + MCP,
base main, squash-merge.
```

## PROMPT — Vague 1, session pack4 (Output + Gates)
```
Tu es la session pack4 d'Orion. Prérequis : pack0+pack1 (+ contrat brief de pack3) sur main.
Lis : les 00-*, MCP-AND-PERMISSIONS.md, CLAUDE.md, puis spec/packages/pack4-output-gates.md,
research/partner-apis-2026-06-27.md.
Branche : feat/orion-pack4-output-gates (depuis main). N'importe QUE pack0+pack1.
Construis : OutboundDestination ; export_to_outbound qui passe CHAQUE lead par evaluateSend (oracle
d'éligibilité) AVANT push ; adaptateurs RÉELS = Instantly (custom_variables scalaires) + Orange Slice
(webhook colonne JSON plat) + Lopus (webhook générique) + webhook HMAC. PAS de FiberAdapter/LopusAdapter
REST (Fiber = entrée, pas sortie). Clés partenaires per-tenant via integration_credentials.
Règles : gate non-contournable, tenant elevay/RLS, jamais d'envoi cold via infra cliente, no-emoji.
Boucle code→test→verify→commit (Conventional, scope outbound, git add explicite, re-vérifie HEAD,
trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> + Claude-Session: <URL de ta propre session Claude Code>). PR feat(orion): pack4 — outbound export + gates,
base main, squash-merge.
```

## PROMPT — Vague 1, session pack5 (Tier-2 signals + Fiber input)
```
Tu es la session pack5 d'Orion. Prérequis : pack0+pack1 (+ framework ingest pack2) sur main.
Lis : les 00-*, MCP-AND-PERMISSIONS.md, CLAUDE.md, puis spec/packages/pack5-tier2-signals.md,
spec/demo-hero-FROZEN.md, research/signals-world-class-2026-06-27.md.
Branche : feat/orion-pack5-tier2-signals (depuis main). N'importe QUE pack0+pack1.
Construis les SignalSource souverains/hard-to-get HORODATÉS (reconstruction point-in-time à froid) :
leadership_change.vp_eng (Fiber Tracker + Unipile/LinkedIn + BODACC) — le signal du hero — SEC/EDGAR
Form D, ATS publics Greenhouse/Lever/Ashby, GitHub/npm, velocity (signal_snapshots diff), crt.sh.
Mappe chaque rawType via taxonomy.ts (toCanonicalSignal). Plus la source INPUT Fiber reveal
(/v1/contact-details/single, x-api-key per-tenant). Règles : tenant elevay/RLS, never-throw, no-emoji.
Boucle code→test→verify→commit (Conventional, scope signals, git add explicite, re-vérifie HEAD,
trailer Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> + Claude-Session: <URL de ta propre session Claude Code>). PR feat(orion): pack5 — tier-2 signals + fiber,
base main, squash-merge.
```

## PROMPT — Vague 1, session pack6 (UI)
```
Tu es la session pack6 d'Orion. Prérequis : pack0 sur main (consomme les API pack2/3/4 — mocke si pas
encore mergées). Lis : les 00-*, MCP-AND-PERMISSIONS.md, CLAUDE.md, puis spec/packages/pack6-ui.md,
spec/ui-spec.md.
Branche : feat/orion-pack6-ui (depuis main). N'importe QUE pack0 (+ contrats lib/* de pack1).
Construis l'UI identique à Elevay (tokens partagés, Inter/JetBrains Mono, accent #2C6BED, NO-EMOJI,
demi-écran 680-960px) : écrans Sources/Ingestion, Prospects (rankés priority_score), Brief (dossier
why-now + citations), Export (destinations + verdict gate). Seule édition autorisée hors tes fichiers :
globals.css (extraction tokens, documentée).
Boucle code→test→verify→commit (Conventional, scope ui, git add explicite, re-vérifie HEAD, trailer
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> + Claude-Session: <URL de ta propre session Claude Code>). PR feat(orion): pack6 — UI (design Elevay),
base main, squash-merge.
```

## PROMPT — Vague 2, session pack7 (Demo + seed + intégration)
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
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> + Claude-Session: <URL de ta propre session Claude Code>). PR feat(orion): pack7 — demo + hero seed,
base main, squash-merge.
```
