# Baseline statique — synthèse (avant walk live)

Source : `_audit/code-analysis/{crm,engage,activity-home,ai-chat,entry-funnel,settings}.md` (6 clusters, lecture de code, 2026-06-05).
Statut : ce qcue le **code prétend** faire. À confirmer/réfuter au walk live sur prod.

## Méta-findings (transverses, confirmés sur ≥3 clusters)

**A. Le produit est un archipel relié en DB, pas dans l'UI.**
Partout les clés de liaison sont stockées et souvent déjà fetchées — `companyId`, `contactId`, `dealId`, `threadId`, `sourceActivityId`, `entityType/entityId` — mais **l'UI ne rend pas l'arête**. Exemples : nom de compte → ouvre un slide-over et non la fiche (crm) ; Opportunity n'a pas `companyId` dans son type → lien vers compte impossible (crm) ; Notes/Tasks stockent `entityType/entityId` mais affichent du texte (activity) ; sequence reply a `contactId/threadId` mais zéro lien vers l'inbox (engage). **C'est LE défaut de fluidité dominant, et il est systémique, pas par-page.**

**B. Le « dernier mètre vers l'action » manque systématiquement.**
Les surfaces de lecture (Insights pilae/playbook/hot-to-call, Deliverability, Account Brain, widgets Home) affichent de l'intelligence mais ne passent pas la main à la surface d'exécution. hot-to-call n'ouvre pas `/call-mode` (juste un toast) ; les recos deliverability sont du texte ; le Brain est un cul-de-sac pur ; les cartes Home « today's meetings/tasks » n'ont aucun handler.

**C. La boucle de capture d'outcome est ouverte.**
Fin d'appel → **aucune UI** pour noter le résultat / créer une tâche / avancer un deal (tout est async via Inngest). Meeting « Confirm & update CRM » → tâches créées **silencieusement**, pas de back-link. La boucle « agir → enregistrer → next step » qu'exige un moteur GTM n'est pas fermée dans l'UI.

**D. L'onboarding collecte sans consommateur (viole le principe maison).**
Phase 1 ICP écrite dans `onboarding_progress.phase_data` mais **jamais copiée** dans `tenants.settings` que lit le build TAM → TAM vide si l'utilisateur ne repasse pas par `/settings/icp`. `antiIcp` et `voiceSamples` = champs morts. **Trois** stores ICP disjoints (wizard / `tenants.settings` / tables `icps`).

**E. Gouvernance partiellement inerte.**
`agentApprovalMode` marche mais ne gate que 4 outils de création, pas les updates. Plays CRUD mais non injectés dans l'agent. Autonomy + LLM-Evals hors nav (URL-only). LLM Budget sans `adminOnlyOrRedirect()` côté serveur. `defaultDataVisibility` stocké mais non appliqué aux requêtes.

**F. Le chat est l'exception qui révèle le problème.**
`/chat` câble ~126 outils et **agit** vraiment (enroll, launch, book, merge…). La vision « chat-first » est réalisée **dans le chat** mais **pas dans le GUI**, qui reste un archipel. Opportunité : le GUI peut exposer les arêtes que le chat sait déjà parcourir.

## Plan de walk live (2 phases, prod)

**Phase A — Funnel + états vides (fresh signup).** Auditer F1→F4 + onboarding réel + empty states + premier ICP→TAM nécessite de **traverser le signup**. Je crée UN compte test jetable (`audit-0605@elevay.dev`), je note pour cleanup. Le tenant de Martin (`47dca783`) reste **strictement lecture seule**.

**Phase B — Coutures sur données réelles (tenant 47dca783).** Login martin@elevay.dev (test des mdp candidats ; sinon demander). Auditer S1–S18 / X1–X7 sur données peuplées + états populated/partial/error/edge.

Note : les empty states ne sont testables que via Phase A (fresh tenant) ; sur le tenant peuplé je les infère du code.

## Hypothèses à vérifier live (ordonnées)

### P0 — chemin cœur / bloquants
1. **Quel onboarding tourne vraiment** pour un tenant neuf : modal léger (dit la mémoire 2026-06-05) ou wizard 7-phases `/onboarding-v3` (dit le code) ? Détermine si le bug « ICP droppé » est live ou du code mort.
2. **ICP→TAM** : `tenants.settings` peuplé ? `/accounts` reflète-t-il l'ICP ?
3. Nom de compte → slide-over ou fiche `/accounts/[id]` ? (S3/S4)
4. hot-to-call « Call » → ouvre `/call-mode` ciblé ou simple toast ? (S9)
5. `/meetings/upload` → 404 ? (CTA cassé)
6. Liste meetings → fiche meeting atteignable ? (entrée S14)

### P1 — coutures majeures
7. Opportunity → lien vers Account ? Opportunity → Proposal (path produit) ? (S15)
8. Contact detail → deals affichés ? téléphone → lien call ? (S7)
9. Cartes Home « Up next » → deep-link avec contexte ou pages liste ? (S1)
10. Inbox reply → composer reçoit contactId/dealId ? création task/deal ? (S13)
11. Notes/Tasks → back-link entité rendu ? (S17)
12. Chat → retrieval knowledge marche sur prod (`OPENAI_API_KEY` présent) ? (test lecture seule) (X3)
13. ⌘K → saute vers entités ? (X1)
14. NotificationBell → deep-link vers la source ? (X5)

### P2 — états / gouvernance
15. Empty/error states des listes (la plupart avalent les erreurs en silence).
16. capture-approvals → la donnée approuvée atterrit-elle dans le CRM ? (X6)
17. Autonomy / guardrails : URL atteignable ? approval mode visible ?
18. Pricing $99 (`/pricing`) vs $149 (billing) — lequel s'affiche ?
