# Re-audit des specs — Chat Live Executor (CLE)

Date : 2026-06-17
Méthode : 2 relecteurs indépendants à froid (CLE-00..08 et CLE-09..16) confrontant chaque spec à la constitution amendée (`README.md`), au DAG (`feature_list.json`) et à l'audit fondateur (`_research/chat-task-executor-audit-2026-06-16.md`), avec vérification de ~50 ancres `fichier:ligne` contre le code vivant. Synthèse + réconciliations par moi.

---

## 1. Verdict

**Prêt à exécuter, aucun blocker.** Les 17 specs (51 fichiers) sont complètes (requirements EARS / design avec ancres réelles / tasks avec verify+test), fidèles aux contrats figés (avec 3 amendements ratifiés), correctement séquencées (DAG acyclique, deps exactes), et ancrées sur du code réel — toutes les ancres sondées (~50) se vérifient, avec de simples décalages cosmétiques de ~2 lignes sur call-mode.

Discipline notable : chaque spec qui touche un contrat figé (CLE-11 §3.2, CLE-15 §3.1, CLE-16 §3.5bis) ouvre un `spec-issues.md` et amende le README **avant** merge, conformément à la règle §6 — le protocole de changement de la constitution est suivi, pas contourné.

Score global de la livraison de specs : **complétude 10/10 · fidélité contrats 10/10 · séquencement 10/10 · ancrage réel 9.5/10** (nits de citation). Les réserves sont des décisions de checkpoint et des précisions de doc, pas des défauts de conception.

---

## 2. Tableau de verdict par spec

| Spec | Complétude | Fidélité contrat | Deps | Ancrage réel | Réserve principale |
|------|-----------|------------------|------|--------------|--------------------|
| CLE-00 approval-gate-rewire | PASS | OK (forward-compat CLE-10) | OK | OK (bug reproduit `route.ts:554-556`) | `batch-daily→proposal` = dégradation documentée (pas la vraie file) |
| CLE-01 tool-routing-reconcile | PASS | OK (aucun §3 touché) | OK | OK | compte 158 vs 160 (transitoire, drift-guard calcule en live) |
| CLE-02 custom-skill-bridge | PASS | OK | OK (dep CLE-01) | OK | — |
| CLE-03 action-directive-registry | PASS | OK (§3.1/3.2/3.3/3.5 verbatim) | OK | OK | undo type élargi → **patché** (voir §4) |
| CLE-04 page-action-tools | PASS | OK (§3.4/3.5bis) | OK (dep CLE-03) | OK (`route.ts:401-418`) | stub decideAction `extra?` → **patché** (voir §4) |
| CLE-05 action-confirmation-ux | PASS | OK | OK (dep CLE-03/04) | OK | retire le sélecteur Auto-run mort (décision produit) |
| CLE-06 register-opportunities | PASS | OK | OK (dep CLE-04/05) | OK (handlers vérifiés) | close-reason = 2e confirm action-local (self-flag) |
| CLE-07 register-accounts | PASS | OK | OK | OK | 24 actions/1 branche (gros) |
| CLE-08 register-contacts | PASS | OK | OK | OK (file-picker = absence de mécanisme) | wording « riskBadgesFor » (nit, §5) |
| CLE-09 register-call-mode | PASS | OK (§2 exclusions verbatim) | OK | OK (exclus = vrais endpoints dangereux) | `writeEmailDraft` credits sans carte (pattern documenté) |
| CLE-10 unified-approval-plane | PASS | OK (§3.5bis figé, `extra?` ratifié) | OK | OK | « 9 call sites » imprécis (réel 27 invocations / 6 fichiers) |
| CLE-11 audit-undo-extension | PASS | OK (§3.2 UndoDescriptor) | OK (worker → `inngest/`) | OK | +2 routes & enqueue interactif → checkpoint M2 |
| CLE-12 unified-permission-matrix | PASS | OK (axe permission à côté de decideAction) | OK | OK | comptes routes (59/346) = estimations |
| CLE-13 send-guardrail-hardening | PASS | OK (consomme CLE-10) | OK | OK (4 items vérifiés exacts) | EC-1 null-settings = **seul fail-open** → checkpoint M2 |
| CLE-14 register-remaining-pages | PASS | OK (navigate-only download) | OK (dep CLE-06..09) | plausible (8 pages, non re-vérifié ligne-à-ligne) | exécuter **split par page** (recommandé) |
| CLE-15 actuation-visibility | PASS | OK (§3.1 highlight, pas de new kind) | OK | OK (build-state note honnête) | mécanisme seul ; câblage pages = CLE-14 → ordre M3 |
| CLE-16 autonomy-level-wiring | PASS | OK (NE change pas la signature) | OK | OK (trustScore/F005 existent) | « incremental-from-prev » = changement de math F005 → sign-off M4 |

---

## 3. Couverture de l'audit fondateur

| Gap / bug | Specs | État |
|-----------|-------|------|
| **G1** actionnement de page | CLE-03+04+05 (cœur) · CLE-06/07/08/09 (4 pages) · CLE-14 (sweep) | Couvert |
| **G2** mécanisme de parité | CLE-03 (registre) + CLE-04 (`listPageActions`/`invokePageAction`) ; CLE-01/02 (anti-dérive de portage) | Couvert |
| **G3** plan de contrôle | CLE-04 (stub) → CLE-10 (collapse réel) + CLE-11 (audit/undo) + CLE-12 (permissions) + CLE-13 (guardrails) | Couvert |
| **G4** visibilité | CLE-05 (confirm/preview) + CLE-15 (highlight + narrate-actuate + off-web) | Couvert |
| Autonomie réelle | CLE-16 (level→comportement, trust gate, apprentissage borné) | Couvert |
| **Bug 6.1** approval mort-câblé | CLE-00 (fix) + CLE-10 (unification) | Couvert |
| **Bug 6.2** `enforceSendingIdentity` orphelin | CLE-13 (vérifié : 0 importateur) | Couvert |
| **Bug 6.3** dérive maps router (126≠158/160, fantômes, ~38 non-routés) | CLE-01 + CLE-02 | Couvert |
| **Bug 6.4** `signalAutoEnroll` non-gardé | CLE-13 (vérifié : aucun gate) | Couvert |
| Hors-scope assumé (non-silencieux) | DNC/quiet-hours/caps sur **appels** (CLE-13 §4) ; fusion des 2 trust scores (CLE-16) ; décroissance temporelle du trust (CLE-16) ; axe send-policy `execution-gate.ts` (CLE-10 §4.4) | Différé, documenté |

Aucune partie de G1–G4 ni des 4 bugs n'est laissée sans propriétaire. Les exclusions human-bound (téléphonie live, recorder micro, file-pickers, downloads, sécurité, money) sont des frontières permanentes documentées, pas des trous.

---

## 4. Réconciliations appliquées (pendant ce re-audit)

**Constitution amendée (README §3.8, 3 ajouts additifs rétro-compatibles) :**
1. §3.1 `navigate.highlight?: HighlightAnchor` (CLE-15).
2. §3.2 `PageActionResult.undo` accepte un `UndoDescriptor` sérialisable (CLE-11).
3. §3.5bis `decideAction(input, extra?)` 2e arg optionnel (CLE-10/CLE-16).

**`feature_list.json` :** chemin worker corrigé `lib/emails/email-send-worker.ts` → `inngest/email-send-worker.ts` (CLE-11 & CLE-13).

**Specs réconciliées avec la constitution amendée (auto-contradictions créées par MON amendement) :**
- CLE-03 `design.md` : `PageActionResult.undo` élargi à `(() => Promise<void>) | UndoDescriptor` (+ union shippée dans `types.ts` pour que CLE-11 soit pur consommateur).
- CLE-04 `design.md` : `decideAction` reçoit le 2e arg optionnel `_extra?` (ignoré dans le stub) pour que l'eval « signature parity » passe contre §3.5bis amendé.

---

## 5. Should-fix restants (par destination)

**Au build (préciser, sans bloquer) :**
- CLE-07/08 : reformuler la dépendance « riskBadgesFor » → « la carte de confirmation CLE-05 affiche les badges depuis les scalaires `cost`/`outbound` déclarés » (helper interne, pas un import). (nit)
- CLE-10 : remplacer « 9 call sites » par le compte réel (≈27 invocations sur 6 modules) ; le test de parité (T16) couvre le comportement quoi qu'il arrive. (précision)
- Nits cosmétiques : décalages ~2 lignes des citations de handlers call-mode (citent la ligne `const`, le `useCallback` ouvre 2 lignes plus bas) ; comptes de routes CLE-12 (59/346) = estimations à reconfirmer si la posture par défaut en dépend (elle n'en dépend pas).

**Décisions de checkpoint (à trancher par Martin, pas par le code) :**
- **M1** — produit : sous `auto-high-confidence` sans signal de confiance, les créations s'exécutent-elles directement (UX `auto` actuelle) ou via carte ? (CLE-00) · garder ou retirer le sélecteur « Auto-run » (CLE-05 recommande retrait).
- **M2** — sûreté : (a) CLE-13 EC-1 = le **seul fail-open** de l'initiative (settings nuls → comportement actuel) — à valider explicitement ; (b) CLE-11 ajoute 2 routes internes (`/api/chat/page-action-log`, `/api/outbound/[id]/cancel`) et transforme l'envoi interactif en mise-en-file quand une fenêtre d'undo>0 est active (changement de latence UX) — confirmer le seam.
- **M3** — ordre : CLE-15 livre le **mécanisme** de highlight + une fixture, mais aucun highlight visible tant que les pages CLE-14 n'ont pas enregistré leurs locators. Le libellé du milestone M3 sur-promet vs CLE-15 seul → exécuter CLE-15 puis CLE-14 (ou en parallèle) et mesurer la visibilité après CLE-14.
- **M4** — comportement : CLE-16 « incremental-from-prev » modifie la math d'apprentissage F005 (aujourd'hui borne jamais atteinte) → sign-off + test de convergence (T5).

**Patterns transverses à connaître (pas des défauts) :**
- `confirm:"always"` est le plancher uniforme pour tout `outbound` (CLE-09 `bookMeeting` ; CLE-14 `sendFollowUp`/`shareSlack`/`launch`/`reviewBulkApprove`).
- `writeEmailDraft`/`reply` sont `credits` + `confirm:"never"` (ils draftent + ouvrent le composer, n'envoient pas) — un crédit LLM dépensé sans carte, cohérent entre CLE-09 et CLE-14.
- Frontière human-bound = **omission + test de disjonction** sur une constante figée `*_EXCLUDED_IDS`, identique partout.

---

## 6. Cohérence transverse (vérifiée)

- **`decideAction` est l'unique épine dorsale et reste figée de bout en bout** : CLE-04 stub → CLE-10 corps + amendement `extra?` → CLE-13 consomme (signalAutoEnroll via `enforceAgentApprovalMode` qui délègue) → CLE-11 lit la disposition `execute` pour déclencher le hold → CLE-16 injecte via `extra` **sans toucher la signature**. CLE-00 `chatCreateDisposition` et le stub CLE-04 sont explicitement réconciliés comme le seam que CLE-10 absorbe.
- **CLE-16 ne duplique pas** le mapping level↔mode de CLE-10 (il consomme `deriveApprovalModeFromLevel`/`resolveEffectiveMode`, ne possède que la table de comportement + la généralisation du trust-floor + le builder de seuils).
- **CLE-12 permission-d'abord-puis-approbation** est orthogonal à l'entrée `role` de CLE-10 (un membre invoquant une action `outbound:money` est refusé par la matrice même si decideAction seul aurait dit `confirm`).
- Les 4 amendements §3.8 couvrent **tous** les changements de *type/forme* nécessaires ; aucune spec n'a besoin d'un changement de contrat non-ratifié (la « note clarifiante » §3.5bis souhaitée par CLE-16 est documentaire, pas un 4e changement de type).

---

## 7. Ai-je fait ce que je voulais ?

**Oui.** L'intention (audit §2-§4) était : (1) combler G1 par un **registre d'actions de page déclaratif** plutôt que du portage 1-pour-1 — fait (CLE-03/04/05 + pages) ; (2) garder les contrats figés dans **un** SSOT pour que ~16 specs parallèles restent cohérentes — tenu (3 amendements ratifiés, 2 specs réconciliées, 0 contrat redéfini en douce) ; (3) unifier le plan de contrôle (4 vocabulaires → 1) — fait (CLE-10/11/12/13) ; (4) corriger les 4 bugs — fait ; (5) exclure proprement les océans (computer-use, téléphonie live) — fait (omission + tests de disjonction).

Écart honnête : G3/G4 ne sont que *amorcés* en Phase 0-1 (stub decideAction, confirm sans highlight) et *fermés* en Phase 2-3 — ce qui est l'ordre voulu, pas un manque. Les seules vraies décisions restantes sont des arbitrages produit/sûreté de checkpoint, par construction réservés à Martin.

---

## 8. Ordre d'exécution recommandé
M0 : CLE-00 → CLE-01 → CLE-02 (correctness, sans risque, débloque la confiance dans la base).
M1 : CLE-03 → CLE-04 → CLE-05 (cœur) → CLE-06 (pilote) → CLE-07/08/09 (peuvent paralléliser). **Checkpoint Martin.**
M2 : CLE-10 → CLE-12 → CLE-11 → CLE-13. **Checkpoint Martin** (décisions sûreté §5).
M3 : CLE-15 → CLE-14 (split par page). 
M4 : CLE-16. **Checkpoint Martin** (sign-off math F005).
