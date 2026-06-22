# P1-15 — Outbound Cockpit ("Outbound du jour" unifié)

## Note importante (vérité du code post-P0)

Audit live le 2026-06-22 sur `feat/call-mode-ui-harmony`. Chaque claim est ancré file:line.

### Ce qui EXISTE déjà (ne pas re-spécifier)

- **Paradigme cockpit "mode" 3 colonnes** : `app/apps/web/src/app/(dashboard)/call-mode/page.tsx`.
  - Queue priorisée + filtre by-day + tri client (`page.tsx:299-336`, `sortQueueItems` via `lib/voice/queue-sort`).
  - Auto-advance après disposition : `handleDisposition` retire le contact de la file et sélectionne le suivant (`page.tsx:892-897`).
  - SSE temps réel : `/api/calls/[id]/events` (`src/app/api/calls/[id]/events/route.ts:26`, `text/event-stream`, `force-dynamic`).
  - `ResizeHandle` (dividers redimensionnables, largeurs persistées localStorage) : **fonction LOCALE** dans `page.tsx:224-270` — **PAS un composant partagé**.
  - PageActions enregistrées via `useRegisterPageActions` (`page.tsx`, registry `src/lib/chat/page-actions/registry.ts:56`).
- **File canonique d'approbation des drafts** : `app/apps/web/src/app/(dashboard)/sequences/review/page.tsx`.
  - `approveDraft` / `rejectDraft` / `bulkApproveDrafts` extraits comme **network bodies réutilisables** (`review/page.tsx:168-263`).
  - Polling 30 s sur l'onglet `pending_approval` (`review/page.tsx:33,119-123`).
  - PageActions `sequences.reviewBulkApprove|reviewApprove|reviewReject|reviewEdit` (`review/page.tsx:315-394`).
  - Liste : `GET /api/sequences/drafts` (`src/app/api/sequences/drafts/route.ts:32`), tri `desc(generatedAt)`, curseur sur `generatedAt`.
- **Raccourcis clavier j/k/a/r-style** : `inbox/page.tsx:823-878` (j/k navigation, e=done, x=select, r=reply, s=snooze, b=book, l=label) + cheatsheet via `registerShortcut` (`src/lib/hotkey-registry.ts:23`, `src/lib/inbox/inbox-shortcuts.ts:14`).
- **Score qualité P0-3** : `gradeSequenceQuality` (`src/lib/evals/sequence-quality.ts:34,56`) ; `sequence-generator.ts` attache `qualityScore { composite, dimensions }` **en mémoire** sur la séquence générée (`src/lib/agents/sequence-generator.ts:56,104-118`).
- **Colonne citations sur le draft** : `sequenceDrafts.personalizationSources` jsonb au shape AI-UI `{ kind, label, href, quote? }` existe (`src/db/schema/outbound.ts:146-152`).
- **Primitives citations P1-11** : `src/components/ai-ui/cited-claim.tsx`, `source-link.tsx`, `confidence-state.tsx` (`ai-ui/index.ts`).
- **Sources de la file unifiée** :
  - Drafts à approuver → `sequenceDrafts` status `pending_approval` (`outbound.ts:120-194`).
  - Réponses inbox à traiter → `outboundEmails.repliedAt IS NOT NULL` (`src/app/api/inbox/route.ts:62-63`).
  - Rappels → `tasks` (`src/db/schema/core.ts:332-355`, `dueDate`, `status='pending'`).

### Le GAP réel

1. **L'outbound est éclaté** en `/sequences/review` ⇄ `/inbox` ⇄ tâches : aucun cockpit unifié "Outbound du jour".
2. **`qualityScore` n'est JAMAIS persisté sur la ligne draft** : `sequenceDrafts` n'a **aucune** colonne `qualityScore` (`outbound.ts:128-194`) ; le score vit seulement en mémoire dans `sequence-generator.ts:116`. `GET /api/sequences/drafts` ne le retourne donc pas (`route.ts:83-101`). **Le tri "drafts triés par qualityScore" demandé est IMPOSSIBLE en l'état → [NEW].**
3. **Les citations ne sont jamais peuplées** : `sequence-draft-router.ts:263` insère `personalizationSources: []` en dur. Le pane "Why this draft" n'a donc rien à citer → dépend de P1-11 pour le rendu mais surtout d'un **backfill de génération** → [NEW] / OCEAN partiel.
4. **`ResizeHandle` est privé à call-mode** → doit être extrait pour être réutilisé sans dupliquer.

### Tags

- `[NEW]` Cockpit `/outbound-mode`, endpoint queue unifiée, colonne `qualityScore` + exposition, extraction `ResizeHandle`, extraction des network bodies de review.
- `[DONE]` approve/reject/edit/bulk, PageActions review, SSE, paradigme 3-col, primitives citations, `gradeSequenceQuality`.
- `[OCEAN — à flaguer]` Génération qui calcule **et** persiste qualityScore + vraies citations sur CHAQUE draft du draft-router (réécrit le pipeline de personnalisation). MVP = score/citations sur les nouveaux drafts uniquement + backfill best-effort ; rétro-génération full = hors MVP.
- `[LOCKED]` Drizzle + Postgres, Inngest, AI SDK v6, modèles Claude, no-emoji, tenant-scoping.

## Scope

Cockpit `/outbound-mode` calqué sur `/call-mode` : une **file unique du jour** (drafts à approuver, réponses inbox à traiter, rappels dus), un pane central "Why this draft" avec citations, un rail droit account/brief, auto-advance après approve/reject, raccourcis j/k/a/r. Réutilise les network bodies de `/sequences/review`, `ResizeHandle`, le pattern SSE/polling, les PageActions. `/sequences/review` reste la file canonique sous-jacente (mêmes endpoints) pour éviter le drift.

## Exigences (EARS)

### R1 — Cockpit & layout

- **R1.1** THE SYSTEM SHALL exposer une route `/outbound-mode` (`src/app/(dashboard)/outbound-mode/page.tsx`) rendant un cockpit 3 colonnes : file gauche, pane central "Why this draft", rail droit account/brief, calqué sur `call-mode/page.tsx`.
- **R1.2** THE SYSTEM SHALL réutiliser un composant `ResizeHandle` partagé (extrait de `call-mode/page.tsx:224-270`) pour les dividers, avec largeurs persistées en localStorage sous une clé `elevay.outboundmode.colWidths`.
- **R1.3** WHILE le cockpit est monté, THE SYSTEM SHALL enregistrer ses PageActions via `useRegisterPageActions` (`registry.ts:56`) et SHALL réutiliser les network bodies `approveDraft`/`rejectDraft`/`bulkApproveDrafts` extraits de `review/page.tsx:168-263` (aucune duplication de logique réseau).
- **R1.4** THE SYSTEM SHALL NOT introduire de nouveau chemin d'approbation : tout approve/reject/edit/bulk passe par les endpoints existants `/api/sequences/drafts/*`.

### R2 — File unifiée du jour

- **R2.1** THE SYSTEM SHALL exposer `GET /api/outbound/queue` retournant une file unique d'items hétérogènes de trois `kind` : `draft` (drafts `pending_approval`), `reply` (réponses inbox non traitées), `reminder` (`tasks` dues), tous tenant-scopés à `authCtx.tenantId`.
- **R2.2** THE SYSTEM SHALL trier la file par un score de priorité composite = (pour `draft`) `qualityScore` + fraîcheur du signal, (pour `reply`) ancienneté de la réponse, (pour `reminder`) proximité de `dueDate`, de sorte que les items les plus actionnables remontent en tête.
- **R2.3** WHERE un draft n'a pas de `qualityScore` persisté (drafts antérieurs au backfill), THE SYSTEM SHALL le traiter comme score neutre (valeur sentinelle documentée, ex. `0.5`) sans planter le tri.
- **R2.4** THE SYSTEM SHALL paginer la file par curseur (réutilise le pattern `desc(generatedAt)` + curseur de `drafts/route.ts:60-80`) et SHALL plafonner `limit` à 200.
- **R2.5** WHEN la file est vide, THE SYSTEM SHALL rendre un `EmptyState` "Rien à traiter aujourd'hui" (pas d'erreur).

### R3 — qualityScore persisté & exposé

- **R3.1** THE SYSTEM SHALL ajouter une colonne `qualityScore real` (nullable) à `sequenceDrafts` (`outbound.ts:128`) avec un index `sequence_drafts_quality_idx` sur `(tenantId, status, qualityScore)`.
- **R3.2** WHEN le draft-router personnalise et insère un draft (`sequence-draft-router.ts:207-272`), THE SYSTEM SHALL calculer `gradeSequenceQuality` (ou `gradeGeneratedStep`, `sequence-quality.ts:34`) sur le contenu généré et persister `qualityScore = result.score` sur la ligne.
- **R3.3** IF le calcul du score échoue ou time-out (réutilise `with-timeout`), THEN THE SYSTEM SHALL persister `qualityScore = null` et continuer l'insertion (fail-open, le draft ne doit jamais être bloqué par le scoring).
- **R3.4** THE SYSTEM SHALL exposer `qualityScore` dans `GET /api/sequences/drafts` (`route.ts:83-101`) et `GET /api/outbound/queue`.

### R4 — Citations "Why this draft"

- **R4.1** WHEN le draft-router personnalise un draft, THE SYSTEM SHALL peupler `personalizationSources` (`outbound.ts:146-152`) avec les vraies citations issues du `ResearchBriefContext` (`lib/context/prospect-context.ts`) au shape AI-UI `{ kind, label, href, quote? }`, remplaçant le `[]` codé en dur de `sequence-draft-router.ts:263`.
- **R4.2** THE SYSTEM SHALL rendre, dans le pane central, chaque citation via les primitives P1-11 (`CitedClaim`/`SourceLink`, `ai-ui/index.ts`) plus `triggerReason` (`outbound.ts:142-145`) comme en-tête "Why this draft".
- **R4.3** WHERE un draft n'a aucune citation (`personalizationSources = []`), THE SYSTEM SHALL afficher `triggerReason` seul sans bloc citations vide.

### R5 — Auto-advance & raccourcis

- **R5.1** WHEN le founder approuve OU rejette l'item central, THE SYSTEM SHALL retirer l'item de la file et sélectionner l'item suivant (même logique que `handleDisposition`, `call-mode/page.tsx:892-897`), sans rechargement complet.
- **R5.2** THE SYSTEM SHALL câbler les raccourcis `j`/`k` (naviguer), `a` (approve/agir sur l'item), `r` (reject) via un listener `keydown` (modelé sur `inbox/page.tsx:823-878`), inactifs quand le focus est dans un champ texte.
- **R5.3** THE SYSTEM SHALL enregistrer ces raccourcis dans la cheatsheet `?` via `registerShortcut` (`hotkey-registry.ts:23`) sous un groupe "Outbound".
- **R5.4** WHILE l'item central est de `kind=reply`, THE SYSTEM SHALL mapper `a` sur l'ouverture/déclenchement de réponse et `r` sur "marquer traité" (pas approve/reject de draft).

### R6 — Mise à jour temps réel

- **R6.1** WHILE le cockpit est monté, THE SYSTEM SHALL rafraîchir la file par polling 30 s (réutilise la constante/pattern `review/page.tsx:33,119-123`) afin que les nouveaux drafts/réponses remontent sans refresh manuel.
- **R6.2** THE SYSTEM SHALL NOT ouvrir de nouvelle connexion SSE dédiée à la file en MVP (le polling suffit) ; le pattern SSE de call-mode reste disponible pour une extension live ultérieure (flaggé hors MVP).

## Critères d'acceptation (GIVEN/WHEN/THEN)

- **AC1** GIVEN un tenant avec 2 drafts `pending_approval`, 1 réponse inbox, 1 rappel dû, WHEN j'ouvre `/outbound-mode`, THEN la file affiche 4 items triés par priorité et le premier est auto-sélectionné. *(network bodies approve/reject DEJA IMPLEMENTES dans `review/page.tsx:168-263`)*
- **AC2** GIVEN deux drafts de `qualityScore` 0.9 et 0.4, WHEN la file charge, THEN le draft 0.9 précède le draft 0.4.
- **AC3** GIVEN l'item central est un draft, WHEN je presse `a`, THEN il est approuvé via `POST /api/sequences/drafts/[id]/approve` *(DEJA IMPLEMENTE dans `review/page.tsx:211-231`)* et la file auto-advance.
- **AC4** GIVEN l'item central est un draft, WHEN je presse `r`, THEN le modal de raison s'ouvre puis `POST .../reject` *(DEJA IMPLEMENTE dans `review/page.tsx:236-263`)* et auto-advance.
- **AC5** GIVEN un draft fraîchement généré par le draft-router, WHEN j'inspecte sa ligne DB, THEN `qualityScore` est non-null et `personalizationSources` contient ≥1 citation au shape `{ kind, label, href }`.
- **AC6** GIVEN un draft généré AVANT le backfill (qualityScore null), WHEN la file charge, THEN il apparaît avec un score neutre et le tri ne plante pas.
- **AC7** GIVEN le pane central d'un draft cité, WHEN il rend, THEN chaque source s'affiche via `CitedClaim`/`SourceLink` (P1-11) sous `triggerReason`.
- **AC8** GIVEN un tenant B, WHEN il appelle `GET /api/outbound/queue`, THEN aucun item du tenant A n'apparaît (tenant-scoping).
- **AC9** GIVEN une file vide, WHEN j'ouvre `/outbound-mode`, THEN un EmptyState s'affiche, aucune erreur console.
- **AC10** GIVEN je redimensionne une colonne, WHEN je recharge, THEN la largeur est restaurée depuis localStorage.

## Edge cases exhaustifs

1. Draft approuvé concurremment (version mismatch) → l'API renvoie 409, la file retire l'item et toast "refresh and retry" *(géré par optimistic-lock `outbound.ts:171-175` + `review/page.tsx:182-192`)*.
2. `qualityScore` calcul échoue/time-out → persist null, draft inséré quand même (R3.3).
3. Citation provider renvoie un brief vide → `personalizationSources=[]`, pane affiche `triggerReason` seul (R4.3).
4. File mixte où l'item suivant après advance est d'un `kind` différent → le mapping a/r se ré-évalue selon `kind` (R5.4).
5. Rappel `tasks` sans `dueDate` → exclu de la file (ne peut pas être priorisé).
6. Réponse inbox d'un email `bounced`/`failed` → exclue (cf. filtre `inbox/route.ts:63`).
7. Curseur invalide → 400 (réutilise `route.ts:62-63`).
8. localStorage indisponible (SSR / privé) → fallback largeurs par défaut sans throw (cf. `call-mode/page.tsx:327-336`).
9. Raccourci pressé avec focus dans le textarea d'édition → no-op (guard champ texte).
10. Deux sessions parallèles approuvent le même draft → la 2e reçoit 409, retire proprement.
11. File de >200 items → pagination curseur, pas de chargement infini.
12. Draft dont l'enrollment a été supprimé entre génération et affichage → l'approve échoue côté API, item retiré avec toast.
13. `m`/mailbox quick-switch de l'inbox NE doit PAS fuiter dans outbound-mode (ne pas copier ce handler).
14. Item `reply` sans `contactId` résolvable → rail droit affiche un état dégradé, pas de crash.

## Hors scope

- Réécriture complète du pipeline de personnalisation pour rétro-générer score+citations sur TOUS les drafts historiques (OCEAN — backfill best-effort seulement, nouveaux drafts garantis).
- Connexion SSE dédiée à la file (R6.2) — polling 30 s en MVP.
- Persistance per-list du tri (`call_lists.sort`) — déjà notée extension dans call-mode.
- Composition d'une réponse inbox riche (l'item `reply` ouvre l'inbox/le pane existant, ne ré-implémente pas l'éditeur).
- Modes voix/email mixtes dans un seul cockpit (outbound-mode = email/async ; call-mode reste séparé).
EOF