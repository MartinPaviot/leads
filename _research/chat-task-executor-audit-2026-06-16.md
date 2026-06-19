# Audit — Le chat comme véritable exécuteur de tâches (action live sur chaque page)

Date : 2026-06-16
Question : permettre au chat d'agir en live sur chacune des pages — « tout faire sur chaque page sur demande ».
Méthode : cartographie complète en 4 axes (inventaire des outils serveur, surface d'action par page, couche de commande côté client, rails approbation/undo/autonomie). Tous les chiffres sont sourcés `fichier:ligne`.

---

## 0. Verdict en une page

Le chat n'est **pas** un simple répondeur : c'est déjà un agent mature — **158 outils** serveur (≈92 lecture, ≈63 mutation DB, **3 seulement actionnent l'UI**), un orchestrateur multi-agents (5 spécialistes), un capability-resolver par tour (rôle × surface × plan × destructif), et une couche de commande propre et extensible.

Mais pour « tout faire sur chaque page », il manque **une seule chose structurante** : **une couche d'actionnement de page générique**. Aujourd'hui le chat ne peut faire que deux choses *visibles* sur la page : `naviguer` et `ouvrir le composer email`. Il ne peut **pas** appliquer un filtre, ouvrir une modale, remplir un formulaire, glisser une carte kanban, déclencher la numérotation, lancer un enregistrement, cocher des lignes + lancer une action de masse *sous les yeux de l'utilisateur*. Tout le reste de son pouvoir est « headless » (il écrit en base via API sans toucher l'écran).

**La bonne réponse n'est pas d'ajouter encore des outils 1-pour-1** (c'est pour ça qu'on a 158 outils et toujours des trous). C'est d'**inverser le modèle** : chaque page *déclare* ses actions dans un registre typé, et le chat obtient une petite surface stable (`listPageActions` / `invokePageAction`) qui reflète dynamiquement ce que la page courante sait faire. **Parité par construction** : tout ce qu'un humain peut cliquer devient invocable par l'agent, et l'utilisateur *voit* l'action se produire.

Trois bugs/dérives importants découverts en chemin (détail §6) :
1. **Le garde-fou d'approbation du chat est mort-câblé** — la route passe `agentApprovalMode` brut (valeur v2 `"review-each"`) alors que les outils testent `=== "ask"` (valeur v1) → les outils de création **mutent sans carte de validation**.
2. **`enforceSendingIdentity` (protection du domaine primaire) est du code orphelin** — configurable dans l'UI, lu par aucun chemin d'envoi.
3. **Les maps du tool-router / orchestrator ont dérivé du réel** (126 annoncés vs **158** réels ; 3 outils fantômes `runCustomSkill`/`listCustomSkills`/`forkSkill` référencés mais inexistants ; ~38 outils non-routés qui passent à chaque tour par fail-open).

Score de complétude global (rubrique CLAUDE.md, 0-10) : **mutation headless 8/10 · actionnement live 2/10 · mécanisme de parité/découverte 1/10 · approbation/undo 5/10 · autonomie/background 6/10.**

---

## 1. État actuel — ce qui existe déjà (et qui est solide)

### 1.1 Couche outils serveur — `lib/chat/tools/*` (23 modules, 158 outils)
Pipeline par message (`app/api/chat/route.ts:602-638`) :
`buildAllChatTools` (158) → `resolveCapabilities` (rôle/surface/plan/destructif) → orchestrateur (5 spécialistes, seuil 0.8) **ou** `routeTools` (intent regex → groupes).

Répartition par effet :
- **Lecture/calcul ≈ 92** : query (25), intelligence (7), briefing (3), brain (3), coaching (4), read-gaps (3), schema (2), knowledge (1), + skills d'analyse + `draftEmail`/`suggestEmailReply`/`generateFollowUpEmail` (retournent du contenu, n'envoient pas).
- **Mutation serveur/DB ≈ 63** : tout create (16), tout update (26), la plupart de action (18), memory writes, workflow writes, enrichment (2), `applyCallSprint`/`enrichCallSprint`, `executeImport`, skills mutants (`buildTAM`, `enrichContact`), `undoLastAction`.
- **Actionnement client = 3** : `openRecord`, `openListView`, `composeEmail` (+ `applyCallSprint`/`enrichCallSprint` qui accrochent une directive `navigate` en secondaire).

Gating réel (`lib/agents/capability-resolver.ts`) : admin-only (16), destructif (caché tant que `allowDestructive` faux — **jamais vrai en prod**, `route.ts:614`), pro-tier (5, **toujours gated** car `planTier` défaut `free`), viewer = 4 groupes lecture seule (fail-closed).

Le système de **skills** est curaté : le chat n'appelle que des outils câblés à la main dans `skills.ts`, chacun déléguant à UN skill via `runSkill`. **31 skills built-in** enregistrés. Les **custom skills** (DB-backed, `skills/custom/executor.ts`) sont exposés par la route REST Settings mais **PAS** au chat — les 3 outils `runCustomSkill`/`listCustomSkills`/`forkSkill` référencés par le router et le system-prompt **n'existent pas** (fantômes).

### 1.2 Couche de commande côté client — propre, globale, mais étroite
- **Montée globalement** : `<ChatDock />` est monté une fois dans `app/(dashboard)/layout.tsx:117`, présent sur **toutes** les pages dashboard (se cache sur `/chat`). Bonne fondation.
- **Surface page-aware sans câblage par page** : `deriveSurface(usePathname())` (`lib/chat/surface-from-path.ts`) → `{contextType, contextId}` envoyé dans le body du POST `/api/chat` à chaque message (via `surfaceRef`, re-évalué à l'envoi). Le serveur sait donc quelle entité l'utilisateur regarde.
- **Mécanisme de directive propre et extensible** : SSOT `lib/chat/ui-directives.ts`, clé `_uiDirective`, exécuteur unique `use-ui-directives.ts` (tire une fois, replay-safe, garde anti-open-redirect `isSafeInternalPath`).
- **MAIS l'union de directives n'a que 2 `kind`** :
  ```ts
  type UiDirective =
    | { kind: "navigate"; path: string; label?: string }
    | { kind: "composeEmail"; draft: ComposeEmailDraft };
  ```
  `runUiDirective` est un switch à 2 branches : `navigate → router.push` ; `composeEmail → setEmailComposer(draft)`.
- **Aucun bus d'action générique.** Zéro `dispatchEvent`/`CustomEvent` dans le chemin chat ; zéro `addToolResult`/`onToolCall`/`onData` (les hooks d'exécution d'outils côté client de l'AI SDK ne sont pas utilisés) ; pas de store partagé chat↔pages. Le composer email le prouve : **10 instances locales `useState` indépendantes**, pas de store global.
- **Cartes d'action / d'approbation** : `chat-action-cards.tsx` rend les `{proposal:true}` en cartes éditables ; « Approve » fait un `fetch` REST direct (`POST /api/contacts|accounts|opportunities`) puis ré-injecte un message synthétique `[Approved: …]`. Donc la création « validée » est un appel REST côté client sur clic humain, pas un outil exécuté serveur.

### 1.3 Rails sécurité — fondations posées, câblage partiel
- **Audit + undo (CHAT-04) : LIVRÉ et câblé** pour create/update d'entités CRM. Table `tool_call_events` (`db/schema/intelligence.ts:84`, migration 0012 appliquée). `logToolCall` appelé par create (11), update (7), action (2), workflow (2) avec snapshot réversible. `undoLastAction` (`tools/undo.ts`) restaure ~10 types d'entités. **Trou** : aucune action sortante/irréversible (envoi email, enroll, launch, call, enrich) n'est dans le système d'undo.
- **Approbation : 3+ systèmes parallèles, déconnectés.**
  - (A) Cartes-proposition du chat — **construites mais mortes** (bug §6.1).
  - (B) `enforceAgentApprovalMode` (`lib/guardrails/approval-mode.ts`) = vrai SSOT v2 (`review-each|batch-daily|auto-high-confidence`) — **appelé seulement par le background**, jamais par les outils chat.
  - (C) `capture-approvals` (`lib/capture/approval.ts`) — propre et câblé, mais gouverne l'**ingestion** (capture email/meeting), pas le sortant.
- **Autonomie : 4e vocabulaire.** `autonomyConfig.level` (`copilot|guided|autonomous|strategic`, table dédiée) — **niveau décoratif** : le chat ne le lit pas ; seul le sous-objet `guardrails` (caps + neverContact) est lu par le campaign-engine. Toggler « Autonomous » dans l'UI ne change rien à ce que le chat ou le reactor font.
- **Guardrails d'envoi : mixtes.** Le seul fort et cohérent = kill-switch `OUTBOUND_TEST_MODE` (fail-safe ON, 5 chokepoints) — **mais reportedly OFF en prod** (cf. mémoire). `enforceSendingIdentity` (protection domaine primaire) = **orphelin** (bug §6.2). Suppression/opt-out, fenêtres horaires (UTC, pas TZ tenant), caps par mailbox : appliqués de façon **incohérente** selon le chokepoint.
- **Background autonomy : RÉEL et actif.** `agentReactor` (décide par event CRM, route via `enforceAgentApprovalMode`) → écrit des `agent_actions` → `agentActionDispatcher` (cron **chaque minute**) les exécute. `signalAutoEnroll` enrôle jusqu'à 5 contacts + crée un deal **sans aucun check d'approbation** (vrai trou — bridé de facto seulement parce qu'il y a 0 séquence active en prod). Le chat enfile du travail durable : `executeImport` → `agent_tasks` (insertions CRM par batch sans revue ligne-à-ligne), `research-agent`, workflows.
- **Rôles** : viewer read-only **systémique** (middleware `isViewerWriteBlocked`) ; admin/member **partiel** (~59/227 routes appellent `requireAdmin`/`requirePermission`) ; les écritures CRM courantes sont member-open. Isolation tenant = app-layer `WHERE tenantId` (RLS 0074 fallback-allow).

---

## 2. Le diagnostic — pourquoi le chat ne « fait pas tout sur chaque page »

Quatre manques, par ordre d'impact :

**G1 — Pas de couche d'actionnement de page (LE blocage).**
3 directives client seulement. Tout ce qui est *état d'UI* (filtres, vues, modales, wizards, dialer live, recorder, drag kanban, sélection + barre de masse) est hors de portée. C'est exactement ce que veut dire « agir en live sur la page ».

**G2 — Pas de mécanisme de parité/découverte.**
Les outils sont portés à la main, un par un. Résultat : 158 outils, des maps de routage qui ont dérivé (126 annoncés, 3 fantômes, ~38 non-routés), des skills custom jamais branchés, et des trous par page qui ne se combleront jamais à ce rythme. Il faut un registre qui **expose automatiquement** ce que chaque page sait faire.

**G3 — Plan de contrôle fragmenté.**
4 vocabulaires d'approbation/autonomie qui ne se parlent pas, le garde-fou chat mort-câblé, un guardrail orphelin, l'undo qui ne couvre pas le sortant. Un exécuteur « qui fait tout » doit rouler sur **un** modèle permission+approbation+undo cohérent — sinon « tout faire » = « tout casser sans filet ».

**G4 — Visibilité/confiance.**
Quand l'agent agit headless, l'utilisateur ne *voit* rien se passer sur sa page. Pour un « exécuteur live », il faut montrer l'action (actionner l'UI réelle), prévisualiser le risqué, et offrir l'undo en un clic.

---

## 3. Tableau de parité par page (couvrable aujourd'hui vs à actionner vs difficile)

| Page | Couvrable **headless** aujourd'hui (outil existe) | Nécessite **couche d'actionnement** (état d'UI / mieux sur page) | **Difficile / device-bound** (ocean ou hors-scope) |
|---|---|---|---|
| **/accounts** (liste) | create/update account, enrich, score, signals, extract contacts, exclude/restore, delete (via tools) | filtres colonnes + smart search, toggles vue (excluded/archive), select-all-matching + barre de masse *visible*, TAM build streaming, PersonaSearch (NL→ICP→save) | — |
| **/accounts/[id]** | update champs, owner, summary regen, dossier, approve/dismiss intel | édition inline des champs, cartes intel approve/dismiss | — |
| **/contacts** (liste) | create/update, enrich, find-mobile, score, merge, delete/restore | CSV/Smart Import (file picker), filtres + smart search, select-all + masse | upload fichier (dialogue navigateur) |
| **/contacts/[id]** | update, owner, draft+send email | call (→ call-mode), suggest-reply→composer, intel approve | — |
| **/opportunities** (board+detail) | create deal, update, stage move, auto-progress, analyze, delete/restore | **drag kanban → stage (+ dialogue close-reason)**, toggles forecast/analytics, filtres, MEDDPICC approve | — |
| **/inbox** | (lecture), suggest-reply, send, book meeting, stop sequence | tabs/lanes, triage done/snooze/reopen, sélection conversation, rail mailbox, table outbound | — |
| **/call-mode** | getCallList, applyCallSprint, enrich, draft-email, book, script regen/edit | edit-plan, list-selector (activer secteur/ICP, créer liste), from-number picker, by-day view, sort | **dial/hang-up/voicemail-drop (WebRTC live), disposition en appel, acheter un numéro (money)** |
| **/sequences** (+wizard) | create sequence, add/update/delete step, enroll, pause/resume, launch | **CampaignWizard multi-étapes**, approve-all drafts, review queue (bulk-approve/edit/reject) | — |
| **/meetings/[id]** | update notes, send follow-up, prep, intel approve | édition inline des 4 sections de notes, share Slack, post-call confirm | **recorder micro in-browser, upload transcript (file picker)** |
| **/tasks** | create, complete, update priority | tabs/filtres/sort | — |
| **/knowledge** | create/update/delete entry | recherche | — |
| **/proposals** | draft from deal, fill, list | mapping de template (UI), regenerate composant, edit | **upload template .docx/.pptx, download PDF** |
| **/settings/*** | la plupart via update tools admin (ICP, workspace, stages, signals, objects, workflows, members…) | flows multi-champs des pages settings | **MFA enroll, change password (sensible — garder humain)** |

Lecture : la **colonne 1** se débloque surtout en **fiabilisant l'invocation** (corriger router/orchestrator, brancher les non-routés). La **colonne 2** est exactement ce que livre le **Page Action Registry** (§4). La **colonne 3** = oceans à flagger (média temps réel, capture micro, dialogues fichiers, actions sécurité) — pour la plupart, l'agent doit *préparer/naviguer/expliquer*, pas *exécuter* à la place de l'humain.

---

## 4. Architecture cible — la pièce manquante : le **Page Action Registry (PAR)**

### 4.1 Principe : inverser le modèle (déclaratif, pas 1-pour-1)
Chaque page **déclare** ses actions dans un registre client typé. Le chat obtient une surface **stable et petite** qui reflète dynamiquement la page courante. Parité par construction.

```ts
// hook posé par chaque page (scopé au montage)
useRegisterPageActions([
  {
    id: "accounts.applyFilter",
    title: "Filtrer la liste des comptes",
    description: "Applique des filtres colonne (industrie, taille, score, région…)",
    params: z.object({ industry: z.string().optional(), minScore: z.number().optional(), /* … */ }),
    run: async (p) => applyColumnFilters(p),   // réutilise le handler EXISTANT de la page
    mutating: false, reversible: true, confirm: "never",
  },
  {
    id: "opportunities.moveStage",
    title: "Déplacer un deal vers une étape",
    params: z.object({ dealId: z.string(), stage: z.string(), closeReason: z.string().optional() }),
    run: async (p) => moveCardToStage(p),
    mutating: true, reversible: true, confirm: "risky",   // gère le dialogue close-reason si Won/Lost
  },
  // … le dialer/recorder NE sont PAS déclarés exécutables → restent humains
]);
```

### 4.2 Flux complet
1. **Registre** : context/store global lu par le `ChatDock` (déjà monté partout). Au montage d'une page → ses actions s'enregistrent ; au démontage → se retirent.
2. **Découverte** : le dock sérialise la liste d'actions de la page courante dans le body du POST (à côté de `surface`). Nouvel outil serveur `listPageActions()` la renvoie au modèle (« voici ce que tu peux faire ici »).
3. **Invocation** : outil serveur `invokePageAction(actionId, params)` → valide params contre le schéma déclaré → renvoie une **nouvelle directive** `{ kind: "invokeAction", actionId, params }` (extension de l'union `UiDirective`).
4. **Exécution client** : `runUiDirective` gagne une branche → cherche le handler dans le registre → l'exécute **sur la page vivante** (l'utilisateur *voit* le filtre s'appliquer / la modale s'ouvrir / le deal bouger). Réutilise la logique testée de la page — zéro duplication.
5. **Boucle** : résultat (succès/erreur/résumé) ré-injecté en message synthétique (même pattern que l'approve des cartes) → l'agent chaîne.
6. **Off-web (Slack/MCP)** : pas de page montée → ces actions ne sont pas offertes ; les outils headless continuent. Dégradation propre.

### 4.3 Pourquoi PAR et **pas** du « computer-use » (screenshot+clic DOM)
- **C'est un lac, pas un océan** : ensemble fini, typé, testable, gatable par action. Le computer-use générique (Layer 2, à scruter) est fragile, lent, coûteux, difficile à approuver, et superflu quand **on possède l'app**. → rejeté explicitement.
- Réutilise les handlers existants → pas de dérive « ce que fait le bouton » vs « ce que fait l'agent ».
- Auditable : chaque invocation = event typé → alimente `tool_call_events`.

### 4.4 Modèle d'exécution à deux niveaux
- **Headless** (outils serveur existants) : données, masse, cross-entité, background, hors-page.
- **Actionné** (PAR) : flows natifs de la page, état d'UI, multi-étapes, sous les yeux de l'utilisateur.
- **Heuristique de routage** (dans le prompt) : si l'utilisateur est *sur* la page concernée et que l'action est le flow natif → actionner ; sinon → headless. Option « narrate + actuate » : un résultat headless peut naviguer + surligner la cible.

### 4.5 Plan de contrôle unifié (prérequis de sûreté)
- **Un seul vocabulaire d'approbation** : `agentApprovalMode` v2 comme SSOT, lu via `readApprovalMode()` **partout** (corrige le mort-câblage), consommé identiquement par outils chat + invocations PAR + boucles background. Mapper/déprécier `autonomyConfig.level` dessus.
- **Chaque action porte ses métadonnées** (`mutating`, `outbound`, `reversible`, `cost`, `confirm`). Une seule fonction décide : exécuter / carte-proposition / file batch / refuser, selon (mode × métadonnées × confiance × rôle).
- **Étendre `tool_call_events` à TOUT** (headless + PAR), et implémenter le **pattern « fenêtre d'undo »** pour le sortant : envoi programmé + délai annulable = unsend de facto.
- **Une matrice de permissions** partagée par middleware + capability-resolver + PAR.

### 4.6 UX confiance/visibilité
- Réutiliser+corriger les **cartes-proposition** ; les étendre aux actions PAR (prévisualiser params, éditer, approuver).
- Post-action : **surligner ce qui a changé** sur la page (naturel via le chemin actionné) + « Undo » inline.

---

## 5. Complétude (rubrique CLAUDE.md) & lacs vs océans

| Dimension | Score | Commentaire |
|---|---|---|
| Mutation headless (données) | **8/10** | Quasi tout le CRUD + actions existent. Trous : bridge custom-skills fantôme, quelques flows page-spécifiques. |
| Actionnement live de la page | **2/10** | Seulement navigate + composeEmail. Le gros trou. |
| Mécanisme de parité/découverte | **1/10** | Portage manuel ; maps dérivées ; pas de registre. |
| Approbation / undo | **5/10** | Fondation OK (audit log, undo, capture, viewer) mais garde-fou chat mort, 4 vocabulaires, guardrail orphelin, sortant non-undoable. |
| Autonomie / background | **6/10** | Boucles réelles actives ; niveau décoratif ; 1 enroll non-gardé. |

**Lacs (boilables, à faire) :** le Page Action Registry (fini par page), la réconciliation router/orchestrator↔158, le branchement des outils non-routés, le bridge custom-skills, le fix du mort-câblage d'approbation, la « fenêtre d'undo » pour le sortant.

**Océans (à flagger à Martin, pas à faire en passant) :**
- **Computer-use générique** (actionner n'importe quel DOM par vision) — rejeté au profit du PAR déclaratif.
- **Unifier les 4 vocabulaires autonomie/approbation** — touche beaucoup de machinerie background ; à étapiser.
- **Média temps réel piloté par l'agent** (dial WebRTC, recorder micro) — garder humain dans la boucle ; l'agent prépare, ne décroche pas.

---

## 6. Bugs & dérives à corriger (quick wins, indépendants du chantier principal)

**6.1 — Garde-fou d'approbation du chat mort-câblé (à confirmer puis corriger).**
`app/api/chat/route.ts:554-556` passe `tenantSettings.agentApprovalMode || "auto"` **brut** ; les outils create/system-prompt testent `=== "ask"` (littéral v1). Après migration WS-1, la valeur stockée serait v2 (`"review-each"`, défaut `tenant-settings.ts:455`) → la branche proposition est sautée → **createContact/Account/Deal mutent sans carte de validation**. Fix : lire via `readApprovalMode()` et brancher sur l'enum v2. *(Vérifier la valeur stockée réelle du tenant avant de toucher.)*

**6.2 — `enforceSendingIdentity` orphelin.**
`lib/guardrails/sending-identity.ts` (blocage cold-on-primary, cap quotidien primaire, routage scaling-path) importé par **0 chemin d'envoi**. L'UID Settings→Guardrails/Sending laisse le configurer et le persiste, mais rien ne le lit à l'envoi. Soit le brancher aux 5 chokepoints, soit retirer la promesse de l'UI.

**6.3 — Maps de routage dérivées.**
`tool-router.ts` & `orchestrator.ts` : commentaire « 126 » faux (réel **158**) ; 3 outils fantômes `runCustomSkill`/`listCustomSkills`/`forkSkill` (référencés, inexistants) ; ~38 outils non-mappés qui passent par fail-open à chaque tour. Décision : (a) construire le bridge custom-skills, ou (b) purger les fantômes ; et router explicitement les outils d'analyse non-routés (`getBuyerIntentScore`, `getDealsAtRisk`, `getWinLossAnalysis`, `mapDealStakeholders`, `getRevenueForcast` *(sic, typo dans le nom)*, `buildCompanyDossier`, workflow.*).

**6.4 — `signalAutoEnroll` sans approbation.**
`inngest/signal-to-sequence.ts` enrôle jusqu'à 5 contacts + crée un deal sans check. À router via le plan de contrôle unifié avant d'activer des séquences en prod.

**6.5 — Incohérences guardrails sortant** : opt-out non vérifié sur le cron SMTP et la route meeting-follow-up ; fenêtres horaires en UTC et non TZ tenant ; pas de DNC/quiet-hours/cap sur les appels.

---

## 7. Roadmap proposée (étapée, chaque étape livrable seule)

- **Phase 0 — Correctness (jours).** Fixer 6.1 (mort-câblage approbation), 6.3 (réconcilier maps + brancher non-routés + décider du bridge custom-skills), documenter le vrai compte (158). Aucun risque, gain immédiat de fiabilité.
- **Phase 1 — Le bus d'action (1-2 sem).** PAR + directive `invokeAction` + outils `listPageActions`/`invokePageAction` + enregistrer les actions des 4 pages les plus riches (accounts liste, opportunities, contacts liste, call-mode hors-dial). Chaque action déclare `confirm`/`reversible`. → débloque « (presque) tout faire » sur ces pages.
- **Phase 2 — Plan de contrôle unifié.** Collapse des vocabulaires d'approbation, extension audit+undo au sortant + PAR, « fenêtre d'undo » (envoi programmé annulable), matrice de permissions partagée.
- **Phase 3 — Sweep de parité + polish.** Enregistrer les actions des pages restantes ; mode « narrate+actuate » ; surlignage post-action ; dégradation off-web.
- **Phase 4 — Autonomie.** Fermer 6.4 ; faire en sorte que `autonomyConfig.level` pilote *réellement* le comportement via le plan unifié ; seuils de confiance appris.

---

## Fichiers-clés (pour reprise)
- Outils : `lib/chat/tools/*` + `index.ts` (`buildAllChatTools`) ; `lib/chat/tool-router.ts` ; `lib/agents/orchestrator.ts` ; `lib/agents/capability-resolver.ts` ; `app/api/chat/route.ts:602-638`.
- Commande client : `lib/chat/ui-directives.ts` (SSOT directives) ; `components/chat/use-ui-directives.ts` (exécuteur) ; `lib/chat/tools/navigation.ts`+`calls.ts` (émetteurs) ; `components/chat/chat-dock.tsx` + `app/(dashboard)/chat/page.tsx` ; `app/(dashboard)/layout.tsx:117` (mount) ; `lib/chat/surface-from-path.ts` ; `components/chat/chat-action-cards.tsx`+`action-card.tsx` ; `components/email-composer-panel.tsx`.
- Rails : `lib/chat/tool-call-log.ts` ; `lib/chat/tools/undo.ts` ; `lib/guardrails/approval-mode.ts` ; `lib/guardrails/sending-identity.ts` (orphelin) ; `lib/capture/approval.ts` ; `app/api/settings/autonomy/route.ts` ; `db/schema/intelligence.ts:84` ; `inngest/{agent-reactor,agent-action-dispatcher,autonomous-pipeline,signal-to-sequence}.ts` ; `lib/emails/recipient-guardrail.ts` ; `middleware.ts:147-163` ; `lib/auth/{viewer-guard,permissions,auth-utils}.ts`.
