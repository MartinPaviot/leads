# Orion — BRIEF DE LOT · pack6 « ui » (`feat/orion-pack6`)

> **Brief auto-suffisant.** Cette session n'a QUE ce fichier + les docs pointés. Tout ce qu'il
> faut pour EXÉCUTER pack6 sans rien redériver est ici. Les `file:line` sont **réels et vérifiés** :
> ils désignent la **SOURCE Elevay à COPIER** sous `C:/Users/ombel/leads/app/apps/web/src/` (la
> provenance à vendorer, PAS un import). Orion est un **repo SÉPARÉ** (`@orion/web`) ; ses fichiers,
> une fois copiés, vivent sous `src/`.
>
> **Lire (dans l'ordre, seulement ces passages) :**
> 1. `orion/spec/00-ARCHITECTURE.md` — D1 (DB partagée), D2 (tenant `elevay`/RLS), règles d'or §3
>    n°9 (no-emoji), n°10 (tokens Elevay). C'est l'**UI de l'app Orion** (repo SÉPARÉ `@orion/web`).
> 2. `orion/spec/00-EXECUTION-GUIDE.md` — §1 pack6 (sous-tâches **U1–U6**), §3.1 ownership pack6,
>    §3.2(d) globals.css/@orion/ui, §4 invariant n°9 (export nommé interdit sur `page.tsx`).
> 3. `orion/spec/00-PREREQUISITES.md` — §3 piège #6 (Tailwind 4 config-less), #11 (export
>    nommé sur `page.tsx`/`layout.tsx` casse `next build` → siblings `_`), GAP-7 (`find_prospects`
>    = P1) ; mémoire founder demi-écran (680/960px + zoom 200%).
> 4. `orion/spec/ui-spec.md` — **le doc maître de ce lot** : §1 (Option B `@orion/ui`), §2 (tokens
>    verbatim — accent **`#2C6BED`**, PAS `#3D99F5`), §3 (inventaire composants REUSE), §4a-d
>    (mockups ASCII + copy FR des 4 écrans), §5 (QA visuelle), §6 (intégration/fusion jour J).
> 5. `orion/research/signal-agent-prd-2026-06-27.md` — le parcours produit (Sources→Prospects→
>    Brief→Export) pour comprendre l'enchaînement des écrans.
>
> **Décisions founder (priment sur tout langage « DB séparée / Convex / dans le monorepo Elevay ») :**
> Orion = **repo SÉPARÉ** (app Next/pnpm propre, package `@orion/web`) ; DB = base Elevay PARTAGÉE
> (`DATABASE_URL` inchangé), scope tenant `elevay` uniquement (RLS, `withTenantTx`) ; composants/tokens
> Elevay **COPIÉS (vendorés)** dans le repo Orion, **PAS** importés via workspace. **Pour pack6 ces
> décisions sont surtout structurelles** : l'UI vit dans `src/app/(orion)/` (repo Orion), importe les
> composants/tokens Elevay copiés, et lit les données via la couche server-side
> `withTenantTx(elevayTenantId)`. **Aucun accès DB direct depuis un composant client.**

---

## 1. OBJECTIF + PÉRIMÈTRE

**Objectif.** Construire le **frontend d'Orion, visuellement identique à Elevay** : 4 écrans
(**Sources/Ingestion**, **Prospects** rankés par `priority_score`, **Brief view** = dossier
why-now/citableFacts/doNotClaim/angle/citations, **Outbound/Export** = destinations + verdict gate),
bâtis **exclusivement sur les composants Elevay existants** + extraction d'un **paquet de tokens
partagé `@orion/ui`** (Option B, `ui-spec §1`). Tokens partagés (Inter / JetBrains Mono, accent
**`#2C6BED`**), **zéro emoji** dans l'UI load-bearing, responsive **founder demi-écran** (single-pane
sous `lg`), light + dark. **Zéro nouveau système visuel, zéro nouvelle palette, zéro composant de
base net-new** (seuls des badges de **statut/source** par composition de `Badge`).

**Mapping sous-tâches (`00-EXECUTION-GUIDE §1`) :** U1 tokens/`@orion/ui` (1,0) · U2 Sources (1,0) ·
U3 Prospects rankés (1,5) · U4 Brief view (1,5) · U5 Outbound + verdict gate (1,0) · U6 responsive
single-pane + dark + QA `/design-review` (1,0). **Effort total ≈ 7,0 j-h.**

### IN (ce lot POSSÈDE — voir §3)
Le paquet `@orion/ui` extrait (tokens + réexport des primitives) ; les 4 route groups
`app/(orion)/{sources,prospects,briefs,outbound}` (`page.tsx` + `layout.tsx` + `loading.tsx` +
`error.tsx` + siblings `_`) ; la sidebar/chrome Orion ; les badges **statut/source** Orion ; la
**couche d'accès données UI** (fixtures + seam de lecture `withTenantTx`, lue par les pages) ; la QA
visuelle des 4 écrans.

### OUT (possédé par un AUTRE lot — NE PAS créer/éditer)
- **pack0** possède : `src/app/globals.css` (base `@theme`/`:root`/`.dark`/`.inbox-shell`/`.ls-table`),
  le chrome de layout dashboard, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`,
  `package.json` (deps). pack6 **n'édite PAS** `globals.css` directement — il **extrait** son contenu
  token vers `packages/ui` (U1) puis le réimporte (§3.2(d) du guide). Si l'extraction touche
  `globals.css`, c'est l'**unique** édition autorisée et elle reste un déplacement de tokens (pas de
  nouveau token).
- **pack1** possède les **contrats** que pack6 importe (jamais ne crée) : `lib/ingest/types.ts`
  (`IngestItem`/`IngestSource`), `lib/outbound/types.ts` (`OutboundDestination`/`ExportResult`),
  `lib/mcp/contracts/outreach-brief.schema.ts` (zod `OutreachBrief`).
- **pack2/3/4** possèdent les **API runtime** (ingestion, `get_outreach_brief`, `export_to_outbound`).
  **Soft dep** : pack6 code contre **fixtures + contrats** ; le câblage réel des pages aux requêtes
  live se fait en **pack7**.
- **pack5** (Tier2/velocity), **pack7** (intégration/seed/e2e) : hors pack6.

**RÈGLE D'OR :** pack6 n'édite QUE ses fichiers (§3). Les composants Elevay REUSE
(`sidebar.tsx`, `ui/*.tsx`, `signal-chip.tsx`, `coaching/citation-chip.tsx`…) sont **copiés depuis
Elevay puis adaptés par wrapper, jamais modifiés vs la source copiée**.

---

## 2. PRÉREQUIS

**Lots à finir avant (dur) :** **pack0** (coquille bootable : `globals.css` base, chrome layout,
deps Tailwind 4 / React 19 / Next 15 épinglées, route group dashboard). **pack1 (soft)** pour les
types de contrats — si pack1 n'est pas encore mergé, pack6 déclare les **fixtures typées** localement
contre la forme documentée (ci-dessous) et bascule sur l'import pack1 au rebase.

**Démarrage de session :**
```sh
git fetch origin && git checkout main && git pull
git checkout -b feat/orion-pack6
git rebase origin/main          # récupérer pack0 (+ pack1 si mergé)
cd app && pnpm install --frozen-lockfile && pnpm --filter @orion/web tsc
```

**Cartes nécessaires de 00-PREREQUISITES (résumé exécutable) :**
- **Piège #6 — Tailwind 4 config-less.** AUCUN `tailwind.config.*`. Le theme vit dans `globals.css`
  sous `@theme` (`app/globals.css:18`) + `@custom-variant dark (&:where(.dark, .dark *))` (`:11`).
  L'extraction `@orion/ui` (U1) doit préserver cette forme — pas de scaffold v3-style.
- **Piège #11 — export nommé sur `page.tsx`/`layout.tsx` casse `next build` Vercel** (passe tsc+CI,
  échoue le build). Les `page.tsx`/`layout.tsx` n'exportent QUE `default` + route-config. Tout le
  reste (composants, fixtures, helpers) va dans des **siblings préfixés `_`** (ex. `_sources-table.tsx`,
  `_data.ts`). Modèle vérifié : `app/(dashboard)/accounts/_persona-search.tsx`.
- **No-emoji** (règle d'or n°9). Les glyphes `✓ ✗ ? ◐ ◉ ○` des mockups sont des **icônes Lucide**
  (`Check`, `Slash`, `Circle`, `AlertCircle`), jamais des emoji. Aucun emoji dans titres/labels/
  badges/boutons.
- **Accent = `#2C6BED`** (light) / `#60A5FA` (dark). `#3D99F5` est une valeur scopée inbox upstream,
  **erronée comme accent applicatif** (`ui-spec §2.1` note de correction).
- **Founder demi-écran** : tester `680px` ET `960px` + zoom 200%. Sous `lg`, single-pane (rail liste +
  panneau détail masqués, zone active pleine largeur, bouton `‹ Retour`), sidebar 240→52 (collapse).
- **Tenant `elevay` / RLS** : toute lecture de données réelles passe par `withTenantTx(elevayTenantId)`
  côté **server** (RSC / route handler / server action) — jamais depuis un composant client, jamais le
  `db` global. En pack6 c'est surtout théorique (on lit des fixtures) ; le seam `_data.ts` documente la
  signature server pour que pack7 branche le réel.

**Composants/tokens Elevay REUSE (vérifiés — fichiers à COPIER depuis Elevay, jamais modifier vs la source) :**

| Élément Orion | Source Elevay (`src/…`) `file:line` | Usage |
|---|---|---|
| Sidebar 240 + collapse + UserMenu | `components/sidebar.tsx:285` (`Sidebar`) | adapter (sections nav Orion) via wrapper |
| Header 44 / Filter bar 40 | `components/ui/page-header.tsx:14` (`PageHeader`), `:54` (`FilterBar`) | réutiliser tel quel |
| Boutons | `components/ui/button.tsx:28` (`Button`, variants solid/outline/ghost/icon, sm/md/lg) | réutiliser tel quel |
| Badge / ScoreBadge / PropertyBadge / IndustryBadge / TitleBadge | `components/ui/badge.tsx:24/:44/:117/:139/:167` | réutiliser ; composer les badges statut/source |
| Empty states (5 variants) | `components/ui/empty-state.tsx:71` (`EmptyState`), variants `:23` (`first-use`/`no-filter-match`/`error`/`loading`/`no-permission`) | réutiliser tel quel |
| Skeletons | `components/ui/skeleton.tsx:13` (`TableSkeleton`), `:149` (`DetailPageSkeleton`) | réutiliser tel quel |
| Signal chip (popover Raisonnement/Sources, états true/false/?/pending) | `components/signal-chip.tsx:37` (`SignalChip`), props `:7` (`payload:null`→shimmer ; `openId`/`onOpenChange` = un seul popover ouvert) | adapter clés signaux |
| Confidence badge (Vérifié/Probable/Incertain/Non vérifié) | `components/signal-confidence-badge.tsx:23` (`SignalConfidenceBadge`) | adapter si taxonomie diffère |
| Citation `[n]` inline | `components/coaching/citation-chip.tsx:23` (`CitationChip`) | adapter (citation = source web/fait, pas timecode meeting) |
| Modal / Dropdown / Toast | `components/ui/modal.tsx:23` (`Modal`), `dropdown-menu.tsx:20` (`DropdownMenu`), `toast.tsx:43` (`ToastProvider`)/`:39` (`useToast`) | réutiliser tel quel |
| Card / Input / Avatar / Tooltip / Breadcrumbs / BetaTag | `components/ui/{card,input,avatar,tooltip,breadcrumbs,beta-tag}.tsx` | réutiliser tel quel |
| Classes CSS | `app/globals.css` : `.ls-table:541`, `.inbox-shell:186`, `.inbox-rail:215`, `.skeleton-row:513`, `.email-body` ; tokens `@theme:18` (`--detail-panel-width:28`=400px, `--inbox-list-width:35`=360px) | réutiliser ; extraire en `@orion/ui` (U1) |

**Contrats importés de pack1 (NE PAS créer) — formes documentées pour les fixtures :**
- `OutreachBrief` (zod, `lib/mcp/contracts/outreach-brief.schema.ts`) : `whyNow.{whyNowSummary,
  priorityScore, topSignal:{type,strength,evidence:{url,quote}}}`, `citableFacts[]:{quote,url,type,
  verified}`, `doNotClaim[]:string`, `messaging.{bestAngle,painPoints[],suggestedCta}`,
  `firmographicProvenance[]`, `meta.{gate:{exportable, code?}, expiresAt, briefCompleteness}`. (Le type
  Elevay sous-jacent est `IntelligenceBrief` `lib/campaign-engine/types.ts:50`.)
- `IngestSource`/`IngestItem` (`lib/ingest/types.ts`) : pour les compteurs `enregistrés`/`doublons`/
  `état`/`MAJ` de l'écran Sources.
- `ExportResult`/`OutboundDestination` (`lib/outbound/types.ts`) + lignes `export_items`
  (`{prospect, subject, gate:{verdict, checks[]}, channel}`) : pour l'écran Outbound.

---

## 3. FICHIERS POSSÉDÉS PAR pack6 (création + édition exclusives)

> `packages/ui/*` est à la racine du repo Orion (`packages/ui/`). Le reste sous `src/` (repo Orion
> séparé). **NET-NEW** sauf mention. Zéro chevauchement (vérifié
> contre `00-EXECUTION-GUIDE §3.1`).

| Fichier | Type | Rôle |
|---|---|---|
| `packages/ui/package.json` | NET-NEW | paquet `@orion/ui`, `workspace:*`, pas publié. |
| `packages/ui/src/tokens.css` | NET-NEW | bloc `@theme` + `:root` + `.dark` + `.inbox-shell`/`.inbox-rail` + `.ls-table` **extraits** de `globals.css` (source de vérité unique, Option B). |
| `packages/ui/src/index.ts` | NET-NEW | réexports des primitives partagées (barrel) — héberge les primitives copiées d'Elevay (le repo Orion n'a **pas** de dépendance workspace `@leadsens/web`). |
| `app/globals.css` | **MODIF (unique autorisée)** | remplacer le bloc tokens inline par `@import "@orion/ui/tokens.css"` (déplacement, zéro nouveau token). Coordonné pack0/pack6 ; pack6 seul touche l'UI. |
| `app/(orion)/layout.tsx` | NET-NEW | shell Orion : `Sidebar` (REUSE `:285`) + sections nav Orion + `ToastProvider`. Exporte **default uniquement**. |
| `components/orion/orion-sidebar-nav.ts` | NET-NEW | données nav Orion (Sources/Prospects/Briefs/Outbound + Paramètres), pas de visuel net-new. |
| `components/orion/status-badge.tsx` | NET-NEW | badge **verdict gate** `Prêt`/`À revoir`/`Bloqué` (compose `Badge` + tokens `--color-success/-warning/-error` + `-soft`). |
| `components/orion/source-badge.tsx` | NET-NEW | badge **source** (CSV/Apollo/Registre/LinkedIn) — compose `Badge`. |
| `app/(orion)/sources/page.tsx` | NET-NEW | écran Sources (default only). |
| `app/(orion)/sources/{layout,loading,error}.tsx` | NET-NEW | chrome route Sources. |
| `app/(orion)/sources/_sources-table.tsx` | NET-NEW | table sources (`.ls-table`) + panneau détail 400. |
| `app/(orion)/prospects/page.tsx` | NET-NEW | écran Prospects (default only). |
| `app/(orion)/prospects/{layout,loading,error}.tsx` | NET-NEW | chrome route Prospects. |
| `app/(orion)/prospects/_prospects-table.tsx` | NET-NEW | table rankée `priority_score` + colonne signaux (`SignalChip`+`SignalConfidenceBadge`). |
| `app/(orion)/briefs/page.tsx` | NET-NEW | écran Brief view (default only). |
| `app/(orion)/briefs/{layout,loading,error}.tsx` | NET-NEW | chrome route Briefs. |
| `app/(orion)/briefs/_brief-shell.tsx` | NET-NEW | pattern `.inbox-shell` : rail liste 360 + dossier (why-now/citableFacts/doNotClaim/angle/citations). |
| `app/(orion)/outbound/page.tsx` | NET-NEW | écran Outbound (default only). |
| `app/(orion)/outbound/{layout,loading,error}.tsx` | NET-NEW | chrome route Outbound. |
| `app/(orion)/outbound/_outbound-table.tsx` | NET-NEW | table envois préparés + panneau détail (aperçu + verdict gate). |
| `app/(orion)/_lib/data.ts` | NET-NEW | **seam de lecture** : signatures server `getSources/getProspects/getBriefs/getOutboundItems` (`withTenantTx(elevayTenantId)`), renvoient des fixtures en pack6 ; pack7 branche le réel. |
| `app/(orion)/_lib/fixtures.ts` | NET-NEW | fixtures typées (hero + compte-piège `unreviewed` + erreur ligne) contre les contrats pack1. |
| `app/(orion)/__tests__/orion-ui.test.tsx` | NET-NEW | tests rendu Vitest (happy-dom + Testing Library) des 4 écrans + états. |
| `e2e/orion-ui.spec.ts` | NET-NEW (`[P1]`) | smoke Playwright nav 4 écrans + single-pane. (Le e2e parcours complet appartient à pack7.) |

**COPIÉ depuis Elevay (NE PAS recréer) :** tous les composants/classes du tableau REUSE §2 ; les contrats pack1 sont importés localement (pack Orion).

> **Note ownership :** `app/(orion)/_lib/` est **route-private** (préfixe `_`) → pas de collision avec
> `src/lib/*` possédé par pack1-5. Les fixtures/seam y vivent pour éviter tout chevauchement.

---

## 4. ÉTAPES ORDONNÉES

> Avant CHAQUE commit : `git rev-parse --abbrev-ref HEAD` == `feat/orion-pack6` ; `git add` **scopé**
> (jamais `-A`/`.`) ; un changement logique par commit ; trailer obligatoire (§6). Per sous-tâche :
> code → TEST écrit → VERIFY exécuté soi-même (preuve : screenshot/log) → commit. **Une seule
> instance Playwright à la fois** (règle navigateur) ; screenshots séquentiels `001-…png`.

### U1 — Tokens partagés `@orion/ui` (extraction Option B) — 1,0 j-h
**Action.** Créer le paquet workspace `packages/ui` (`@orion/ui`, `workspace:*`, non publié). **Extraire**
de `app/globals.css` vers `packages/ui/src/tokens.css` : le bloc `@theme` (`:18` — layout, incl.
`--detail-panel-width:400px`, `--inbox-list-width:360px`, `--header-height:44px`, `--sidebar-width:240px`),
`@custom-variant dark` (`:11`), `:root` (light, accent `#2C6BED`), `.dark` (dark, accent `#60A5FA`),
`.inbox-shell`/`.inbox-rail` (`:186`/`:215`), `.ls-table` (`:541`), `.skeleton-row` (`:513`), badges
catégorie/industrie/séniorité (`ui-spec §2.6`). Dans `globals.css`, remplacer le bloc déplacé par
`@import "@orion/ui/tokens.css"` (zéro nouveau token, zéro changement de valeur). `packages/ui/src/index.ts`
= barrel réexportant les primitives partagées.
**Code clé :**
```css
/* packages/ui/src/tokens.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@custom-variant dark (&:where(.dark, .dark *));
@theme { /* --sidebar-width:240px; --header-height:44px; --detail-panel-width:400px; … */ }
:root { --color-accent:#2C6BED; /* … verbatim ui-spec §2.1 */ }
.dark { --color-accent:#60A5FA; /* … verbatim ui-spec §2.2 */ }
.inbox-shell { /* … ui-spec §2.7 */ }
.ls-table { /* … */ }
```
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `pnpm --filter @orion/web dev`, ouvrir une page
existante → **rendu identique pixel** avant/après extraction (screenshot diff). `grep -c "#3D99F5"
packages/ui/src/tokens.css` == nombre attendu (scopé inbox uniquement, jamais comme accent).
**TEST.** Snapshot du build CSS (ou un test asserttant qu'`globals.css` importe `@orion/ui/tokens.css`
et ne redéclare pas `--color-accent`).

### U2 — Écran Sources / Ingestion — 1,0 j-h
**Action.** Route `app/(orion)/sources/` : `page.tsx` (default, async RSC lisant `getSources()` du seam)
+ `loading.tsx` (`TableSkeleton`) + `error.tsx` (`EmptyState` variant `error`). `_sources-table.tsx` :
`PageHeader` titre **`Sources`** + action **`Ajouter une source`** ; `FilterBar` `Tous · CSV · Apollo ·
Registre · LinkedIn` + `Rafraîchir` ; `.ls-table` colonnes `NOM · TYPE · ENREGISTRÉS · DOUBLONS · ÉTAT
· MAJ` (compteurs `font-mono`, `td.numeric` tabular-nums) ; au clic, panneau détail 400
(`--detail-panel-width`) avec colonnes reconnues + `[Réimporter] [Suppr.]`. `source-badge` pour TYPE,
`status-badge` pour ÉTAT (`OK`/`Erreur`/`En cours`). Copy/espacements **verbatim `ui-spec §4a`**.
Vide → `EmptyState` `first-use` (`Aucune source` / `Importez un CSV ou connectez un provider pour
commencer.` / `Ajouter une source`).
**VERIFY.** Live : table peuplée par fixtures, ligne `Erreur` ouvre le message brut dans le panneau ;
état vide + chargement + erreur capturés (screenshots `001`/`002`/`003`).
**TEST.** Rendu : 6 colonnes présentes ; `EmptyState first-use` quand `sources=[]` ; `status-badge
Erreur` en `--color-error`.

### U3 — Écran Prospects (rankés `priority_score`) — 1,5 j-h
**Action.** Route `app/(orion)/prospects/`. `_prospects-table.tsx` : `PageHeader` **`Prospects`** +
actions `Exporter` / `Générer briefs` ; `FilterBar` tris `Score · Secteur · Signal · Source` +
`Rechercher…` ; `.ls-table` colonnes `SCORE · ENTREPRISE · SIGNAUX · SECTEUR · MAJ`, **triée desc par
`priority_score`** (= signal × fit_mod × access_mod, **PAS** `companies.score`). `SCORE` via `ScoreBadge`
(`td.numeric`, tabular-nums). `SIGNAUX` = `SignalChip` (`:37`) : `✓` vert (`--color-success`) = vrai,
`✗` muet barré = faux, `?` pointillés = indéterminé, shimmer (`payload:null`) = en calcul ; popover au
clic (onglets `Raisonnement`/`Sources`) avec `openId`/`onOpenChange` (un seul popover ouvert à la fois) ;
`SignalConfidenceBadge` (`:23`) inline (`Vérifié`/`Probable`/`Incertain`/`Non vérifié`). Libellés signaux
FR : `Levée`, `Recrutement`, `Investisseur`, `YC`. Sélection → `--color-bg-selected`. Vide →
`EmptyState no-filter-match` (`Aucun prospect` / `Aucun prospect ne correspond à ces filtres.` /
`Réinitialiser les filtres`). Copy verbatim `ui-spec §4b`.
**VERIFY.** Live : 5 lignes fixtures triées desc par score ; clic chip → popover Raisonnement/Sources ;
un 2e clic ferme le 1er (single-popover) ; chip shimmer pour `payload:null`. Screenshots light+dark.
**TEST.** Tri desc par `priorityScore` ; `SignalChip` reçoit `payload:null` → shimmer ; un seul popover
`openId` actif ; `EmptyState no-filter-match` sur filtre vide.

### U4 — Brief view (le dossier) — 1,5 j-h
**Action.** Route `app/(orion)/briefs/`. `_brief-shell.tsx` = pattern `.inbox-shell` : rail liste
(`.inbox-rail`, `--inbox-list-width:360px`, frosted) item sélectionné `◉` en `--color-bg-selected` +
score + MAJ ; dossier à droite avec sections **majuscules 12px `--color-text-tertiary`** :
`POURQUOI MAINTENANT` (← `whyNow.whyNowSummary` + `topSignal`, daté/sourcé), `FAITS CITABLES`
(← `citableFacts[]`, chaque item + `CitationChip [n]`), `NE PAS AFFIRMER` (← `doNotClaim[]`, liste en
`--color-warning`/`-soft`), `ANGLE PROPOSÉ` (← `messaging.bestAngle`), `Sources` (liste `[n] url/fait`).
`CitationChip` (`:23`) `[1][2]` inline → ancre la source ; source non cliquable → style muet, pas de
lien. Actions `[Rédiger l'outbound]` / `[Rejeter]`. Vide → `EmptyState first-use` (`Aucun brief` /
`Générez des briefs depuis Prospects pour les voir ici.` / `Aller aux prospects`). Chargement →
`DetailPageSkeleton` (`:149`) à droite + `skeleton-row` dans le rail. Erreur génération → `EmptyState
error` (`Brief indisponible` / … / `Régénérer`). Copy verbatim `ui-spec §4c`.
**VERIFY.** Live : sélection d'un brief hero → why-now + ≥1 fait citable avec `[1]`, `NE PAS AFFIRMER`
en warning, citations ancrées ; rail frosted ; états vide/chargement/erreur. Screenshots light+dark.
**TEST.** Rendu des 5 sections ; `doNotClaim[]` en ton warning ; `CitationChip` muet quand `url`
absente ; rail item sélectionné en `--color-bg-selected`.

### U5 — Outbound / Export (destinations + verdict gate) — 1,0 j-h
**Action.** Route `app/(orion)/outbound/`. `_outbound-table.tsx` : `PageHeader` **`Outbound`** + action
`Exporter la sélection` ; `FilterBar` verdict `Tous · Prêt · À revoir · Bloqué` + sélecteur `Cible`
(`Instantly`/`Fiber`/`OrangeSlice`) ; `.ls-table` colonnes `☐ · PROSPECT · OBJET · VERDICT · CANAL` ;
panneau détail 400 = aperçu corps (`.email-body`) + bloc **VERDICT** miroir exact d'`evaluateSend`
(checks `Corps non vide`/`Faits sourcés`/`Pas d'opt-out`/`Base légale` avec `✓`) + `[Approuver]
[Modifier]`. `status-badge` verdict : `Prêt`→success, `À revoir`→warning, `Bloqué`→error (+`-soft`).
**Un envoi `Bloqué` n'est PAS sélectionnable** (checkbox désactivée + tooltip `Bloqué par le gate :
<raison>`) ; `Exporter` n'agit que sur `Prêt`/`À revoir` cochés. Confirmation = `Modal` (`:23`) taille
`md` (`Exporter vers <Cible>`, `Annuler`/`Exporter`) → toast (`useToast`) `N envois exportés`. Vide →
`EmptyState first-use` (`Rien à exporter` / `Approuvez des briefs pour préparer des envois.` /
`Aller aux briefs`). Copy verbatim `ui-spec §4d`.
**VERIFY.** Live : ligne `Bloqué` non cochable + tooltip ; clic ligne → panneau verdict avec 4 checks ;
`Exporter` ouvre la `Modal` → toast. Screenshots light+dark.
**TEST.** Checkbox `Bloqué` `disabled` ; `Exporter` ignore les `Bloqué` ; verdict `status-badge` couleur
correcte ; toast au succès.

### U6 — Responsive single-pane (<lg) + dark + QA `/design-review` — 1,0 j-h
**Action.** Sous `lg` : single-pane comme l'inbox (rail liste + panneau détail masqués, zone active
pleine largeur, bouton `‹ Retour`), header search rétrécit, sidebar 240→52 (collapse). Vérifier les 4
écrans en **light ET dark** (`.dark` sur `<html>`, jamais `prefers-color-scheme`), `:focus-visible`
(`outline 2px var(--color-accent)`), `Escape` ferme les modals, transitions 150ms ease-out. Lancer le
skill **`/design-review`** (audit senior-designer + AI-slop) sur l'UI rendue live à `680px` ET `960px`
+ zoom 200%.
**VERIFY.** `/design-review` PASS (aucune violation de token/AI-slop) ; screenshots des 4 écrans ×
(light/dark) × (narrow 680 / wide 960) — finir sur une vérification propre. Écrire le rapport sur disque.
**TEST.** `e2e/orion-ui.spec.ts` (`[P1]`) : nav 4 écrans, `resize 680` → rail/détail masqués + bouton
`Retour` visible.

### Étape finale — pack-level green
**Action.** Sidebar Orion câblée (`orion-sidebar-nav.ts`) ; toutes les routes bootent.
**VERIFY.** `pnpm --filter @orion/web tsc` + `pnpm --filter @orion/web test` verts ;
`pnpm --filter @orion/web build` (Vercel) **vert** (prouve l'absence d'export nommé sur
`page.tsx`/`layout.tsx`) ; `git diff --stat` scopé pack6.
**TEST.** La suite `orion-ui.test.tsx` complète passe.

---

## 5. CRITÈRES D'ACCEPTATION (testables)

1. **Identité visuelle Elevay.** Les 4 écrans n'utilisent QUE des composants Elevay + `@orion/ui` ;
   `grep -rn "tailwind.config" packages/ui app/(orion)` → **0** (config-less) ; accent partout
   `var(--color-accent)` = `#2C6BED`/`#60A5FA`, jamais `#3D99F5` comme accent.
2. **Source de vérité unique des tokens.** `globals.css` importe `@orion/ui/tokens.css` et ne
   redéclare aucun token ; le rendu d'une page Elevay existante est inchangé après extraction (screenshot
   diff).
3. **No-emoji.** `grep -rnP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" app/(orion) components/orion` →
   **0** (les `✓ ✗ ? ◐` sont des icônes Lucide).
4. **Prospects rankés.** La table est triée **desc par `priority_score`** ; `SCORE` via `ScoreBadge`
   tabular-nums ; signaux via `SignalChip`+`SignalConfidenceBadge` ; `payload:null` → shimmer.
5. **Brief = dossier zéro-prose.** Les 5 sections (`POURQUOI MAINTENANT`/`FAITS CITABLES`/`NE PAS
   AFFIRMER`/`ANGLE PROPOSÉ`/`Sources`) rendent depuis `OutreachBrief` ; `doNotClaim[]` en warning ;
   citations `CitationChip [n]` ancrées (muettes sans url). **Aucun `subject`/`body` rédigé par l'UI.**
6. **Verdict gate miroir.** Outbound affiche `Prêt`/`À revoir`/`Bloqué` ; un `Bloqué` est
   **non-sélectionnable** (checkbox `disabled` + tooltip raison) ; `Exporter` ignore les `Bloqué`.
7. **États couverts.** Chaque écran a vide / chargement / erreur via `EmptyState` + skeletons (variants
   exacts `ui-spec §4`).
8. **Responsive demi-écran.** À `680px` : single-pane (rail/détail masqués, bouton `‹ Retour`), sidebar
   collapse 52 ; à `960px` : layout intermédiaire correct ; light + dark OK.
9. **`next build` vert.** Aucun export nommé sur `page.tsx`/`layout.tsx` (siblings `_`).
10. **Pas d'accès DB client.** Aucun composant client n'importe `db`/`withTenantTx` ; la lecture passe
    par le seam server `_lib/data.ts`. `grep -rn "from \"@/db\"" app/(orion)/**/_*.tsx` côté composants
    client → **0**.

---

## 6. DEFINITION OF DONE

- Tous les fichiers de §3 créés ; `@orion/ui` extrait, `globals.css` réimporte les tokens (déplacement,
  zéro nouveau token).
- `pnpm --filter @orion/web tsc` **vert** + `pnpm --filter @orion/web test` **vert** +
  `pnpm --filter @orion/web build` **vert** (Vercel — prouve le no-export-gap), sur
  `pnpm install --frozen-lockfile` **propre** (pas un `node_modules` junctionné — divergence CI connue).
- `orion-ui.test.tsx` écrit et vert ; chaque critère §5 couvert par ≥1 test.
- Chaque sous-tâche U1–U6 a son **VERIFY exécuté soi-même** : screenshots des 4 écrans × light/dark ×
  narrow(680)/wide(960) + rapport `/design-review` PASS, écrits sur disque (`001-…png` séquentiels).
- `git diff --stat` **scopé pack6** (aucun fichier hors ownership §3 sauf l'import unique dans
  `globals.css`). Aucun composant Elevay REUSE édité sur place.
- Commits atomiques, un changement logique chacun, trailer :
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017cpMyY7RNVYTQmqzYp8Qz4
  ```
- PR `feat/orion-pack6` ouverte ; CI pleine verte (gitleaks + tsc/vitest + Vercel) ; `/evaluate` PASS ;
  merge squash + delete-branch ; surveiller le push CI de `main`.
- **Re-vérifier branche + HEAD juste avant chaque commit/push** (tree partagé, sessions parallèles).

---

## 7. PIÈGES SPÉCIFIQUES À CE LOT

1. **Export nommé sur `page.tsx`/`layout.tsx` casse `next build`** (passe tsc+CI, échoue Vercel). Ces
   fichiers n'exportent QUE `default` (+ route-config). Composants/fixtures/helpers → siblings `_`
   (modèle `accounts/_persona-search.tsx`). **Un `pnpm build` local est le seul filet qui l'attrape.**
2. **Accent = `#2C6BED`, PAS `#3D99F5`.** `#3D99F5` est scopé inbox-shell upstream ; l'utiliser comme
   accent applicatif est l'erreur classique (`ui-spec §2.1`). Toujours `var(--color-accent)`.
3. **No-emoji load-bearing.** Les glyphes des mockups (`✓ ✗ ? ◐ ◉ ○`) sont des **icônes Lucide**
   (`Check`/`Slash`/`Circle`/`AlertCircle`), jamais des emoji unicode.
4. **Tailwind 4 config-less.** Ne pas scaffolder un `tailwind.config.*` v3-style ; le theme reste dans
   `@theme`/`@orion/ui`. `@plugin "@tailwindcss/typography"` requis pour `.email-body`/prose.
5. **Dark via `.dark` sur `<html>` uniquement** — jamais `prefers-color-scheme`. Tester les 4 écrans en
   dark (shadows navy-tintées, pas de noir dur).
6. **`priority_score` ≠ `companies.score`.** Prospects se trie par `priority_score` (signal × fit_mod ×
   access_mod), pas par l'ICP-fit `companies.score`. Le `ScoreBadge` affiche le premier.
7. **L'UI ne rédige PAS d'outbound.** Brief = `citableFacts[]`/`doNotClaim[]`/why-now/angle/citations,
   **zéro `subject`/`body`**. Le verdict gate est une **donnée** affichée, pas un champ à composer.
8. **Le `Bloqué` n'est jamais exportable depuis l'UI** (miroir du gate non-contournable D8) : checkbox
   `disabled` + tooltip raison ; `Exporter` filtre les `Bloqué`. Ne pas offrir de contournement UI.
9. **Soft deps pack2/3/4.** Les pages lisent des **fixtures** via `_lib/data.ts` (signatures server
   `withTenantTx(elevayTenantId)`) ; le câblage aux API runtime se fait en **pack7**. Ne pas importer
   les handlers MCP/Inngest des autres packs.
10. **Aucun accès DB dans un composant client.** `withTenantTx`/`db` ne s'utilisent qu'en RSC/route
    handler/server action (le seam `_lib/data.ts`). Un `"use client"` qui importe `@/db` casse le build
    et l'invariant RLS.
11. **`@orion/ui` est consommé en `workspace:*`** (repo Orion en pnpm workspaces), pas publié. L'extraction est un
    déplacement de tokens — vérifier le rendu pixel-identique d'une page Elevay existante après coup.
12. **Une seule instance Playwright à la fois** (règle navigateur) ; ne pas lancer d'agent background
    qui pilote Playwright pendant la QA. Screenshots séquentiels, finir sur une vérification propre.
13. **`SignalChip` single-popover.** Passer `openId`/`onOpenChange` depuis le parent pour qu'un seul
    popover soit ouvert à la fois (sinon N popovers se chevauchent) — la prop `payload:null` rend le
    shimmer « en calcul » (`signal-chip.tsx:7`).
