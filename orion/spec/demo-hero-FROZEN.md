# Orion — HERO DE DÉMO (FIGÉ)

> **Statut : FIGÉ (2026-06-28).** Le hero de démo est la **Candidate A — Brightloop**.
> Détail complet des 2 candidates + lift + prior + confounder dans `demo-hero-offers.md`.
> La Candidate B (Meter / infra-footprint) reste documentée comme **alternative**, non retenue
> (le confounder reste non concluant sur le sous-ensemble froid → reveal moins net en démo).

## Pourquoi A (et pas B)
1. **Registre Elevay.** ICP = founder-led B2B SaaS Series A–C, **FR + US** ; acheteur VP Eng ; motion founder-led. C'est le marché d'Elevay (cf Pilae).
2. **Signal dans notre catalogue.** Le signal révélé = **changement de VP Eng** = `leadership_change` (canonique `triggers.ts:27`), déjà au catalogue. Ré-acquérable à froid par **nos sources réelles** : Fiber Tracker (job-change), LinkedIn/Sales-Nav (Unipile), **BODACC / recherche-entreprises** (cibles FR).
3. **Le confounder se défait NET.** `investor_overlap` est à égalité de lift (4,2×) mais **s'effondre à 0** sur le stratum froid (`deal_source = outbound`) → le moment de démo « on a failli te vendre ton propre canal d'acquisition, on l'a rattrapé ». B ne peut pas faire ce reveal (1 seul won froid).
4. **Honnêteté du N.** 10 gagnés / 7 perdus → sortie = **hypothèse**, pas loi. Survit au prior cross-tenant (4,2× brut → **3,5× postérieur**, k=14).

## Le signal hero
- **Type** : `leadership_change.vp_eng` (alias → canonique `leadership_change` dans `taxonomy.ts`).
- **Définition point-in-time** : un nouveau VP/Head/SVP Engineering chez la cible, `role_start_date ∈ [J−90 → J]` (J = date de close pour l'apprentissage ; J = aujourd'hui pour la prospection).
- **Lift** : P(signal|won)=6/10=0,60 ; P(signal|lost)=1/7=0,14 → **≈4,2×** (postérieur ≈3,5× après prior).

## Le seed chargeable (tenant `elevay`)
À insérer dans le tenant `elevay` (vecteurs complets + `deal_source` en §1.2 de `demo-hero-offers.md`). Colonnes minimales : `company`, `domain`, `label`, `close_date`, `vp_eng_date` (null si absent / hors fenêtre), `deal_source`.

**Closed-WON (10)** — `vp_eng` présent dans 6 :
| company | close_date | vp_eng_date | deal_source |
|---|---|---|---|
| Northwind Labs | 2024-09-12 | 2024-07-18 | intro fonds Atlas |
| Pareto Systems | 2024-10-03 | 2024-08-22 | intro fonds Atlas |
| Tessellate | 2024-11-21 | 2024-09-30 | outbound |
| Halcyon Data | 2025-01-15 | 2024-11-20 | intro fonds Borealis |
| Quanta Forge | 2025-02-08 | 2024-12-12 | intro fonds Atlas |
| Meridian Stack | 2025-03-19 | 2025-01-28 | outbound |
| Cobalt Works | 2024-08-27 | — | intro fonds Borealis |
| Driftwood AI | 2025-04-02 | — | outbound |
| Lumen Grid | 2025-05-11 | — | intro fonds Borealis |
| Sable Metrics | 2025-06-04 | — | outbound |

**Closed-LOST (7)** — `vp_eng` présent dans 1 (le dénominateur) :
| company | close_date | vp_eng_date | deal_source |
|---|---|---|---|
| Vellum Coast | 2024-09-30 | — | outbound |
| Auric Loop | 2024-11-08 | — | outbound |
| Pinnacle Yard | 2024-12-17 | 2024-10-22 | outbound |
| Granite Owl | 2025-01-29 | — | outbound |
| Cinder Bloom | 2025-02-22 | — | outbound |
| Marlin Edge | 2025-03-30 | — | outbound |
| Harbor Crest | 2025-05-06 | — | intro fonds Atlas |

> Les autres colonnes de signaux (fund/hire/tech/inv/gh, datées) sont dans `demo-hero-offers.md §1.2` — à matérialiser comme `properties.signals[]` / `signal_snapshots` datés pour que le calcul point-in-time `[J−90→J]` FIRE réellement.

## Conséquences pour les lots
- **pack5 (Tier2 + sources)** : le catalogue DOIT savoir détecter `leadership_change.vp_eng` à froid via **Fiber Tracker job-change** (primaire) + **Unipile/LinkedIn** (changed-jobs) + **BODACC** (modification dirigeant, FR). L'appel re-jouable est en `demo-hero-offers.md §1.7`. Doivent aussi exister les détecteurs des signaux du seed (funding, hiring, tech_stack_change, investor_overlap, GitHub-velocity) pour que l'enrichissement point-in-time reconstruise les vecteurs.
- **pack7 (Demo + seed)** : charge ce seed dans le tenant `elevay` (insert PUIS score), pose `TARGETING_GATE_ENABLED=on`, garde 1 compte-piège `unreviewed`, et joue la restitution ci-dessous. Le hero exige que la discovery offline tourne sur l'historique uploadé (`getSignalMultipliers` à froid).
- **pilier Discovery (pack2)** : l'upload du CSV closed-won/lost déclenche l'**offline discovery point-in-time** (enrichir won+lost → reconstruire les événements datés depuis les sources horodatées → lift → filtre non-évidence × acquérabilité → prior cross-tenant). C'est le wedge day-one.

## Restitution 90s (mot pour mot, depuis §1.9)
> **[preuve]** « J'ai regardé tes deals. **6 de tes 10 clients gagnés ont changé de VP Engineering dans les 90 jours avant de signer. Côté perdus : 1 sur 7.** »
> **[confiance honnête]** « 10 contre 7, c'est petit — une **hypothèse, pas une certitude**. Ce qui rassure : sur 14 boîtes anonymisées du même profil, le motif tient. »
> **[le reveal confounder]** « Au passage : un autre signal sortait aussi fort — "même investisseur". Mais sur tes deals **froids**, il tombe à zéro : c'était ton **canal d'intro**, pas un signal de marché. Le vrai signal ré-acquérable, c'est le VP Eng. »
> **[action]** « Et je sais le guetter à froid : dès qu'un nouveau VP Eng arrive dans une boîte de ton ICP, je le vois (Fiber + LinkedIn ; BODACC pour les FR) et je te le remonte dans sa fenêtre de 90 jours. »
> **[UNE confirmation]** « Ça te parle ? »
