# Orion — Hero de démo : 2 offres candidates + seed

> Document de décision pour le founder. Deux offres candidates complètes, chacune
> avec un seed labellisé, le calcul de lift, le prior cross-tenant, l'acquérabilité
> à froid, le script de restitution et le confounder flaggé. Les corrections de
> l'audit adversarial sont appliquées (dates par ligne + colonne `deal_source` côté
> A ; trou crt.sh avoué + jargon allégé côté B). Le founder tranche en §3.

---

## 0. Le principe (rappel)

La démo prouve une seule chose : Orion transforme un **CSV labellisé** (closed-won /
closed-lost, identité + date de close) en un **signal causal, non-évident et
ré-acquérable à froid** — pas une corrélation firmographique.

La chaîne :

1. **Upload** d'un CSV brut (identité + label won/lost + date de close `J`).
2. **Discovery point-in-time** : chaque ligne est enrichie d'un vecteur d'événements
   **datés**. Un signal ne compte que si son événement est tombé dans la fenêtre
   `[J−90 → J]` (pas un état permanent — c'est la défense contre « c'est juste une
   grosse boîte »).
3. **Lift** : `P(signal | gagné)` vs `P(signal | perdu)`, dénominateur = les perdus.
4. **Filtre** non-évidence × acquérabilité-à-froid : on jette les reformulations
   firmo et les signaux qu'on ne peut pas re-trouver sur un compte jamais touché.
5. **Prior cross-tenant** : à petit N, on rétrécit la variance avec un benchmark
   anonymisé — disponible dès le jour 1 (le wedge).
6. **Restitution** : preuve + honnêteté sur la confiance + action + UNE confirmation.

Le N est petit par construction (un vrai historique de founder). Donc partout :
**la sortie est une hypothèse à tester, jamais une loi.**

---

## 1. Candidate A (people / leadership) — corrigée

### 1.1 L'offre fictive (l'ICP qu'Orion sert)

**Brightloop** — *« La plateforme d'engineering-intelligence qui donne au VP Eng la
visibilité DORA + delivery-analytics dont il a besoin pour piloter (et défendre) son
organisation. »*

| | |
|---|---|
| **ICP** | Éditeurs B2B SaaS, Series A → C, 40–250 ingénieurs, US + FR |
| **Acheteur** | VP Engineering / Head of Engineering (économique : CTO) |
| **Motion** | Founder-led, outbound multicanal + intros investisseurs |
| **ACV** | ~45 k€ / an |

**Pourquoi un nouveau VP Eng déclenche l'achat (causal, pas corrélatif) :** un VP Eng
fraîchement nommé a (a) un mandat de transformation, (b) une fenêtre de capital
politique de ~90 jours pour faire bouger l'org, (c) un besoin immédiat de chiffrer la
delivery pour justifier réorg/headcount au board, et (d) aucune dette d'attachement à
l'outillage hérité. L'inertie « on est très bien comme ça » du prédécesseur disparaît.
Le signal n'est pas « ils sont gros » (firmo) — c'est « **le décideur vient de changer
et il achète son audit** ».

### 1.2 Le seed enrichi — événements DATÉS, point-in-time `[J−90 → J]`

> Le CSV uploadé ne contenait que **identité + label + date de close**. Les colonnes
> de signaux ci-dessous ont été **reconstruites par enrichissement daté** : chaque
> cellule porte la **date réelle de l'événement** (pas un ✓), et un événement hors
> fenêtre `[J−90 → J]` est noté `—`. La colonne `deal_source` est elle aussi issue du
> CSV/CRM (origine du deal) — elle rend le tie-break du §1.7 **exécutable**, pas narré.

Catalogue de signaux candidats :
`vp_eng` = changement VP/Head of Eng · `fund` = levée (Form D / Crunchbase) ·
`hire` = surge ≥5 postes eng (ATS) · `tech` = churn outillage CI/obs (BuiltWith-diff) ·
`inv` = investor_overlap (même fonds lead) · `gh` = spike commit-velocity (GitHub).

#### Closed-WON (N = 10)

| # | Boîte | Close `J` | `vp_eng` | `fund` | `hire` | `tech` | `inv` | `gh` | `deal_source` |
|---|-------|-----------|----------|--------|--------|--------|-------|------|---------------|
| 1 | Northwind Labs | 2024-09-12 | 2024-07-18 | — | 2024-08-05 | — | 2024-06-30 | 2024-08-20 | intro fonds Atlas |
| 2 | Pareto Systems | 2024-10-03 | 2024-08-22 | 2024-09-10 | 2024-07-29 | — | 2024-07-15 | — | intro fonds Atlas |
| 3 | Tessellate | 2024-11-21 | 2024-09-30 | — | — | 2024-10-15 | — | 2024-11-02 | outbound |
| 4 | Halcyon Data | 2025-01-15 | 2024-11-20 | — | 2024-12-05 | — | 2024-10-28 | 2024-12-22 | intro fonds Borealis |
| 5 | Quanta Forge | 2025-02-08 | 2024-12-12 | 2025-01-09 | — | — | 2024-11-20 | — | intro fonds Atlas |
| 6 | Meridian Stack | 2025-03-19 | 2025-01-28 | — | 2025-02-10 | 2025-02-25 | — | 2025-03-05 | outbound |
| 7 | Cobalt Works | 2024-08-27 | — | 2024-07-30 | 2024-06-20 | — | 2024-06-15 | — | intro fonds Borealis |
| 8 | Driftwood AI | 2025-04-02 | — | — | — | 2025-02-15 | — | 2025-03-10 | outbound |
| 9 | Lumen Grid | 2025-05-11 | — | 2025-04-02 | 2025-03-20 | — | 2025-03-01 | — | intro fonds Borealis |
| 10 | Sable Metrics | 2025-06-04 | — | — | — | — | — | 2025-05-12 | outbound |
| | **Total signal présent** | | **6** | **4** | **6** | **3** | **6** | **6** | |

#### Closed-LOST (M = 7) — *le dénominateur*

| # | Boîte | Close `J` | `vp_eng` | `fund` | `hire` | `tech` | `inv` | `gh` | `deal_source` |
|---|-------|-----------|----------|--------|--------|--------|-------|------|---------------|
| 1 | Vellum Coast | 2024-09-30 | — | 2024-08-15 | 2024-07-20 | — | — | 2024-09-05 | outbound |
| 2 | Auric Loop | 2024-11-08 | — | — | — | 2024-09-25 | — | — | outbound |
| 3 | Pinnacle Yard | 2024-12-17 | 2024-10-22 | — | 2024-11-15 | — | — | — | outbound |
| 4 | Granite Owl | 2025-01-29 | — | 2024-12-10 | — | — | — | — | outbound |
| 5 | Cinder Bloom | 2025-02-22 | — | — | 2025-01-05 | 2025-01-20 | — | — | outbound |
| 6 | Marlin Edge | 2025-03-30 | — | — | — | — | — | 2025-02-28 | outbound |
| 7 | Harbor Crest | 2025-05-06 | — | 2025-04-01 | — | — | 2025-03-15 | — | intro fonds Atlas |
| | **Total signal présent** | | **1** | **3** | **3** | **2** | **1** | **2** | |

### 1.3 Le calcul de LIFT (dénominateur = les perdus)

| Signal | P(s\|won) | P(s\|lost) | **Lift** | Verdict après filtre (§1.4) |
|--------|:---------:|:----------:|:--------:|------------------------------|
| **`vp_eng`** | **6/10 = 0,60** | **1/7 = 0,14** | **≈ 4,2×** | RETENU — causal, non-évident, ré-acquérable |
| `inv` | 6/10 = 0,60 | 1/7 = 0,14 | ≈ 4,2× | REJETÉ — confounder de SOURCING (= ton canal) → §1.7 |
| `gh` | 6/10 = 0,60 | 2/7 = 0,29 | ≈ 2,1× | secondaire — dérivé velocity, bruité à petit N |
| `hire` | 6/10 = 0,60 | 3/7 = 0,43 | ≈ 1,4× | faible lift + reformulation firmo (« ils grossissent ») |
| `fund` | 4/10 = 0,40 | 3/7 = 0,43 | ≈ 0,93× | aucun pouvoir discriminant |
| `tech` | 3/10 = 0,30 | 2/7 = 0,29 | ≈ 1,05× | aucun pouvoir discriminant |

**Le point clé :** deux signaux sont **à égalité au sommet du lift** (`vp_eng` et `inv`,
4,2×). C'est exactement le piège. Le filtre **non-évidence × acquérabilité-à-froid** les
départage (§1.7).

### 1.4 Filtre non-évidence (signaux jetés)

- `hire` (« ils embauchent en eng ») et `fund` (« ils ont levé ») → reformulations
  firmo de « ils grossissent » : pénalisés en non-évidence.
- « ils répondent vite à mes mails » → prédictif peut-être, mais **introuvable sur un
  compte froid** → écarté à l'acquérabilité.

### 1.5 Formulation honnête au N affiché (sortie = hypothèse)

> *« Sur tes 10 gagnés, 6 ont changé de VP Eng dans les 90 j avant signature ; sur tes
> 7 perdus, 1 seul — soit ~4× plus fréquent chez les gagnés. Mais 10 contre 7, c'est un
> échantillon minuscule : **un seul gagné qui bascule et le lift bouge nettement.** Je
> te le donne comme hypothèse à tester, pas comme une loi. »*

(Aucun intervalle de confiance chiffré n'est avancé : à ce N il serait faussement
précis. On parle en **sensibilité**, pas en barres d'erreur inventées.)

### 1.6 Le prior cross-tenant (rétrécir le petit N)

À 10/7 la variance est ingérable. On rétrécit avec `anonymized_signal_benchmarks`,
**tourné à froid sur l'historique uploadé** (le wedge day-one).

- **Segment apparié** : `leadership_change.vp_eng` × « B2B dev-tools / eng-intelligence,
  Series A–C » — **k = 14 tenants** (≥ seuil k-anonymat 10).
- **Benchmark population** : P(signal | won) ≈ 0,55 ; P(signal | lost) ≈ 0,18.
- **Shrinkage Beta-Binomial** (pseudo-comptes m = 10/classe) :
  - won : (6 + 5,5) / (10 + 10) = **0,575**
  - lost : (1 + 1,8) / (7 + 10) = **0,165**
  - **Lift postérieur ≈ 3,5×** — le 4,2× brut est tiré vers la valeur stable de
    population, ce qui est rassurant (le signal survit au prior).
- **Lecture honnête** : le prior réduit le risque que le 4,2× soit un artefact de
  bruit, mais ne le transforme pas en certitude. Le signal **survit** au rétrécissement
  (3,5× > 1×) → il mérite d'être testé.
- **Garde-fou produit** : le multiplicateur appliqué est **clampé [0,5 ; 2,5]**
  (`getSignalMultipliers`) → jamais zéro, jamais explosif.

### 1.7 Acquérabilité à froid + l'appel re-jouable

Le signal n'a de valeur que **re-cherchable sur un compte jamais touché**. Trois
sources :

1. **Fiber Tracker — job-change / leadership** (primaire, US + monde).
2. **LinkedIn / Sales Navigator** (via Unipile) — filtre *changed-jobs*.
3. **BODACC / recherche-entreprises** (cibles FR) — *modification des dirigeants*.

```http
GET /fiber/job-changes
  ?title_in=["VP Engineering","VP Eng","Head of Engineering","SVP Engineering"]
  &event=role_started
  &started_after=<today-90d>
  &company_filter=icp:"saas,series_a_c,eng_40_250"
→ pour chaque hit : recordCompanySignal(type="leadership_change.vp_eng",
                     fired_at=role_start_date, source="fiber")
```

- **FR fallback** : `BODACC /annonces?type=modification&objet=dirigeant&date_after=<today-90d>`
  → match dirigeant rôle technique → même `recordCompanySignal`.
- **Fenêtre** : on ne garde que `role_start_date ∈ [today−90d → today]` (point-in-time
  identique au calcul historique → pas de fuite temporelle).

### 1.8 Le confounder flaggé — `investor_overlap`, et le tie-break EXÉCUTABLE

`inv` est à égalité de lift avec `vp_eng` (4,2×). Si Orion le shippait comme « signal »,
il vendrait au founder **son propre canal d'acquisition** (les intros du fonds) déguisé
en signal de marché — inutilisable sur un compte froid (un compte jamais touché n'a, par
définition, pas d'intro).

**Le test tourne sur les données affichées** grâce à la colonne `deal_source` :

1. **Stratification sur le sous-ensemble FROID (`deal_source = outbound`).**
   - WON outbound = lignes 3, 6, 8, 10 (4 deals) ; LOST outbound = lignes 1–6 (6 deals).
   - `vp_eng` sur ce stratum : WON 2/4 (Tessellate, Meridian) vs LOST 1/6 (Pinnacle) →
     **lift ≈ 3,0× — il TIENT.** Le changement de VP existe que le deal soit intro ou non.
   - `inv` sur ce stratum : WON 0/4 vs LOST 0/6 → **il S'EFFONDRE** (pas d'intro = pas
     d'overlap). Le « signal » était collinéaire au canal, pas au marché.
2. **Conclusion live** : *« on a failli te vendre ton propre canal d'acquisition déguisé
   en insight — on l'a rattrapé. `vp_eng` est le vrai signal de marché ré-acquérable. »*

**Autres modes d'échec (vérifiés OK sur ce seed) :**
- **Survivorship / data sale** : chaque ligne a une date de close + 7 perdus → le
  dénominateur existe → pas de décote de confiance sur cet axe.
- **Signal non ré-acquérable** : écarté par construction (`vp_eng` couvert par Fiber +
  LinkedIn + BODACC, §1.7).

### 1.9 Script de restitution (mot pour mot)

> **[preuve]** « J'ai regardé tes deals. **6 de tes 10 clients gagnés ont changé de VP
> Engineering dans les 90 jours avant de signer. Côté perdus : 1 sur 7.** »
>
> **[honnête sur la confiance]** « Attention — 10 gagnés contre 7 perdus, c'est petit.
> Je te donne une **hypothèse, pas une certitude** : un gagné qui bascule et le chiffre
> bouge. Ce qui me rassure : sur 14 autres boîtes du même profil que je connais en
> anonymisé, le motif tient, donc ce n'est probablement pas du hasard. »
>
> **[action]** « Et surtout : **je sais le guetter à froid.** Dès qu'un nouveau VP Eng
> arrive dans une boîte de ton ICP, je le vois (Fiber + LinkedIn ; BODACC pour les
> françaises) et je te le remonte dans la fenêtre des 90 jours — pile quand il a le
> budget et le mandat. »
>
> **[UNE confirmation]** « Ça te parle ? »

---

## 2. Candidate B (infra / technique) — corrigée

### 2.1 L'offre fictive

**« Meter »** — infrastructure de **metering + facturation à l'usage** (catégorie
Metronome / Lago / Orb). Tu vends à des éditeurs B2B qui passent d'un pricing par siège
à un **pricing à la consommation**, ou qui **lancent un produit API/développeur**.

**Pourquoi le signal infra est CAUSAL (et pas « ICP redit ») :** on ne facture pas un
usage qu'on ne sait pas **mesurer**, et on ne mesure rien tant qu'il n'existe pas de
**surface API publique à instrumenter**. Donc l'apparition de cette surface (`api.`,
SDK, gateway, docs) est l'indicateur **avancé** de la douleur exacte que Meter résout —
le besoin naît mécaniquement *après* le mouvement infra, *avant* le go-to-market. C'est
une **nécessité logique**, pas une tendance comportementale.

> Distinct de A : autre motion (lancement produit/API vs réorg), autre signal
> (`tech_stack_change` infra vs `leadership_change`), autre source (crt.sh/GitHub/npm/
> BuiltWith/SEC vs Fiber job-change).

### 2.2 Le seed enrichi — point-in-time `[J−90 → J]`

Signal B = **`infra_footprint`** (canonique `tech_stack_change`) : apparition dans la
fenêtre d'au moins **2 sur 3** parmi — sous-domaine `api.`/`developers.` (crt.sh +
fallback §2.6) · SDK public / pic de releases (GitHub/npm) · portail docs ou
API-gateway (BuiltWith-diff). La colonne `réseau` (origine du deal) rend le tie-break du
§2.7 exécutable, comme `deal_source` chez A.

#### GAGNÉS (9)

| # | Compte | Close `J` | `infra_footprint` dans `[J−90→J]` | Autres signaux datés | Fired | `réseau` |
|---|--------|-----------|-----------------------------------|----------------------|:-----:|----------|
| W1 | Lumen Analytics | 2026-02-18 | `api.lumen…` 2025-12-20 + `@lumen/sdk` npm 2025-12-28 | funding Series A 2025-11 | OUI | réseau dev (fonds X) |
| W2 | Northwind Robotics | 2026-01-30 | `developers.northwind…` 2025-11-28 + pic releases GitHub ×5 2025-12-10 | hiring backend +4 | OUI | réseau dev (fonds X) |
| W3 | Cobalt Health | 2026-03-12 | `api.cobalt…` 2026-01-15 + Kong gateway (BuiltWith) 2026-02-01 | — | OUI | outbound froid |
| W4 | Drift Labs | 2025-12-09 | `@driftlabs/sdk` npm 2025-10-22 + `docs.` 2025-11-05 | investor_overlap (fonds X) | OUI | réseau dev (fonds X) |
| W5 | Vega Mobility | 2026-02-02 | `api-staging.`→`api.` promu 2025-12-05 + OpenAPI 2025-12-20 | funding seed | OUI | réseau dev (Discord) |
| W6 | Helix Systems | 2026-03-28 | `developers.helix…` 2026-02-10 + pic commits public repo 2026-03-01 | hiring | OUI | réseau dev (fonds X) |
| W7 | Ardent Finance | 2026-01-14 | — (API existante depuis ~2 ans, aucun delta en fenêtre) | hiring backend +3 | non | outbound froid |
| W8 | Solstice AI | 2026-02-25 | — (API-first de longue date, pas de mouvement) | funding Series B | non | inbound |
| W9 | Mirate | 2026-03-05 | — (signé sur inbound, zéro mouvement infra) | — | non | inbound |

**Wons fired = 6/9 ≈ 67 %.**

#### PERDUS (7) — le dénominateur

| # | Compte | Close-lost `J` | `infra_footprint` dans `[J−90→J]` | Fired | `réseau` |
|---|--------|----------------|-----------------------------------|:-----:|----------|
| L1 | Quanta Grid | 2026-01-20 | — | non | outbound froid |
| L2 | Beacon Retail | 2026-02-11 | — (pas une boîte API) | non | outbound froid |
| L3 | Orchid Bio | 2026-03-01 | `api.orchid…` 2026-01-05 → a pris un concurrent | OUI | outbound froid |
| L4 | Pallas Logistics | 2025-12-18 | — | non | outbound froid |
| L5 | Tessel | 2026-02-20 | — | non | outbound froid |
| L6 | Granite Works | 2026-01-28 | — | non | outbound froid |
| L7 | Verdant Energy | 2026-03-15 | — | non | outbound froid |

**Losts fired = 1/7 ≈ 14 %.** (L3 = bruit honnête : signal fired mais deal perdu —
gardé pour ne pas maquiller le dénominateur.)

### 2.3 Discrimination : lift + hypothèse honnête

- `P(signal | gagné)` = **6/9 = 0,667**
- `P(signal | perdu)` = **1/7 = 0,143** (dénominateur = les perdus)
- **Lift ≈ 4,7×**

**Hypothèse, pas loi.** N = 16. À cette taille, 6/9 vs 1/7 est **suggestif, pas
prouvé** : un seul gagné qui bascule fait passer le lift de ~4,7× à ~3,5×. Sortie = une
hypothèse testable, pas une règle de scoring figée.

**Filtre non-évidence (signaux jetés) :**
- *« ils sont API-first / Series B+ / >50 employés »* → rejeté : reformulation de l'ICP.
  Le signal n'est retenu que comme **delta daté** (la surface *apparaît* en fenêtre),
  précisément pour ne pas re-dire « c'est une boîte API ».
- *« ils répondaient vite à mes Loom / leur staging plantait »* → rejeté : prédictif
  peut-être, mais **non ré-acquérable à froid** (signal d'interaction, pas catalogable).

### 2.4 Le prior cross-tenant (le sauvetage Bayésien — wedge day-one)

Petit N ⇒ on rétrécit la variance avec `anonymized_signal_benchmarks` :

- Bucket : `industry = Dev Tools / Infra SaaS`, `size = 11–50`, `signalType =
  tech_stack_change`. Seuil k-anonymat 10 satisfait : **k = 14 tenants** contribuent.
- Base rate cross-tenant ≈ **0,31**.
- **Shrink** : le 0,667 brut du tenant est tiré vers 0,31 → **posterior ≈ 0,50**. Le
  signal **reste positif après rétrécissement** (0,50 > base 0,31) → l'hypothèse survit
  au prior, donc elle vaut d'être testée.
- **Tourné à froid sur l'historique uploadé** : pas besoin d'attendre que le tenant
  accumule des résultats — le prior est dispo dès le jour 1. C'est le wedge.

*(Une seule réf d'implémentation, pour montrer que c'est déjà câblé :
`lib/scoring/anonymized-signals.ts` — le reste de la mécanique est dans `priority-score.ts`.)*

### 2.5 Acquérabilité à froid : source + appel exact

| Sous-signal | Source | Appel concret à froid |
|---|---|---|
| Sous-domaine `api.`/`developers.`/`docs.` apparu | **crt.sh** (CT logs, gratuit) | `crt.sh?q=%25.acme.com` → diff des sous-domaines vs snapshot N−1 ; date = 1er certificat émis |
| SDK public / pic de releases | **GitHub / npm** | GitHub API `releases` + `npm registry` 1ère publication `@acme/*` ; date = `published_at` |
| Portail docs / API-gateway | **BuiltWith-diff** | apparition Mintlify / ReadMe / Kong / Apigee / OpenAPI |
| (corroboration) levée pré-annonce | **SEC / EDGAR Form D** | `Form D` filing daté finançant l'expansion GTM |

**Convergence 2+ sources exigée** (anti-bruit). Tout signal périmé est **pire qu'aucun** :
on date au certificat / `published_at`, jamais « il existe ».

### 2.6 Le trou crt.sh à AVOUER (cert wildcard) + le fallback

**Limite honnête** : si la cible utilise un **certificat wildcard `*.acme.com`**, alors
`api.acme.com` n'émet **jamais son propre certificat** dans les CT logs → **faux négatif
crt.sh**. On ne peut pas prétendre « je vois tout dans les logs de certificats ».

**Fallback (sans lequel l'acquérabilité-froid serait sur-vendue) :**
1. **DNS passif** (SecurityTrails / Shodan-like) : historique des enregistrements A/CNAME
   → date d'apparition du sous-domaine même sous cert wildcard.
2. **Résolution directe** d'une liste de sous-domaines probables
   (`api.`, `developers.`, `docs.`, `gateway.`) → existence + 1ère réponse HTTP datable.
3. **Probe OpenAPI / portail docs** : `GET /openapi.json`, `/.well-known/`, présence
   d'un portail ReadMe/Mintlify → corrobore l'ouverture de surface API indépendamment
   du certificat.

→ crt.sh reste la source la moins chère mais c'est le **point d'entrée, pas la preuve
unique** : la convergence 2+ sources (§2.5) absorbe le faux négatif wildcard.

### 2.7 Le confounder flaggé — `investor_overlap`, tie-break EXÉCUTABLE

5 des 6 wons-fired (W1, W2, W4, W5, W6) co-portent une origine **même réseau dev** (même
fonds early dev-tools, même Discord où les lancements d'API se claironnent). Risque : le
signal infra **piste ton CANAL** (tu traînes là où les lancements se voient) plutôt qu'un
motif ré-acquérable à froid.

**Le test tourne sur la colonne `réseau` :**
- **Recompute hors-réseau (`réseau = outbound froid`)** : le seul won-fired hors réseau
  est **W3 (Cobalt Health)**. → **le stratum froid est sous-doté (1 won fired)** :
  honnêtement, **on ne peut pas confirmer le signal hors réseau sur ces seules données.**
- **Conclusion live (honnête, pas maquillée)** : *« attention — 5 de mes 6 preuves
  viennent du même réseau dev. Je mesure peut-être ton canal, pas un pattern froid. Le
  test propre, je ne peux pas le faire sur ton historique seul : il faut le guetter sur
  des comptes HORS de ton réseau et voir si ça tient. C'est exactement ce que je vais
  faire en prospection. »*

C'est la version honnête du drame de A : au lieu d'un effondrement net (`inv` → 0 chez A),
B montre que **la preuve historique est concentrée sur le canal** et que la
confirmation passe par le **test prospectif à froid**.

**Autres modes d'échec :**
- **Survivorship / data sale** : OK — date de close + 7 perdus → dénominateur réel.
- **Signal non ré-acquérable** : écarté en amont (§2.3) — ne restent que crt.sh / DNS
  passif / GitHub / BuiltWith / SEC.

### 2.8 Script de restitution (mot pour mot)

> **[preuve]** « J'ai regardé tes 16 deals clos. **6 de tes 9 gagnés ont signé dans les
> ~75 jours après que la boîte a exposé une API publique — un sous-domaine `api.` ou
> `developers.` qui apparaît, un SDK publié, un portail de docs branché. Côté perdus, ça
> n'arrive que sur 1 des 7.** »
>
> **[honnête sur la confiance]** « Honnêtement, 16 deals c'est petit : un gagné qui
> bascule et le chiffre bouge. Je l'ai recoupé avec ~14 autres comptes du même profil en
> anonymisé, et même après recadrage le signal reste positif. **Et un bémol que je ne te
> cache pas : 5 de mes 6 preuves viennent du même réseau — donc je mesure peut-être ton
> canal autant que le marché. Le vrai test, c'est de le guetter hors de ton réseau.** »
>
> **[action]** « Et le mieux : je sais le guetter à froid. Je surveille les certificats
> (crt.sh), le DNS, les SDK GitHub/npm et la pile via BuiltWith. Le jour où une boîte de
> ta cible monte son `api.`, je te la remonte en haut de pile — pendant la fenêtre, pas
> trois mois trop tard. »
>
> **[UNE confirmation]** « Ça te parle ? »

---

## 3. Scorecard & reco

Arithmétique des deux seeds re-vérifiée ligne par ligne (totaux, lifts, fenêtres
point-in-time) : **les deux sont internement cohérents**. La bataille se joue sur la
*démonstrabilité* de chaque ingrédient.

| Critère (/10) | A — VP Eng | B — Infra footprint | Qui gagne |
|---|:---:|:---:|---|
| 1. Non-évidence (vrai non-firmo) | **9** | 8 | A — `vp_eng` = événement-décideur pur ; B reste corrélé à « être une boîte API » (frontière plus subtile) |
| 2. Acquérabilité-froid (source réelle) | **9** | 8 | A — job-change triangulé. B avait un trou crt.sh ; **corrigé** (§2.6 DNS passif + probe) → écart resserré |
| 3. Point-in-time (dates reconstructibles) | **9** | **9** | Égalité — A affiche désormais les dates par ligne (corrigé) |
| 4. Lift / honnêteté | **8** | **8** | Égalité — A a retiré l'IC faux-précis et parle en sensibilité, comme B |
| 5. Confounder de sourcing | **9** | 8 | A — tie-break exécutable via `deal_source` (`inv` s'effondre, `vp_eng` tient) ; B honnête mais stratum froid sous-doté |
| 6. Boucle (reveal → 1 confirm → froid) | **9** | **9** | Égalité — 4 ingrédients verbatim, fin sur « Ça te parle ? », zéro formulaire |
| 7. Seed chargeable (fire réellement) | **9** | **9** | Égalité — A désormais daté ligne par ligne ; B daté + L3 bruit honnête |
| **TOTAL** | **62/70** | **59/70** | |

> Note : avant corrections, l'audit donnait A 55 / B 58 et recommandait B. Les
> corrections demandées par l'audit (dates par ligne + `deal_source` côté A ; trou
> crt.sh avoué côté B) **renforcent surtout A** sur ses deux défauts structurels et
> **réduisent l'avantage de B** sur son seul mensonge par omission. Les deux sont
> maintenant solides sous probing.

### Laquelle claque le plus pour un jury YC

Deux lectures, le founder tranche :

- **B — « le signal d'empreinte technique »** garde le **wedge informationnel le plus
  fort** : « je le vois dans les logs de certificats des semaines avant l'annonce
  publique » = *on sait avant le marché*. Sa chaîne causale est **mécanique** (« on ne
  facture pas un usage qu'on ne mesure pas »), pas psychologique. C'est le pitch le plus
  YC sur le moat. Risque résiduel : le confounder réseau (5/6 wons) qu'on ne peut pas
  réfuter sur l'historique seul.

- **A — « le signal caché dans ton historique »** est le **meilleur véhicule pédagogique
  du raisonnement produit** : le tie-break à 4,2× (`vp_eng` vs `inv`, départagés en
  live) est le moment unique « cette équipe est rigoureuse » — *« on a failli te vendre
  ton propre canal d'acquisition déguisé en insight, on l'a rattrapé »*. Avec les
  corrections, son seed est désormais aussi chargeable et probable que B.

**Recommandation (le founder décide) :** shipper **A** comme hero si le jury va prober le
seed et la rigueur du raisonnement (A montre le filtre travailler en direct, sur les
données affichées) ; shipper **B** si le jury récompense d'abord le moat « avant le
marché » et accepte que la confirmation du confounder soit prospective. **Combinaison
idéale** : le hero retenu + greffer la mécanique de l'autre — le tie-break exécutable de
A dans B (via la colonne `réseau`), et le wedge « avant l'annonce » de B mentionné dans
A. Garder l'autre en démo de secours.

---

## 4. Le seed chargeable (pour la reco)

> Lignes exactes prêtes à insérer dans le tenant **elevay**. Format aligné sur le
> modèle Orion : chaque compte = une row deal (`outcome` + `close_date` + `deal_source`)
> et chaque événement daté = un appel `recordCompanySignal` (matérialisé en
> `signal_snapshots` / `properties.signals[]`). Les `type` sont **canoniques** (passent
> `lib/signals/taxonomy.ts`, sinon multiplier plancher 1.0× — bug `signal-score-daily`
> connu) ; chaque event est **daté** pour passer `isSignalFresh`.

### 4.1 Reco principale — Candidate B (infra)

**Deals (16) :**

```jsonc
// outcome, name, close_date, deal_source/réseau
{ "name":"Lumen Analytics",    "outcome":"won",  "close_date":"2026-02-18", "network":"fonds_x" }
{ "name":"Northwind Robotics", "outcome":"won",  "close_date":"2026-01-30", "network":"fonds_x" }
{ "name":"Cobalt Health",      "outcome":"won",  "close_date":"2026-03-12", "network":"outbound" }
{ "name":"Drift Labs",         "outcome":"won",  "close_date":"2025-12-09", "network":"fonds_x" }
{ "name":"Vega Mobility",      "outcome":"won",  "close_date":"2026-02-02", "network":"discord" }
{ "name":"Helix Systems",      "outcome":"won",  "close_date":"2026-03-28", "network":"fonds_x" }
{ "name":"Ardent Finance",     "outcome":"won",  "close_date":"2026-01-14", "network":"outbound" }
{ "name":"Solstice AI",        "outcome":"won",  "close_date":"2026-02-25", "network":"inbound" }
{ "name":"Mirate",             "outcome":"won",  "close_date":"2026-03-05", "network":"inbound" }
{ "name":"Quanta Grid",        "outcome":"lost", "close_date":"2026-01-20", "network":"outbound" }
{ "name":"Beacon Retail",      "outcome":"lost", "close_date":"2026-02-11", "network":"outbound" }
{ "name":"Orchid Bio",         "outcome":"lost", "close_date":"2026-03-01", "network":"outbound" }
{ "name":"Pallas Logistics",   "outcome":"lost", "close_date":"2025-12-18", "network":"outbound" }
{ "name":"Tessel",             "outcome":"lost", "close_date":"2026-02-20", "network":"outbound" }
{ "name":"Granite Works",      "outcome":"lost", "close_date":"2026-01-28", "network":"outbound" }
{ "name":"Verdant Energy",     "outcome":"lost", "close_date":"2026-03-15", "network":"outbound" }
```

**Signaux datés à matérialiser (les 7 lignes qui fire `infra_footprint`) :**

```jsonc
// recordCompanySignal(company, { type, fired_at, source }) — canonique tech_stack_change
{ "company":"Lumen Analytics",    "type":"tech_stack_change", "subtype":"api_subdomain", "fired_at":"2025-12-20", "source":"crt.sh" }
{ "company":"Lumen Analytics",    "type":"tech_stack_change", "subtype":"sdk_published",  "fired_at":"2025-12-28", "source":"npm" }
{ "company":"Northwind Robotics", "type":"tech_stack_change", "subtype":"api_subdomain", "fired_at":"2025-11-28", "source":"crt.sh" }
{ "company":"Northwind Robotics", "type":"tech_stack_change", "subtype":"release_spike", "fired_at":"2025-12-10", "source":"github" }
{ "company":"Cobalt Health",      "type":"tech_stack_change", "subtype":"api_subdomain", "fired_at":"2026-01-15", "source":"crt.sh" }
{ "company":"Cobalt Health",      "type":"tech_stack_change", "subtype":"api_gateway",   "fired_at":"2026-02-01", "source":"builtwith" }
{ "company":"Drift Labs",         "type":"tech_stack_change", "subtype":"sdk_published",  "fired_at":"2025-10-22", "source":"npm" }
{ "company":"Drift Labs",         "type":"tech_stack_change", "subtype":"docs_portal",   "fired_at":"2025-11-05", "source":"builtwith" }
{ "company":"Vega Mobility",      "type":"tech_stack_change", "subtype":"api_subdomain", "fired_at":"2025-12-05", "source":"crt.sh" }
{ "company":"Vega Mobility",      "type":"tech_stack_change", "subtype":"openapi",       "fired_at":"2025-12-20", "source":"probe" }
{ "company":"Helix Systems",      "type":"tech_stack_change", "subtype":"api_subdomain", "fired_at":"2026-02-10", "source":"crt.sh" }
{ "company":"Helix Systems",      "type":"tech_stack_change", "subtype":"commit_spike",  "fired_at":"2026-03-01", "source":"github" }
{ "company":"Orchid Bio",         "type":"tech_stack_change", "subtype":"api_subdomain", "fired_at":"2026-01-05", "source":"crt.sh" } // lost-fired (bruit honnête)
```

*(Les autres comptes ne reçoivent aucun event `tech_stack_change` en fenêtre — c'est
volontaire : ils ne doivent PAS fire, sinon le dénominateur est faussé. Les signaux
secondaires datés du §2.2 — funding, hiring — peuvent être chargés tels quels mais ne
portent pas le hero.)*

**Signaux que le catalogue doit savoir détecter pour CETTE démo :**
- `tech_stack_change.api_subdomain` (apparition `api.`/`developers.`/`docs.`)
- `tech_stack_change.sdk_published` / `release_spike` / `commit_spike`
- `tech_stack_change.api_gateway` / `docs_portal` / `openapi`
- (corroboration) `funding` (Form D)

**Sources sponsor appelées :** crt.sh (CT logs) · DNS passif (fallback wildcard, §2.6) ·
GitHub API + npm registry · BuiltWith-diff · SEC/EDGAR Form D.

**Champ à ajouter au modèle deal :** `deal_source` / `network` (origine du deal) — requis
pour le tie-break confounder exécutable (§2.7). C'est le seul ajout de schéma.

### 4.2 Démo de secours — Candidate A (leadership)

**Deals (17) + signaux datés** : reprendre les tables §1.2 telles quelles. Mapping
canonique : `vp_eng → leadership_change.vp_eng`, `inv → investor_overlap`,
`fund → funding`, `hire → hiring_surge`, `tech → tech_stack_change`,
`gh → commit_velocity`. Champ `deal_source` déjà présent dans la table (valeurs
`intro fonds Atlas/Borealis` vs `outbound`) → tie-break §1.8 exécutable sans ajout.

```jsonc
// exemple de matérialisation (Northwind Labs, won) — voir §1.2 pour les 17 lignes
{ "company":"Northwind Labs", "type":"leadership_change.vp_eng", "fired_at":"2024-07-18", "source":"fiber" }
{ "company":"Northwind Labs", "type":"investor_overlap",         "fired_at":"2024-06-30", "source":"crunchbase" }
{ "company":"Northwind Labs", "type":"hiring_surge",             "fired_at":"2024-08-05", "source":"ats" }
{ "company":"Northwind Labs", "type":"commit_velocity",          "fired_at":"2024-08-20", "source":"github" }
```

**Sources sponsor (A) :** Fiber Tracker (job-change) · LinkedIn/Sales-Nav via Unipile ·
BODACC (FR) · Crunchbase/Form D (corroboration `funding`/`investor_overlap`).

---

## 5. Restitution 90 secondes (séquence démo)

Le déroulé live, pour le hero retenu (exemple sur B ; substituer le signal de A si A
est choisi). Pas de slide, on pilote l'app.

1. **0:00 — Upload CSV** *(10 s)*
   « Voilà l'historique brut : 16 deals, juste le nom, gagné/perdu, et la date de close.
   Rien d'autre. Je l'envoie à Orion. »

2. **0:10 — Inférence** *(20 s)*
   Orion enrichit chaque ligne (sources datées) et calcule le lift en direct. On montre
   la table se remplir de dates, pas de coches.

3. **0:30 — « voilà ton signal que tu ne savais pas »** *(25 s — les 3 ingrédients)*
   - **Preuve** : « 6 de tes 9 gagnés ont exposé une API publique dans les ~75 j avant
     de signer. Tes perdus : 1 sur 7. »
   - **Confiance honnête** : « 16 deals, c'est petit — c'est une hypothèse, pas une loi.
     Recoupée sur 14 comptes anonymes du même profil, elle tient. Et je te le dis : 5 de
     mes 6 preuves viennent du même réseau, donc le vrai test est à froid. »
   - **Action** : « Et je sais le guetter à froid — certificats, DNS, SDK, pile techno. »

4. **0:55 — UNE confirmation** *(5 s)*
   « Ça te parle ? » — on attend le oui. Pas de formulaire.

5. **1:00 — « je le cherche à froid via X »** *(20 s)*
   On lance la recherche froide en live : `crt.sh` + DNS passif sur l'ICP, fenêtre 90 j,
   `recordCompanySignal(type="tech_stack_change", …)`.

6. **1:20 — 1 prospect froid trouvé avec ce signal** *(10 s)*
   Orion remonte **un compte jamais touché** dont le `api.` est apparu il y a 3 semaines,
   daté, en haut de pile. « Voilà — un compte que tu n'avais jamais vu, dans ta fenêtre,
   pile maintenant. C'est le pont entre ton passé et ton pipe. »

Fin sur la preuve à l'écran (le prospect froid daté), jamais sur « teste chez toi ».
