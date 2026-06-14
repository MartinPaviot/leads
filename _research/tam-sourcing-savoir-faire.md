# Savoir-faire — composer un TAM complet et qualitatif

Document de référence interne. Comment on source un univers de comptes
(TAM) qui soit à la fois **complet** (on ne rate aucun compte de l'ICP) et
**qualitatif** (les bons firmographics pour filtrer et scorer), pour l'ICP
Elevay/Pilae (Suisse romande, 100-1000 FTE, fondations/santé/parapublic,
trigger « SaaS remplaçable ») et le wedge francophone (FR/BE/CH/QC).

Ancré sur l'état réel du code au 2026-06-14. Voir aussi
`tam-sourcing-strategy-2026-06-14.md` (quoi construire ensuite) et la
cartographie sourcing dans la mémoire projet.

---

## 1. Les deux axes (ne jamais les confondre)

Un TAM se juge sur deux axes orthogonaux :

- **Complétude** — l'univers contient-il TOUTES les entreprises de l'ICP ?
  Se gagne avec les sources à couverture exhaustive de la géo : les
  **registres nationaux** (toute entité enregistrée) + le **graphe
  professionnel** (LinkedIn). Une DB sales US (Apollo) plafonne ici sur nos
  géos : constat documenté, Apollo romand 100-1000 FTE épuisé à ~723.
- **Qualification** — a-t-on les champs pour FILTRER (taille, secteur, stack)
  et SCORER (signaux, fit) ? Se gagne avec les **enrichisseurs firmographiques
  + technographiques** et les **signaux**.

Erreur classique : empiler des enrichisseurs (axe 2) en croyant régler un
problème de complétude (axe 1). Si Apollo ne CONNAÎT pas une fondation
romande, aucun enrichissement ne la fera apparaître. La complétude se source ;
elle ne s'enrichit pas.

## 2. Principe de sélection d'une source

Valeur d'une source = **couverture_de_TON_ICP × profondeur × fraîcheur ×
propreté_RGPD × mode_d'accès**.

On choisit une source pour boucher un **angle mort spécifique** d'Apollo sur
NOTRE ICP, pas par réflexe générique. Angles morts d'Apollo ici : non-US,
non-tech, fondations/parapublic/associations, PME suisses, fraîcheur des rôles.

## 3. Le paysage des sources (taxonomie)

### 3.1 Graphes professionnels / DB sales

| Source | Ce qu'elle fait de mieux | Couverture ICP romand | Fraîcheur | RGPD | Accès | Coût |
|---|---|---|---|---|---|---|
| **Apollo** | Volume global, firmo + emails + séquençage, **API propre** | Moyenne (plafond ~723 sur romand 100-1000) | Moyenne (rôles périment) | Données entreprise OK ; mobiles à surveiller | API propre (wiré) | inclus abo |
| **LinkedIn Sales Navigator** | **Le graphe pro le plus complet et le plus FRAIS** (rôles, changements de poste), filtres comptes riches, **lookalikes**, **graphe de relations (warm path)** | **Forte** (les pros romands, même fondations/PME, sont sur LinkedIn) | **Meilleure du marché** (profils auto-mis à jour) | Scraping = exposition ; **session du user = défendable** | **PAS d'API data sanctionnée** → CSV manuel ou session-user (Unipile) | ~80-100 €/user/mois |
| ZoomInfo / Cognism | Profondeur firmo + intent (Cognism = posture RGPD EU) | Cognism mieux qu'Apollo en EU | Moyenne | Cognism orienté conformité EU | API (payant, non wiré) | $$$ |

**Pourquoi Sales Navigator est de première classe — et pourquoi il ne se
"branche" pas comme Apollo.** C'est LA source de vérité vivante pour « qui
travaille où, à quel poste, maintenant ». Il corrige directement le problème
de fraîcheur des rôles (le cas Fabien Courvoisier « DG Afiro » listé alors
qu'il était parti — Apollo disait `current:true`). Sa couverture des pros
romands (y compris fondations/parapublic/PME) écrase celle d'Apollo. Et il
porte le **graphe de relations** = le signal le plus convertissant qui existe
(intro chaude >> cold). MAIS : **aucune API data officielle** (les API
LinkedIn Marketing/Sales sont partenaires-gated, pas d'export prospects). D'où
trois modes d'accès, par ordre de défendabilité :

1. **Liste construite à la main dans Sales Nav → export CSV → import Elevay.**
   Workflow fondateur classique, 100% légitime, **déjà supporté**
   (`app/api/import/smart/` : preview + commit). C'est le canal pragmatique
   par défaut.
2. **Via la session authentifiée DU user, par un fournisseur EU (Unipile).**
   Le compte du user, son propre réseau → bien plus défendable RGPD
   (intérêt légitime sur ses propres connexions) et c'est ainsi qu'on capte
   le **graphe de relations / warm-path**. C'est exactement le port
   vendor-neutre de la PR #213 (`connection-graph`, mock/Unipile/self-host) —
   **dormant, non mergé, rien en prod** (triple-gate). Unipile ≈ 5 €/compte/mois.
3. **Scrapers gris (PhantomBuster/Evaboot).** Violation ToS + risque ban +
   exposition RGPD. **Non recommandé comme infra produit** — incompatible avec
   notre posture no-scraping explicite (`prospect-brief-core.ts:258` : « no
   scraping — deep links into the rep's browser »).

→ Positionnement Elevay honnête : **Sales Nav = la couche fraîcheur-des-gens +
warm-path**, consommée par session-user (Unipile, EU) pour le graphe de
relations et par import CSV curé à la main pour les listes de comptes. **Jamais
un backend de scrape de masse.**

### 3.2 Registres nationaux (la colonne vertébrale de complétude)

| Source | Géo | Donne | Manque | RGPD | Accès | Coût | État code |
|---|---|---|---|---|---|---|---|
| **Zefix / LINDAS** | CH | Toute entité (canton, forme juridique → **Fondation/Association**, but, NOGA), UID | effectif, domaine, contacts | parfait (registre public) | keyless (SPARQL) | gratuit | **wiré en ENRICHISSEMENT seulement, PAS en découverte** |
| **SIRENE / INSEE** | FR | SIREN, NAF, effectif (tranche) | domaine | parfait | keyless | gratuit | wiré en découverte (FR) |
| **Pappers** | FR | wrapper SIRENE + domaine/site | — | parfait | clé API | gratuit (100/mo) | wiré en découverte (FR) |
| **KBO/BCE** | BE | registre belge | effectif fin, domaine | parfait | public | gratuit | non wiré |
| **REQ** | QC | registre québécois | idem | parfait | public | gratuit | non wiré |

Les registres sont la SEULE source à vraie complétude (chaque entité légale),
gratuits, RGPD-parfaits, et c'est l'angle mort total d'Apollo. **Zefix en
découverte** (et pas seulement en enrichissement comme aujourd'hui) est le move
le plus rentable pour la complétude romande — l'adapter existe déjà.

### 3.3 Enrichisseurs firmographiques / technographiques (qualification)

| Source | Donne | Couverture | RGPD | État code |
|---|---|---|---|---|
| Datagma | firmo EU (industrie, taille, revenu, tech) | EU | OK | wiré (geo EU) |
| Crunchbase | levées, investisseurs, stade | global (startups) | OK | wiré (signal funding) |
| Hunter | vérif domaine, tech, fondation | global | OK | wiré |
| **Technographique** (BuiltWith/Wappalyzer-class) | **quel SaaS tourne** → alimente le trigger « SaaS remplaçable » | faible sur fondations/PME à petite empreinte web | OK (données publiques web) | **non wiré** |
| BfS/STATENT | **effectif suisse fiable** (recensement officiel) → rend le filtre 100-1000 possible sur l'univers Zefix | CH | parfait | **non wiré** |

### 3.4 Enrichisseurs contacts (emails/mobiles)

Apollo + Kaspr (FR) + Lusha (FR/CH/EU), waterfall géo-routée déjà wirée.
RGPD : Kaspr = amende CNIL 240k€, loi FR consentement mobile août 2026 →
préférer une spine RGPD-clean (Dropcontact-type, **recherché non implémenté**)
pour les mobiles.

### 3.5 Source propriétaire (la plus qualitative, interne)

**L'exhaust du client** : inbox/agenda (pipeline de capture), visiteurs
inbound, CRM importé. Les boîtes avec qui le client échange déjà sont CHAUDES ;
Apollo les classe froides. Coût marginal nul, propriétaire, qualité maximale.
Move Monaco/Lightfield. Pont capture→proposition TAM **non encore construit**.

## 4. La méthode de composition (comment on les combine)

L'ordre est le savoir-faire :

1. **Colonne de complétude — registres.** Zefix (CH) + SIRENE/Pappers (FR) +
   KBO (BE) + REQ (QC) en DÉCOUVERTE → tout l'univers légal de la géo,
   filtrable canton/forme/secteur. Gratuit, RGPD-clean. (Aujourd'hui : FR oui,
   CH non — Zefix à promouvoir.)
2. **Couche vivante & chaude — Sales Nav + exhaust.** Sales Nav (session-user
   pour le warm-path via Unipile ; CSV curé pour les listes) apporte la
   fraîcheur des gens et le graphe de relations. L'exhaust client apporte les
   comptes déjà chauds. Apollo reste un contributeur volume parmi d'autres,
   plus la seule source.
3. **Couche qualification — waterfall d'enrichissement.** Sur chaque compte
   découvert : firmo (Datagma/Crunchbase/Hunter), effectif (BfS pour CH),
   technographique (trigger SaaS remplaçable), contacts (Apollo/Lusha + spine
   RGPD-clean). Saturation = stop dès industrie+description+taille.
4. **Porte humaine — file d'approbation.** Tout candidat arrive en PROPOSITION
   (`tam_proposals`), jamais inséré en silence. Dédup domaine / SIREN / UID,
   registre de suppressions durable. « La machine révèle, l'humain agit. »

Mappage au réel : étapes 1 (FR), 3, 4 existent ; CH-découverte (Zefix),
Sales-Nav/warm-path (Unipile dormant), exhaust→TAM, BfS effectif, techno =
à construire.

## 5. L'auto-construction (« Your TAM builds itself »)

Le TAM doit évoluer sur QUATRE signaux (détail dans le memo stratégie) :
1. **Événement/signal → découverte** (une boîte ICP lève/recrute/change de
   stack → entre le jour même ; détection existe, câblée au scoring seulement).
2. **Engagement → sourcing** (qui répond/booke = demande validée).
3. **Outcome → lookalike** (profil gagnant → similaires ; trainer existe,
   scoring-only ; fil vers découverte manquant). **Sales Nav lookalikes** et le
   **graphe de relations** sont des moteurs de lookalike de premier ordre ici.
4. **Décroissance → élagage** (rôle obsolète, boîte morte, N mois sans signal).

Gouvernance : outcomes > critères déclarés, MAIS via la file d'appro +
honnêteté statistique (cohort-engine : Fisher + Benjamini-Hochberg, plancher
20 deals → expérience à petit n, pas réécriture auto) + **quarantaine
referral** (les wins réseau encodent le réseau, pas le marché) + fraîcheur
visible (provenance + lastEnrichedAt par compte).

## 6. Discipline RGPD & accès (load-bearing)

- **Registres** : publics, propres, à privilégier pour la complétude.
- **Sales Nav** : jamais de scrape de masse. Session-user (Unipile EU) pour le
  warm-path ; CSV curé pour les listes. Cohérent avec la posture no-scraping.
- **Mobiles** : éviter les fournisseurs sanctionnés (Kaspr) ; spine RGPD-clean.
- **Données entreprise** (firmo) : faible sensibilité ; données personnelles
  (contacts) : base légale = intérêt légitime B2B, opt-out, suppression durable.

## 7. Récap — la pile cible

```
COMPLÉTUDE   Registres (Zefix CH, SIRENE/Pappers FR, KBO BE, REQ QC)   gratuit, RGPD-clean
   +
VIVANT/CHAUD Sales Navigator (warm-path via Unipile + CSV curé) + exhaust client
   +
VOLUME       Apollo (un contributeur, plus le seul)
   ↓ enrichissement waterfall (firmo + effectif BfS + techno + contacts RGPD-clean)
   ↓ file d'approbation humaine (proposition, dédup, suppression durable)
   ↓ auto-construction (signal/engagement/outcome/décroissance, gating honnête)
= TAM complet, qualitatif, frais, RGPD-clean, qui s'auto-entretient.
```

Edge vs Monaco (« world database of billions of data points ») : on ne
réplique pas une DB mondiale. On gagne par la complétude registre gratuite et
RGPD-clean sur NOS géos + le warm-path du graphe de relations du user +
l'exhaust client chaud + une boucle d'évolution honnête. Boil the lake sur une
géo précise bat une world-DB superficielle sur cette géo.
