# Initiative — Chat Live Executor (CLE)

> Faire du chat un **véritable exécuteur de tâches** capable d'agir **en live sur chaque page** — « tout faire sur chaque page sur demande ».
> Audit fondateur : `_research/chat-task-executor-audit-2026-06-16.md`.

Ce document est la **constitution** de l'initiative. Toutes les specs `CLE-NN` **citent et respectent** les contrats figés ci-dessous. Une spec ne peut PAS redéfinir un contrat ; si elle a besoin de le changer, elle ouvre un `spec-issues.md` et on amende ce README d'abord.

---

## 1. Doctrine (les 4 principes non-négociables)

1. **Parité par construction, pas portage 1-pour-1.** On a déjà 158 outils serveur et toujours des trous. On arrête d'écrire un outil par action. Chaque **page déclare** ses actions dans un registre typé ; le chat obtient une surface stable qui reflète **dynamiquement** la page courante.
2. **Deux niveaux d'exécution.** *Headless* (outils serveur, pour données/masse/background/hors-page) **+** *Actionné* (Page Action Registry, pour les flows natifs de la page, sous les yeux de l'utilisateur). Le modèle choisit selon une heuristique figée (§3.6).
3. **Déclaratif, pas computer-use.** On NE fait PAS de pilotage DOM par vision (screenshot+clic) — fragile, lent, ingatable, océan. On expose un registre fini, typé, testable. Chaque action réutilise le **handler existant** de la page (zéro duplication de logique).
4. **Un seul plan de contrôle.** Aujourd'hui 4 vocabulaires approbation/autonomie déconnectés. Toute action (headless OU actionnée) passe par **une** fonction de décision (`decideAction`) et **un** journal/undo (`tool_call_events`).

---

## 2. Périmètre & non-périmètre

**Dans le périmètre** : registre d'actions de page + directive `invokeAction` + outils `listPageActions`/`invokePageAction` + UX confirmation/preview + enregistrement des actions sur les pages riches + unification du plan de contrôle (approbation/permissions/undo) + correctifs des 4 bugs de l'audit.

**Hors périmètre (océans / human-bound, à NE PAS rendre exécutables par l'agent)** :
- Média temps réel piloté par l'agent : décrocher/raccrocher un appel WebRTC, drop voicemail, disposition *pendant* l'appel, capture micro du recorder. L'agent **prépare et navigue**, l'humain exécute.
- Dialogues fichiers natifs navigateur (upload CSV/transcript/template `.docx`) — l'agent peut ouvrir le flow, pas choisir le fichier.
- Actions de sécurité (changer mot de passe, enrôler MFA) — restent strictement humaines.
- Computer-use générique (rejeté, cf. doctrine 3).

---

## 3. Contrats figés (SSOT — citer verbatim dans les specs)

### 3.1 Extension de l'union de directives — `lib/chat/ui-directives.ts`
On ajoute **un** `kind`. On NE touche pas aux deux existants.

```ts
export type UiDirective =
  | { kind: "navigate"; path: string; label?: string; highlight?: HighlightAnchor }  // existant (+highlight: amendement CLE-15)
  | { kind: "composeEmail"; draft: ComposeEmailDraft }                     // existant
  | {                                                                       // NOUVEAU (CLE-03)
      kind: "invokeAction";
      invocationId: string;        // uuid — corrèle requête ↔ résultat
      actionId: string;            // ex. "opportunities.moveStage"
      params: Record<string, unknown>;
      requireConfirm: boolean;     // calculé serveur via decideAction (§3.5)
    };
// HighlightAnchor (amendement CLE-15) = { kind: "entity"; entityType: string; id: string }
//   Champ OPTIONNEL sur l'arm `navigate`. Absent => comportement actuel inchangé.
//   La page enregistre un locator (id -> noeud DOM) ; les clients off-web l'ignorent.
```

### 3.2 Descripteur d'action de page (type client) — `lib/chat/page-actions/types.ts` (CLE-03)
```ts
export interface PageAction<P = unknown> {
  id: string;                         // namespacé par page : "<surface>.<verb>" (kebab/camel libre après le point)
  title: string;                      // libellé humain (FR/EN selon locale UI)
  description: string;                // destiné au LLM — quand/pourquoi l'utiliser
  params: z.ZodType<P>;               // validé CÔTÉ CLIENT (run) ET CÔTÉ SERVEUR (manifest)
  run: (params: P) => Promise<PageActionResult>;  // réutilise le handler EXISTANT de la page
  mutating: boolean;                  // change-t-il un état persistant ?
  outbound?: boolean;                 // déclenche un envoi externe (mail, call, invite)
  reversible?: boolean;               // un undo programmatique est-il possible ?
  cost?: "free" | "credits" | "money";
  confirm: "never" | "risky" | "always";  // politique de confirmation par défaut (cf. §3.5)
  surfaces?: string[];                // optionnel : restreindre à certaines surfaces
}

export interface PageActionResult {
  ok: boolean;
  summary: string;                    // 1 phrase, ré-injectée vers le LLM
  data?: unknown;                     // payload structuré optionnel
  error?: string;
  undo?: (() => Promise<void>) | UndoDescriptor;  // closure (client vivant) OU descripteur serialisable (amendement CLE-11)
}
// UndoDescriptor (amendement CLE-11) = { kind: "reinvoke"; actionId: string; params: Record<string,unknown> }
//                                     | { kind: "server"; snapshot: unknown }
//   SEULS les descripteurs sont persistes dans tool_call_events (une closure ne survit pas au demontage de la page).
```

### 3.3 API du registre (client) — `lib/chat/page-actions/registry.ts` (CLE-03)
```ts
// Hook posé par chaque page ; enregistre au montage, retire au démontage.
export function useRegisterPageActions(actions: PageAction[]): void;

// Lu par le ChatDock (déjà monté globalement, layout.tsx:117) :
export function getActionManifest(): PageActionManifest;   // sérialisable, sans les fns
export function runRegisteredAction(actionId: string, params: unknown): Promise<PageActionResult>;

export interface PageActionManifestEntry {
  id: string; title: string; description: string;
  paramsJsonSchema: object;           // zod → JSON Schema (serialisation déterministe)
  mutating: boolean; outbound: boolean; reversible: boolean;
  cost: "free" | "credits" | "money"; confirm: "never" | "risky" | "always";
}
export type PageActionManifest = PageActionManifestEntry[];
```
Le manifest (sans les fonctions `run`) est envoyé dans le **body du POST `/api/chat`**, à côté de `surface` (le ChatDock le lit via `getActionManifest()` au moment de l'envoi, comme `surfaceRef`).

### 3.4 Outils serveur — `lib/chat/tools/page-actions.ts` (CLE-04)
```
listPageActions()                       // READ — renvoie le manifest de la page courante (passé dans le body) au modèle.
invokePageAction(actionId, params)      // valide params contre paramsJsonSchema du manifest ; passe par decideAction (§3.5) ;
                                        // renvoie { ...invokeActionDirective(invocationId, actionId, params, requireConfirm) }.
```
`invokePageAction` ne mute jamais lui-même : il **émet une directive**. L'exécution réelle a lieu côté client via `runRegisteredAction`.

### 3.5 Canal de résultat (round-trip) — figé au niveau de l'**enveloppe**, transport délégué à CLE-03
Le résultat de l'action revient au LLM corrélé par `invocationId`. **Enveloppe figée** (les specs CLE-04..09 ne dépendent que de ça) :
```
{ invocationId: string; ok: boolean; summary: string; data?: unknown; error?: string }
```
**Transport v1 (défaut imposé)** : le client, après `runRegisteredAction`, ré-injecte un message structuré via le mécanisme existant des cartes (`chat.sendMessage`/équivalent) sous la forme d'un envelope JSON balisé `[[action-result]]…[[/action-result]]` que le system-prompt sait lire. **Transport v2 (évolution notée, hors v1)** : `addToolResult` natif AI SDK v6 (client-tool). CLE-03 tranche au niveau code et documente ; en cas de blocage v6, le défaut v1 s'applique.

### 3.5bis Fonction de décision unique — `lib/guardrails/decide-action.ts` (CLE-10)
```ts
export function decideAction(input: {
  action: { mutating: boolean; outbound?: boolean; reversible?: boolean; cost?: "free"|"credits"|"money"; confirm: "never"|"risky"|"always" };
  approvalMode: ApprovalModeV2;          // SSOT via readApprovalMode()
  role: "admin" | "member" | "viewer";
  confidence?: number;
}, extra?: { actionKey?: string; learnedThresholds?: Record<string, number> }   // 2e arg OPTIONNEL, additif (amendement CLE-10/CLE-16) : n'altere pas la decision de base
): { disposition: "execute" | "confirm" | "queue" | "refuse"; reason: string };
```
Consommée **identiquement** par : (a) les outils chat create/update (CLE-00/CLE-10), (b) `invokePageAction` (CLE-04), (c) les boucles background (CLE-10/CLE-16). C'est la seule autorité.

### 3.6 Heuristique de routage à deux niveaux (addendum de system-prompt — CLE-04)
- L'utilisateur est **sur** la surface concernée ET l'action est le flow natif de cette page → **action de page** (`invokePageAction`).
- Opération de **masse / multi-entité / hors-page / background** → **outil headless**.
- Action **mutante/outbound** : ne jamais exécuter sans la disposition de `decideAction` (`execute` direct ; `confirm` → carte ; `queue`/`refuse` → expliquer).
- Off-web (Slack/MCP) : pas de manifest → les actions de page ne sont pas offertes ; headless seulement (dégradation propre).

### 3.7 Structure & nommage
- Une feature = un dossier `_specs/CLE-NN-shortname/` avec `requirements.md` (user story + EARS GIVEN/WHEN/THEN + edge cases + evaluation steps), `design.md` (system fit, data model, API contracts, data flow, failure handling, security), `tasks.md` (étapes ordonnées, chacune avec *verify step* + *test à écrire*).
- Branche : `feat/CLE-NN-shortname`. Merge sur main seulement sur PASS (eval Phase 6). Trailer commit `Co-Authored-By: Rippletide <admin@rippletide.com>`.
- Tests : 100% des nouvelles branches logiques ; tout bug → test de régression. `tsc` 0 erreur.

### 3.8 Amendements ratifiés (issus de la rédaction des specs — le SSOT reste ce README)
Trois ajouts **additifs et rétro-compatibles** (rien de cassé si un champ est absent) ont été ratifiés pendant l'écriture des specs et intégrés ci-dessus :
1. **§3.1 — `navigate.highlight?`** (CLE-15) : champ optionnel `HighlightAnchor` sur l'arm `navigate` pour surligner la cible après actionnement. Absent ⇒ comportement actuel.
2. **§3.2 — `PageActionResult.undo` accepte un `UndoDescriptor` sérialisable** (CLE-11) : une closure ne survit pas au démontage de la page ; seuls les descripteurs (`reinvoke`/`server`) sont persistés dans `tool_call_events`.
3. **§3.5bis — `decideAction(input, extra?)`** (CLE-10/CLE-16) : 2e argument optionnel `{ actionKey?, learnedThresholds? }` pour l'apprentissage de seuils ; n'altère pas la décision de base et le 1er argument reste figé.

Toute future modification de contrat suit la même règle : `spec-issues.md` → amender ce README → puis le code.

---

## 4. Carte des features (voir `feature_list.json` pour le détail machine)

| ID | Phase | Titre | Dépend de | Milestone |
|----|-------|-------|-----------|-----------|
| CLE-00 | 0 | Réparer le garde-fou d'approbation mort-câblé | — | M0 |
| CLE-01 | 0 | Réconcilier maps tool-router/orchestrator ↔ 158 outils (+ drift-guard) | — | M0 |
| CLE-02 | 0 | Bridge custom-skills → chat (ou retrait formel) | CLE-01 | M0 |
| CLE-03 | 1 | **PAR core** : directive `invokeAction` + registre + hook + dispatch + round-trip | — | M1 |
| CLE-04 | 1 | Outils serveur `listPageActions`/`invokePageAction` + plumbing + heuristique prompt | CLE-03 | M1 |
| CLE-05 | 1 | UX confirmation/preview/edit-params des actions (réutilise+corrige proposal-card) | CLE-03, CLE-04 | M1 |
| CLE-06 | 1 | Enregistrer les actions de `/opportunities` (page pilote) | CLE-04, CLE-05 | M1 |
| CLE-07 | 1 | Enregistrer les actions de `/accounts` | CLE-04, CLE-05 | M1 |
| CLE-08 | 1 | Enregistrer les actions de `/contacts` | CLE-04, CLE-05 | M1 |
| CLE-09 | 1 | Enregistrer les actions de `/call-mode` (hors dial/recorder) | CLE-04, CLE-05 | M1 |
| CLE-10 | 2 | Plan de contrôle unifié : `decideAction` + collapse des 4 vocabulaires | CLE-00, CLE-04 | M2 |
| CLE-11 | 2 | Étendre audit `tool_call_events` + undo aux actions PAR + outbound (fenêtre d'undo) | CLE-04, CLE-10 | M2 |
| CLE-12 | 2 | Matrice de permissions unique (middleware + capability-resolver + PAR) | CLE-04, CLE-10 | M2 |
| CLE-13 | 2 | Durcissement guardrails sortant (enforceSendingIdentity, signalAutoEnroll, opt-out/fenêtres) | CLE-10 | M2 |
| CLE-14 | 3 | Sweep de parité : enregistrer les pages restantes (inbox, meetings, sequences, tasks, knowledge, proposals, home, settings) | CLE-06..09 | M3 |
| CLE-15 | 3 | Visibilité de l'actionnement : narrate+actuate + surlignage post-action + dégradation off-web | CLE-04 | M3 |
| CLE-16 | 4 | Câbler réellement le niveau d'autonomie via le plan unifié + seuils appris | CLE-10, CLE-11 | M4 |

Milestones (checkpoint = STOP pour revue Martin, APRÈS build+eval) :
- **M0** après CLE-02 — base de correctness. `checkpoint: true`.
- **M1** après CLE-09 — PAR live sur 4 pages. `checkpoint: true`.
- **M2** après CLE-13 — plan de contrôle unifié. `checkpoint: true`.
- **M3** après CLE-15 — parité étendue.
- **M4** après CLE-16 — autonomie réelle.

---

## 5. Protocole d'exécution (une spec à la fois)
1. `/next` lit la prochaine feature non-bloquée (deps satisfaites) dans `feature_list.json`.
2. Office hours (si majeure) → relire la spec → branche `feat/CLE-NN-...` → tasks dans l'ordre (code → test → verify → commit).
3. Critères d'acceptation + `regression.sh` → Phase 6 eval hostile → PASS = merge main, FAIL = delete branch + respec.
4. Après chaque PASS : mettre à jour ce README si un contrat a dû bouger (sinon il est figé).

---

## 6. Glossaire
- **PAR** : Page Action Registry — le registre client des actions déclarées par chaque page.
- **Headless** : action exécutée serveur (API/DB) sans actionner l'UI visible.
- **Actionné** : action exécutée en pilotant l'UI réelle de la page courante.
- **decideAction** : la fonction de décision unique (execute/confirm/queue/refuse).
- **invocationId** : uuid corrélant une `invokeAction` à son résultat.
