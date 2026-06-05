# Elevay — Audit produit (feature-par-feature + fluidité / coutures)

Démarré : 2026-06-05
Périmètre : produit complet (user-facing + settings), testé **en live sur PROD** (www.elevay.dev), tenant `47dca783`.
Réfs code : branche `feat/accounts-manage`.

## Principe : deux niveaux de mesure (jamais mélangés)

1. **Nœuds (intra-feature)** — chaque écran noté sur la grille des 7 états.
2. **Coutures (inter-feature)** — chaque handoff attendu noté sur le report de contexte.

C'est le niveau 2 (les coutures) qui répond à la vraie question : « la fluidité et le lien entre chaque feature ».

## Grille des 7 états (par nœud)

| # | État | Question |
|---|------|----------|
| 1 | empty | tenant neuf / 0 donnée : guide-t-il vers l'action suivante, ou trou noir ? |
| 2 | loading | skeleton / spinner présent ? |
| 3 | partial | données à moitié enrichies (waterfall) : dégrade-t-il proprement ? |
| 4 | populated | happy path plein |
| 5 | error | API down / 403 / clé manquante / 42703 : message utile ? |
| 6 | edge | 1000 lignes, accents romands, champ vide, doublon |
| 7 | exit-CTA | où mène l'action principale ? (= entrée du niveau 2) |

Score nœud = (états correctement traités) / 7.

## Score couture

- **1.0 traverse** — contexte porté, zéro ressaisie, l'utilisateur enchaîne.
- **0.5 partiel** — navigue vers la bonne destination mais perd le contexte (ressaisie manuelle).
- **0.0 cul-de-sac** — aucun chemin, ou lien cassé.

## Sévérité

- **S0 bloquant** — chemin GTM cœur cassé / page crash.
- **S1 majeur** — ressaisie forcée ou cul-de-sac sur le happy path.
- **S2 mineur** — état empty/error/edge manquant hors chemin cœur.
- **S3 polish** — cosmétique.

Priorisation = sévérité pondérée par la position sur le fil rouge GTM (une couture cassée hot-to-call→call-mode > un edge-state sur une page admin).

## Méthode d'exécution

1. **Baseline statique** → `_audit/code-analysis/*.md` (6 clusters) : ce que le code *prétend* faire (états rendus + edges in/out). Sert de référence pour noter le live.
2. **Walk live** → Playwright sur prod, screenshot avant/après chaque état → `_audit/screenshots/NNN-<feature>-<état>.png`.
3. **Fiche par nœud** → `_audit/nodes/<feature>.md` (7 états + preuves + score + lacunes).
4. **Coutures** → `_audit/seams.md` (chaque couture notée vs `journey-graph.md`).
5. **Backlog unique priorisé** → `_audit/gap-register.md`.

## Fichiers

- `journey-graph.md` — nœuds + fil rouge GTM + table des coutures attendues
- `code-analysis/` — baseline statique (6 clusters)
- `nodes/` — fiches live par feature
- `seams.md` — coutures notées
- `gap-register.md` — backlog priorisé
- `screenshots/` — preuves
- `progress.txt` — tracker crash-recovery

## Bugs connus (NE PAS re-signaler comme neufs)

- `/api/inngest` → 500 sur prod (pas de clés Inngest Cloud).
- Email transactionnel Resend en mode test → destinataires externes silencieusement droppés (verify/invite/reset/welcome).
- Drift de migration DB possible (le schéma peut déclarer des colonnes absentes de la table → 42703).
- Logo / assets sensibles à la casse sur Vercel (corrigé 2026-06-04).
