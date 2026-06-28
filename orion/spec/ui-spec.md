# Orion — Spec UI (design language Elevay)

## 0. Principe

Orion ne réinvente rien visuellement. Mêmes tokens, mêmes primitives, même chrome
qu'Elevay (sidebar 240, header 44, dark via `.dark`). Le seul code UI net-new est
le câblage des écrans signal→brief→outbound sur des composants Elevay existants —
zéro nouveau système visuel, zéro nouvelle palette.

## 1. Stratégie de cohérence (le mécanisme)

Deux approches possibles pour garantir identité visuelle **et** intégrabilité :

| Option | Mécanisme | Avantage | Coût |
|--------|-----------|----------|------|
| **A — Copie verbatim** | Dupliquer `globals.css` (`@theme` + `:root` + `.dark` + `.inbox-shell`) dans le projet Orion | Démarrage immédiat, zéro dépendance | Dérive : deux fichiers à synchroniser à la main, divergence garantie dans le temps |
| **B — Paquet de tokens partagé** | Extraire un paquet `@orion/ui` (ou `@leadsens/ui-tokens`) contenant le bloc `@theme` + les vars `:root`/`.dark`/`.inbox-shell` + les primitives `.tsx`, importé par Elevay **et** Orion | Une seule source de vérité, fusion sans friction le jour J | Refactor initial : il faut sortir les tokens et les composants de `app/apps/web` vers un package du monorepo |

**Recommandation : Option A (copie verbatim).** Orion est un **repo SÉPARÉ**
(`@orion/web`) — **pas** de monorepo partagé avec Elevay, donc **pas de `workspace:*`**
possible. On **copie** `globals.css` (`@theme` + `:root` + `.dark` + `.inbox-shell`)
verbatim depuis Elevay dans Orion, exactement comme on copie (vendore) les modules
métier (cf `00-ARCHITECTURE` D3). Le coût accepté : re-porter manuellement les
changements de tokens Elevay (même discipline de drift que pour les modules copiés) —
cohérent avec toute la stratégie copie du corpus. **Option B (paquet workspace partagé)
est ÉCARTÉE** : elle suppose le même monorepo, ce que la décision repo-séparé exclut.
À la fusion future dans Elevay, on extraira un paquet de tokens à ce moment-là (pas avant).

Invariants à reprendre quelle que soit l'option :

- **Polices** : `--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` ; `--font-mono: 'JetBrains Mono', 'DM Mono', monospace`.
- **Tailwind v4** : `@import "tailwindcss"` + `@plugin "@tailwindcss/typography"` + bloc `@theme` (tokens layout) + `:root`/`.dark` (couleurs).
- **Dark mode** : `@custom-variant dark (&:where(.dark, .dark *))` — classe `.dark` sur `<html>`, **jamais** `prefers-color-scheme`.
- **Aucun `@layer components`** : les composants sont des atomes Tailwind + de la componentry React `.tsx`. Orion fait pareil.

## 2. Tokens (table verbatim)

Valeurs exactes à reprendre. La source de vérité reste
`app/apps/web/src/app/globals.css`.

### 2.1 Light (`:root`)

| Groupe | Token | Valeur |
|--------|-------|--------|
| Background | `--color-bg-page` | `#FAFAFA` |
| | `--color-bg-card` / `--color-bg-surface` | `#FFFFFF` |
| | `--color-bg-sidebar` | `#FFFFFF` |
| | `--color-bg-hover` / `--color-bg-muted` | `#F5F5F5` |
| | `--color-bg-selected` | `#F0F7FF` |
| | `--color-bg-emphasis` | `#EBEBEB` |
| | `--color-bg-modal-overlay` | `rgba(0,0,0,0.4)` |
| Texte | `--color-text-primary` | `#1A1A2E` |
| | `--color-text-secondary` | `#64648C` |
| | `--color-text-tertiary` / `--color-text-muted` | `#9CA3AF` |
| | `--color-text-placeholder` | `#C4C4D4` |
| Border | `--color-border-default` / `--color-border-moderate` | `#E8E8F0` |
| | `--color-border-hover` / `--color-border-strong` | `#D1D1E0` |
| | `--color-border-focus` | `#2C6BED` |
| **Accent** | `--color-accent` | **`#2C6BED`** |
| | `--color-accent-hover` | `#245EC9` |
| | `--color-accent-soft` | `rgba(44,107,237,0.08)` |
| | `--color-accent-muted` | `rgba(44,107,237,0.04)` |
| Sémantique | `--color-success` | `#10B981` (+`-soft` 0.08) |
| | `--color-warning` | `#F59E0B` (+`-soft` 0.08) |
| | `--color-error` | `#EF4444` (+`-soft` 0.08) |
| | `--color-info` | `#2C6BED` (+`-soft` 0.08) |

> **Correction.** Toute référence à `#3D99F5` est erronée : c'est une valeur
> *scopée* à l'inbox-shell upstream, **pas** l'accent applicatif. L'accent Orion
> est `#2C6BED` (light) / `#60A5FA` (dark), comme Elevay.

### 2.2 Dark (`.dark`)

| Groupe | Token | Valeur |
|--------|-------|--------|
| Background | `--color-bg-page` / `--color-bg-base` | `#0A0B0F` |
| | `--color-bg-card` / `--color-bg-surface` | `#12131A` |
| | `--color-bg-sidebar` | `#0E0F14` |
| | `--color-bg-hover` / `--color-bg-elevated` / `--color-bg-muted` | `#1A1B26` |
| | `--color-bg-selected` | `#1A1F35` |
| | `--color-bg-emphasis` | `#24253A` |
| Texte | `--color-text-primary` | `#E8E8ED` |
| | `--color-text-secondary` | `#8B8BA0` |
| | `--color-text-tertiary` / `--color-text-muted` | `#5A5A70` |
| | `--color-text-placeholder` | `#3A3A4A` |
| Border | `--color-border-default` / `--color-border-moderate` | `#1E1F2A` |
| | `--color-border-hover` / `--color-border-strong` | `#2A2B3A` |
| | `--color-border-focus` | `#60A5FA` |
| Accent | `--color-accent` | `#60A5FA` |
| | `--color-accent-hover` | `#93C5FD` |
| | `--color-accent-soft` | `rgba(96,165,250,0.12)` |
| | `--color-accent-muted` | `rgba(96,165,250,0.06)` |
| Sémantique | `--color-success` | `#34D399` (+`-soft` 0.12) |
| | `--color-warning` | `#FBBF24` (+`-soft` 0.12) |
| | `--color-error` | `#F87171` (+`-soft` 0.12) |
| | `--color-info` | `#60A5FA` (+`-soft` 0.12) |

### 2.3 Layout (`@theme`)

| Token | Valeur |
|-------|--------|
| `--sidebar-width` | `240px` |
| `--header-height` | `44px` |
| `--filter-bar-height` | `40px` |
| `--table-row-height` | `44px` |
| `--detail-panel-width` | `400px` |
| `--kanban-column-width` | `260px` |
| `--inbox-row-height` | `56px` (confort, 2 lignes) |
| `--inbox-row-height-compact` | `34px` (compact) |
| `--inbox-sidebar-width` | `240px` |
| `--inbox-list-width` | `360px` |
| `--inbox-cta-radius` | `10px` |

### 2.4 Shadows

| Token | Light | Dark |
|-------|-------|------|
| `--shadow-button` | `0 1px 2px rgba(0,0,0,0.05)` | `0 1px 2px rgba(0,0,0,0.4)` |
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.04)` | `0 1px 3px rgba(0,0,0,0.2)` |
| `--shadow-panel` | `0 8px 24px rgba(0,0,0,0.08)` | `0 8px 24px rgba(0,0,0,0.4)` |
| `--shadow-floating` | ring + `0 6px 18px rgba(0,0,0,…)` | `0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.4)` |
| `--shadow-dialog` | ring + `0 16px 48px rgba(0,0,0,…)` | `0 0 0 1px rgba(255,255,255,0.06), 0 16px 48px rgba(0,0,0,0.5)` |

### 2.5 Gradient brand

| Token | Light | Dark |
|-------|-------|------|
| `--gradient-brand` | `linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)` | `linear-gradient(90deg, #2DD4BF, #60A5FA, #FB923C)` |
| `--gradient-brand-hover` (dark) | — | `linear-gradient(90deg, #14b0a0, #245ec9, #e56d35)` |
| `--gradient-shimmer` (dark) | — | `linear-gradient(90deg, #2DD4BF, #60A5FA, #FB923C, #2DD4BF)` |

### 2.6 Badges catégorie + industrie + séniorité

- **10 teintes** `--color-badge-0 #2C6BED` … `--color-badge-9 #F97316`, chacune avec `-bg` à `0.07` d'opacité. Hash de chaîne → couleur stable par propriété.
- **Industrie** `--ind-{tech,services,finance,health,public,nonprofit,education,manufacturing,energy,agrifood,transport,construction,consumer,media}`, paires texte + `-bg` (AA). Dark : ex. `--ind-tech #A5B4FC` / `--ind-tech-bg rgba(99,102,241,0.16)`.
- **Séniorité** `--sen-{exec,lead,mgmt,team}` (icône Briefcase + teinte). Dark : `--sen-exec #FCD34D`, `--sen-lead #A5B4FC`, `--sen-mgmt #5EEAD4`, `--sen-team #CBD5E1`.

### 2.7 Pattern liste+détail (`.inbox-shell`, scoped)

À reprendre tel quel pour les écrans liste+brief d'Orion (§4c/§4b). Encre unique à
opacity steps, sol thématisé, rail en verre dépoli.

- **Light** : `background-color: #F1F4FA` + 3 couches (`radial 120% 80% at 0% 0%` accent à 0.10→0.03→0, `radial 110% 90% at 100% 100%` `rgba(108,115,228,0.06)`, `linear 13deg` sheen blanc) ; `letter-spacing: -0.014em` ; rail `rgba(255,255,255,0.64)` + `backdrop-filter: blur(18px) saturate(1.06)` ; `--color-bg-selected: rgba(44,107,237,0.07)` ; `--inbox-cta-radius: 12px`.
- **Dark** : `background-color: #0E0F16` + couches accent `rgba(96,165,250,0.12)` ; rail `rgba(18,19,26,0.58)` + même blur ; `--color-bg-selected: rgba(96,165,250,0.12)`.

## 3. Inventaire composants

Aucun composant visuel net-new requis. Tout vient de `app/apps/web/src/components/`.

| Élément Orion | Source Elevay | Statut |
|---------------|---------------|--------|
| Sidebar 240 + collapse + UserMenu | `sidebar.tsx` | Adapter (sections nav Orion) |
| Header 44 + actions | `ui/page-header.tsx` | Réutiliser tel quel |
| Filter bar 40 | `ui/page-header.tsx` (`FilterBar`) | Réutiliser tel quel |
| Table prospects (rows 44, `.ls-table`) | `globals.css` `.ls-table` + `ui/skeleton.tsx` (`TableSkeleton`) | Réutiliser tel quel |
| Panneau détail 400 | dimension `--detail-panel-width` | Réutiliser tel quel |
| Liste+détail (Sources, Brief) | `.inbox-shell` + `.inbox-rail` | Réutiliser le pattern |
| Chip de signal (popover reasoning/sources, états true/false/indéterminé/pending) | `signal-chip.tsx` | Adapter (clés signaux Orion) |
| Badge de confiance (verified/likely/uncertain/unverified) | `signal-confidence-badge.tsx` | Adapter si taxonomie diffère |
| Citation `[mm:ss]` / source inline | `coaching/citation-chip.tsx` | Adapter (citation = source web/fait, pas meeting) |
| Boutons (gradient/solid/outline/ghost/destructive/icon, sm/md/lg) | `ui/button.tsx` | Réutiliser tel quel |
| Cards (interactive, header/body) | `ui/card.tsx` | Réutiliser tel quel |
| Inputs / Textarea / Select / Toggle / Checkbox | `ui/input.tsx` | Réutiliser tel quel |
| Dialog / Modal | `ui/modal.tsx` | Réutiliser tel quel |
| Dropdown menu (actions, destructive) | `ui/dropdown-menu.tsx` | Réutiliser tel quel |
| Badges catégorie / industrie / séniorité / score | `ui/badge.tsx` (`PropertyBadge`, `IndustryBadge`, `TitleBadge`, `ScoreBadge`) | Réutiliser tel quel |
| Avatar (initiales gradient, logo carré) | `ui/avatar.tsx` | Réutiliser tel quel |
| États vides (first-use/no-filter/error/loading/no-permission) | `ui/empty-state.tsx` | Réutiliser tel quel |
| Skeletons par région | `ui/skeleton.tsx` | Réutiliser tel quel |
| Tooltip / Breadcrumbs / BetaTag / Toast | `ui/tooltip.tsx`, `ui/breadcrumbs.tsx`, `ui/beta-tag.tsx`, `.toast-enter/.toast-exit` | Réutiliser tel quel |

Net-new propre à Orion : uniquement des badges de **statut Orion** (verdict
gate : `Prêt` / `À revoir` / `Bloqué`) et de **source** (provider d'ingestion),
construits par composition de `Badge` + tokens sémantiques existants — pas de
nouveau composant de base.

## 4. Les écrans d'Orion en langage Elevay (mockups ASCII)

Conventions : sidebar `240px`, header `44px`, filter bar `40px`, rows table `44px`,
panneau détail `400px`. Single-pane sous `lg` (cf. §5).

### (a) Sources / Ingestion (CSV + providers)

Layout : sidebar 240 + zone principale = header 44 + filter bar 40 + table des
sources (rows 44) + panneau détail 400 à droite quand une source est sélectionnée.

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ ORION    [≡] │ Sources                              [+ Ajouter une source]    │ 44
│              ├──────────────────────────────────────────────────────────────┤
│ Sources    ◀ │ Tous · CSV · Apollo · Registre · LinkedIn   [Rafraîchir]      │ 40
│ Prospects    ├──────────────────────────────────────────────────────────────┤
│ Briefs       │ NOM            TYPE      ENREGISTRÉS  DOUBLONS  ÉTAT   MAJ      │
│ Outbound     ├──────────────────────────────────────────────────────────────┤
│              │ tam-q2.csv     CSV         1 240         84    OK     il y a 2h│ 44
│              │ Apollo · SaaS  Apollo      3 102        311    OK     il y a 1h│
│ ──────────── │ Pappers FR     Registre      560         12  Erreur  il y a 5h│
│ Paramètres   │ Sales Nav      LinkedIn      448          7    OK     il y a 3h│
│              │                                                               │
│ [MP] Martin  │                                                               │
└──────────────┴────────────────────────────────────────┬─────────────────────┘
                                                          │ tam-q2.csv      [×] │ 400
                                                          │ CSV · 1 240 lignes  │
                                                          │ Mappées : 1 240     │
                                                          │ Doublons fusionnés : │
                                                          │   84                 │
                                                          │ Colonnes reconnues : │
                                                          │   domaine, nom,      │
                                                          │   secteur, effectif  │
                                                          │ ─────────────────── │
                                                          │ [Réimporter] [Suppr.]│
                                                          └─────────────────────┘
```

- **Copy** : titre `Sources` ; action `Ajouter une source` ; filtres `Tous`, `CSV`, `Apollo`, `Registre`, `LinkedIn` ; colonnes `NOM`, `TYPE`, `ENREGISTRÉS`, `DOUBLONS`, `ÉTAT`, `MAJ` ; états `OK` / `Erreur` / `En cours`.
- **Espacements** : `.ls-table th` padding `6px 10px`, uppercase 12px ; `.ls-table td` padding `7px 10px`, 13px ; colonnes numériques `td.numeric` (tabular-nums, right). Compteurs en `font-mono`.
- **Vide** (`EmptyState` variant `first-use`) : titre `Aucune source`, description `Importez un CSV ou connectez un provider pour commencer.`, action `Ajouter une source`.
- **Chargement** : `TableSkeleton` (12 `skeleton-row` staggered 0–385ms).
- **Erreur ligne** : badge `Erreur` en `--color-error` + `-soft` ; au clic, panneau détail affiche le message brut. Bandeau global : `EmptyState` variant `error`, action `Réessayer`.

### (b) Prospects (liste rankée par priority_score, colonnes signaux)

Layout identique aux Accounts Elevay : header 44 + filter bar 40 + table 44, rankée
desc par `priority_score`. Colonnes signaux = `signal-chip` + `confidence-badge`.

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ ORION    [≡] │ Prospects                       [Exporter]  [Générer briefs]   │ 44
│              ├──────────────────────────────────────────────────────────────┤
│ Sources      │ Score ▾ · Secteur · Signal · Source        [Rechercher…]      │ 40
│ Prospects  ◀ ├──────────────────────────────────────────────────────────────┤
│ Briefs       │ SCORE  ENTREPRISE        SIGNAUX                SECTEUR   MAJ   │
│ Outbound     ├──────────────────────────────────────────────────────────────┤
│              │  92   ◐ Hexa            [Levée ✓] [Recrut ✓]   SaaS      2h    │ 44
│              │  87   ◐ Linkup         [Levée ✓] [YC ·?]       Fintech   3h    │
│ ──────────── │  81   ◐ Pollen        [Recrut ✓]              Health    1h    │
│ Paramètres   │  74   ◐ Datafold      [Investisseur ✓]        Data      5h    │
│              │  68   ◐ Brevo         [Levée ✗]                Email     1j    │
│ [MP] Martin  │                                                               │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

- **Copy** : titre `Prospects` ; actions `Exporter`, `Générer briefs` ; tris `Score`, `Secteur`, `Signal`, `Source` ; colonnes `SCORE`, `ENTREPRISE`, `SIGNAUX`, `SECTEUR`, `MAJ`. Libellés signaux FR : `Levée`, `Recrutement`, `Investisseur`, `YC`.
- **SCORE** : `ScoreBadge`, `td.numeric`, tabular-nums. C'est `priority_score` (signal × fit_mod × access_mod), pas `companies.score`.
- **SIGNAUX** : `signal-chip` — `✓` vert (`--color-success`) = vrai, `✗` muet barré = faux, `?` pointillés = indéterminé, shimmer = en calcul. Popover au clic : onglets `Raisonnement` / `Sources`. `confidence-badge` inline (`Vérifié` / `Probable` / `Incertain` / `Non vérifié`).
- **Sélection** : ligne en `--color-bg-selected`.
- **Vide** : `EmptyState` `no-filter-match`, titre `Aucun prospect`, description `Aucun prospect ne correspond à ces filtres.`, action `Réinitialiser les filtres`.
- **Chargement** : `TableSkeleton`.

### (c) Brief view (le dossier)

Pattern liste+détail `.inbox-shell` : rail liste à gauche (`--inbox-list-width 360px`,
frosted), dossier à droite. Le dossier expose why-now, citableFacts, doNotClaim,
angle, citations.

```
┌──────────────┬───────────────────────────┬──────────────────────────────────┐
│ ORION    [≡] │ Briefs            [Tous ▾] │ Hexa · Sarah Lemoine, CEO        │ 44
│              ├───────────────────────────┼──────────────────────────────────┤
│ Sources      │ ◉ Hexa          92   2h ▶ │ POURQUOI MAINTENANT              │
│ Prospects    │   Sarah Lemoine, CEO      │ Série A de 12 M€ annoncée le     │
│ Briefs     ◀ │ ─────────────────────────│ 24/06, menée par Partech. [1]    │
│ Outbound     │ ○ Linkup        87   3h   │                                  │
│              │   Tom Aubert, CTO         │ FAITS CITABLES                   │
│ ──────────── │ ─────────────────────────│ • Levée 12 M€ — 24/06/2026  [1]  │
│ Paramètres   │ ○ Pollen        81   1h   │ • 14 postes ouverts (eng)   [2]  │
│              │   Inès Roux, CEO          │ • Partech au board          [1]  │
│ [MP] Martin  │ ─────────────────────────│                                  │
│              │ ○ Datafold      74   5h   │ NE PAS AFFIRMER                  │
│              │   Léa Fontaine, COO       │ • Montant ARR (non sourcé)       │
│              │                           │ • Roadmap produit (spéculatif)   │
│              │                           │                                  │
│              │                           │ ANGLE PROPOSÉ                    │
│              │                           │ Féliciter la Série A, relier le  │
│              │                           │ recrutement eng à [notre valeur].│
│              │                           │ ──────────────────────────────  │
│              │                           │ Sources  [1] partech.com/…       │
│              │                           │          [2] hexa.io/careers     │
│              │                           │ ──────────────────────────────  │
│              │                           │ [Rédiger l'outbound]  [Rejeter]  │
└──────────────┴───────────────────────────┴──────────────────────────────────┘
```

- **Copy** (sections, majuscules 12px `--color-text-tertiary`) : `POURQUOI MAINTENANT`, `FAITS CITABLES`, `NE PAS AFFIRMER`, `ANGLE PROPOSÉ`, `Sources`. Actions : `Rédiger l'outbound`, `Rejeter`.
- **Citations** : `citation-chip` `[1]` `[2]` inline → ancre vers la source listée (URL/fait). Quand la source n'est pas cliquable : style muet, pas de lien.
- **NE PAS AFFIRMER** : liste en `--color-warning` `-soft`, signale les faits non sourcés / interdits de fabrication (gate anti-fabrication).
- **Rail liste** : item sélectionné `◉` en `--color-bg-selected` ; score à droite, dernière MAJ. Fond frosted `.inbox-rail`.
- **Vide** : `EmptyState` `first-use`, titre `Aucun brief`, description `Générez des briefs depuis Prospects pour les voir ici.`, action `Aller aux prospects`.
- **Chargement** : `DetailPageSkeleton` à droite, `skeleton-row` dans le rail.
- **Erreur génération** : dans le dossier, `EmptyState` `error`, titre `Brief indisponible`, description `La génération a échoué (raison ci-dessous).`, action `Régénérer`.

### (d) Export / Outbound (Instantly / Fiber / OrangeSlice, verdict gate)

Layout : header 44 + filter bar 40 + table des envois préparés (rows 44) + panneau
détail 400 = aperçu du message + verdict du gate.

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ ORION    [≡] │ Outbound                         [Exporter la sélection ▾]     │ 44
│              ├──────────────────────────────────────────────────────────────┤
│ Sources      │ Tous · Prêt · À revoir · Bloqué      Cible: [Instantly ▾]     │ 40
│ Prospects    ├──────────────────────────────────────────────────────────────┤
│ Briefs       │ ☐  PROSPECT          OBJET                   VERDICT    CANAL  │
│ Outbound   ◀ ├──────────────────────────────────────────────────────────────┤
│              │ ☑  Sarah · Hexa     Félicitations Série A   Prêt       Email  │ 44
│ ──────────── │ ☑  Tom · Linkup     Votre stack data        À revoir   Email  │
│ Paramètres   │ ☐  Inès · Pollen    Recrutement eng         Bloqué     Email  │
│              │ ☐  Léa · Datafold   Question rapide          Prêt       Email  │
│ [MP] Martin  │                                                               │
└──────────────┴──────────────────────────────────┬───────────────────────────┘
                                                   │ Sarah · Hexa          [×]  │ 400
                                                   │ Objet : Félicitations…     │
                                                   │ ──────────────────────────│
                                                   │ Bonjour Sarah,             │
                                                   │ Bravo pour la Série A […]  │
                                                   │ (corps de l'email)         │
                                                   │ ──────────────────────────│
                                                   │ VERDICT  Prêt              │
                                                   │ • Corps non vide      ✓    │
                                                   │ • Faits sourcés       ✓    │
                                                   │ • Pas d'opt-out       ✓    │
                                                   │ • Base légale         ✓    │
                                                   │ ──────────────────────────│
                                                   │ [Approuver] [Modifier]     │
                                                   └────────────────────────────┘
```

- **Copy** : titre `Outbound` ; action `Exporter la sélection` ; filtres verdict `Tous`, `Prêt`, `À revoir`, `Bloqué` ; sélecteur `Cible` = `Instantly` / `Fiber` / `OrangeSlice` ; colonnes `PROSPECT`, `OBJET`, `VERDICT`, `CANAL`.
- **Verdict gate** (badges Orion via `Badge`) : `Prêt` → `--color-success`/`-soft` ; `À revoir` → `--color-warning`/`-soft` ; `Bloqué` → `--color-error`/`-soft`. Le panneau détaille les checks (corps non vide, faits sourcés, opt-out, base légale) — miroir exact de `evaluateSend`.
- **Export bloqué** : un envoi `Bloqué` ne peut pas être sélectionné (checkbox désactivée + tooltip `Bloqué par le gate : <raison>`). `Exporter` n'agit que sur les `Prêt`/`À revoir` cochés.
- **Aperçu corps** : rendu via `.email-body` (en dark, fond blanc `#ffffff`, texte `#1a1a2e`, radius 6px, padding `10px 12px`).
- **Vide** : `EmptyState` `first-use`, titre `Rien à exporter`, description `Approuvez des briefs pour préparer des envois.`, action `Aller aux briefs`.
- **Confirmation export** : `Modal` taille `md`, titre `Exporter vers <Cible>`, footer `Annuler` / `Exporter`. Toast succès `N envois exportés` (`.toast-enter`).

## 5. Contraintes & QA visuelle

- **No-emoji** dans l'UI load-bearing (titres, labels, badges, boutons). Les `✓ ✗ ? ◐ ◉ ○` des mockups sont des **glyphes/icônes** (Lucide : Check, Slash, Circle, AlertCircle), pas des emoji.
- **Founder demi-écran** : tester à `680px` et `960px`, plus zoom 200%. Sous `lg`, passer en single-pane comme l'inbox : le rail liste et le panneau détail se masquent, la zone active prend toute la largeur, bouton retour `‹ Retour`. Header search rétrécit ; sidebar 240→52 (collapse).
- **Dark mode** : `.dark` sur `<html>`. Vérifier les 4 écrans en light **et** dark ; shadows navy-tintées en dark (pas de noir dur).
- **Contraste AA** : texte primaire/secondaire/tertiaire et toutes les paires industrie/séniorité respectent AA sur leurs surfaces (déjà garanti par les tokens). Re-vérifier les badges verdict sur `-soft`.
- **Focus** : `:focus-visible` → `outline: 2px solid var(--color-accent); outline-offset: 2px`. Modals trappent `Escape`. Tooltips delay 300ms.
- **Transitions** : 150ms ease-out sur hover (bordure/fond), pas de saut de couleur dur.

Comment vérifier :

1. Skill **`/design-review`** — audit senior-designer de l'UI rendue live (Playwright screenshots des états vide/chargement/erreur, narrow + wide, light + dark), cite le token/constante exact violé + détection AI-slop.
2. **DesignSync** + serveur node local sur `_design-system/` — comparer aux contact sheets (`_contact-sheet-foundations*.html`).
3. Une seule instance Playwright à la fois (règle navigateur). Screenshots séquentiels `001-…png`, finir sur une vérification propre.

## 6. Intégration

**Backend Orion (specs `_specs/orion/` + `_specs/00`…`15`).** Chaque écran lit la
même couche canonique qu'Elevay :

- **Sources** ← spec 01 (provider-adapter) + 05/06 (sourcing Apollo/registre) + 07 (identity-resolution/dedup) → compteurs `enregistrés`/`doublons`.
- **Prospects** ← 09 (icp-scoring) + signal-monitor → `priority_score` ; `signal-chip` lit `properties.signals[]` (clés canoniques `funding`, `hiring`, …) ; `confidence-badge` lit `urlOutcome`/`llmConfidence`.
- **Briefs** ← agent-service (04) + research/grounding → why-now, citableFacts, doNotClaim, angle, citations ; gate anti-fabrication alimente `NE PAS AFFIRMER`.
- **Outbound** ← `evaluateSend` (gates 22 suppression → 17 email-status → 33 base légale → 35 targeting) → `VERDICT` ; export adapters Instantly/Fiber/OrangeSlice.

**Fusion dans Elevay (jour J).** Comme Orion consomme `@orion/ui` (= les tokens +
primitives extraits d'Elevay, Option B §1), la fusion est un déplacement de
routes : les écrans Orion deviennent un groupe de routes sous le même App Router,
la même sidebar (240, sections ajoutées), le même header (44), le même `.dark`,
les mêmes `.ls-table`/`.inbox-shell`. Zéro reskin, zéro divergence de tokens, zéro
nouveau composant de base à fusionner. Si l'Option A (copie verbatim) avait été
retenue, ce jour-là imposerait une réconciliation manuelle de `globals.css` — c'est
précisément ce que l'Option B élimine.
