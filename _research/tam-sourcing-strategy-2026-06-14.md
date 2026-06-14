# TAM — stratégie de sources & auto-construction (2026-06-14)

Note de réflexion produit. Ancrée sur l'état RÉEL du code (cartographie
Explore 2026-06-14), pas sur de la recherche stale.

## 0. Vérité terrain (ce que fait le code aujourd'hui)

- **Découverte de comptes — chemin interactif** (`/api/tam/build` + `lib/tam-stream`,
  `icpToStrategy`) : **Apollo seul** (`searchOrganizations`).
- **Découverte — cron** (`icp/source-to-proposals`, `lib/discovery/sources.ts`) :
  Apollo + **Pappers (FR)** + **SIRENE (FR, keyless)**. Geo-affinité ["FR"] →
  ne se déclenche pas pour un ICP suisse. Sort des PROPOSITIONS (file d'appro).
- **Enrichissement firmographique** (`lib/providers/company-enrichment/waterfall`) :
  déjà multi-source géo-routé — Apollo, SIRENE (FR), **Zefix/LINDAS (CH, keyless)**,
  Datagma (EU $$), Firmable (AU), Crunchbase ($$$), Hunter ($), LLM fallback.
- **Enrichissement contacts** : Apollo + Kaspr (FR) + Lusha (FR/CH/EU).
- **Provenance** : par-RECORD (`sourceSystem`, `lastEnrichedAt`) + par-signal
  (`tamSignals`). PAS par-champ persisté (la provenance waterfall est éphémère).
- **Pas de boucle outcome→sourcing.** `company-model-trainer` (≥10 deals) ne
  nourrit que le scoring. Pas de lookalike. Refresh = TTL (temps), pas événement.
- Dropcontact / Cognism / FullEnrich = recherchés, **non implémentés**.

**Constat dur** : pour l'ICP romand 100-1000 FTE, Apollo est épuisé (~723
comptes, cf. reference_romand-leads-revenue-icp). Le mur est la COMPLÉTUDE de
l'univers, pas le scoring. Zefix (registre CH = vérité terrain de "quelles
entreprises existent en Suisse") est déjà dans le code mais SEULEMENT en
enrichissement, pas en découverte.

## 1. Quelles sources ajouter (principe + reco)

**Principe de sélection** : la valeur d'une source TAM =
couverture_de_TON_ICP × profondeur_firmo × fraîcheur × propreté_RGPD.
Apollo = fort sur la tech globale US, FAIBLE sur CH/fondations/parapublic/SMB
non-tech. On choisit les sources qui couvrent SES angles morts pour CET ICP —
pas un "ajoute Clearbit" générique.

Deux axes distincts :
- **Complétude** (ne rater aucun compte) → registres nationaux.
- **Qualification** (firmo pour filtrer 100-1000 FTE + scorer) → couche profondeur.

### Reco #1 (le quasi-no-brainer) : Zefix → source de DÉCOUVERTE
- Registre du commerce suisse via LINDAS (SPARQL). **Adapter déjà écrit**
  (`zefix-lindas-adapter.ts`) — il suffit de l'enregistrer comme `DiscoverySource`
  (le pattern SIRENE existe déjà) avec geo-affinité ["CH"].
- Donne la VÉRITÉ TERRAIN de l'univers suisse : toute entité enregistrée,
  filtrable par **canton** (romand = VD/GE/VS/FR/NE/JU), **forme juridique**
  (Fondation, Association → exactement les fondations/parapublic qu'Apollo rate),
  **but/NOGA** (secteur). Keyless, gratuit, RGPD-parfait (registre public).
- Faiblesse : registre = entités légales, pas une DB sales. Pas d'effectif, pas
  de domaine, pas de contacts. → se complète par la waterfall d'enrichissement
  existante (domaine via Pappers-like CH / recherche web, effectif via couche
  #2). Pattern identique à SIRENE qui est déjà domainless en découverte avec
  résolution de domaine à l'approbation.
- **Pourquoi c'est LE move** : un TAM qui contient chaque fondation romande
  qu'Apollo n'a pas. C'est aussi un moat — un concurrent Apollo-only ne PEUT PAS
  voir ces comptes. Coût de build quasi nul (adapter existe).
- Généralisable au wedge francophone : BE = KBO/BCE, QC = REQ, FR = INSEE/SIRENE
  (déjà câblé). Chaque marché a son registre = complétude gratuite + RGPD-clean.

### Reco #2 (la profondeur) : une couche de qualification de l'univers-registre
Le registre donne l'existence ; il manque domaine + effectif précis + tech +
intent pour filtrer "100-1000 FTE" et le trigger "SaaS remplaçable". Options,
par ordre de pertinence ICP :
- **(a) Effectif suisse fiable** : c'est le champ qui rend le filtre 100-1000
  possible sur l'univers Zefix. Pistes : données STATENT/BfS (recensement
  entreprises CH, officiel) ou un enrichisseur à forte couverture CH. Sans ça,
  Zefix donne la complétude mais pas le filtre de taille.
- **(b) Technographique** (quel SaaS tourne chez la cible) : alimente
  DIRECTEMENT le trigger "SaaS remplaçable" de l'ICP + la couche signaux.
  BuiltWith/Wappalyzer-class. Mais couverture faible sur fondations/SMB à petite
  empreinte web → fort pour la part tech de l'ICP, faible pour fondations.
- RGPD : éviter les fournisseurs de mobiles à la sanction (Kaspr = amende CNIL
  €240k ; loi FR consentement mobile août 2026). Pour les CONTACTS, spine
  RGPD-clean (Dropcontact-type) > Kaspr. Pour les COMPTES (firmo), moins
  sensible (données d'entreprise, pas personnelles).

### Reco #3 (la plus différenciante, interne) : l'exhaust du client comme graine
- La source la plus QUALITATIVE n'est pas achetée : c'est la donnée déjà
  capturée (inbox/agenda via le pipeline de capture, visiteurs inbound, CRM
  importé). Les entreprises avec qui le client échange DÉJÀ sont chaudes —
  Apollo les classe froides.
- Move Monaco ("grounded in the accounts already in your email history") +
  Lightfield. Propriétaire, coût marginal nul, qualité maximale (warm > cold).
- Mécanique : domaines récurrents dans l'inbox/agenda non encore dans le TAM →
  proposition "tu parles déjà à X, l'ajouter ?". Le pipeline de capture existe
  (captureInboundEmail) ; il manque le pont capture→proposition TAM.

**Verdict** : #1 Zefix-discovery (complétude CH, presque gratuit) + #3 exhaust
client (qualité, propriétaire) sont les deux à plus haut levier. #2 est la
couche payante à ajouter quand le filtre de taille sur l'univers-registre
devient le goulot.

## 2. "Your TAM builds itself" — sur quoi baser l'évolution

Aujourd'hui : découverte = critères ICP statiques ; refresh = TTL ; pas de
boucle outcome. Pour qu'il s'auto-construise BIEN, l'évoluer sur QUATRE signaux,
gouvernés par honnêteté statistique + appro humaine.

### Les 4 signaux d'évolution
1. **Outcome (la grande boucle manquante)** : deal gagné → extraire le profil
   gagnant (taille, canton, secteur, persona champion, signal d'origine) →
   sourcer des lookalikes → proposer dans le TAM. Deal perdu / jamais-répondu →
   dé-pondérer le segment. Le `company-model-trainer` extrait DÉJÀ les features
   (≥10 deals) ; le fil manquant = une requête lookalike vers la DÉCOUVERTE.
   GARDE-FOU (cf. cohort-engine déjà construit) : à petit n c'est une HYPOTHÈSE/
   expérience, jamais une réécriture auto de l'ICP ; **quarantaine referral**
   (les wins réseau encodent le réseau, pas le marché).
2. **Engagement (signal plus rapide que le close)** : qui a répondu / ouvert /
   booké, même sans closer → demande validée → sourcer plus comme eux. Calibre
   en semaines, pas en mois (le close p7 met ~6 mois à se calibrer).
3. **Événement/signal (fraîcheur = événement, pas seulement TTL)** : une boîte
   de l'ICP lève / recrute / change d'exec / change de stack / visite le site →
   doit DÉCLENCHER la découverte (entrer dans le TAM le jour de la levée), pas
   attendre le balayage TTL. La détection de signaux existe (+ TTL freshness que
   je viens de livrer) mais n'est câblée qu'au SCORING, pas à la DÉCOUVERTE.
4. **Décroissance/sortie** : rôle obsolète, boîte morte/rachetée, N mois sans
   engagement ni signal, exclusion dure → élaguer. role-freshness + suppressions
   existent ; le "ce compte est mort, retire-le" au niveau TAM est partiel.

### Gouvernance (le "de la meilleure des façons")
- **Outcomes > critères déclarés**, mais **toujours via proposition humaine**
  (file d'appro qui existe, ré-ouverte en prod cette session). "La machine
  révèle, l'humain agit."
- **Honnêteté statistique** : promotion d'un segment en "pondère-le à la hausse"
  seulement quand l'évidence passe la barre du moteur de cohortes (Fisher +
  Benjamini-Hochberg, plancher 20 deals) ; sinon = expérience à tester.
- **Fraîcheur visible** : provenance + `lastEnrichedAt` par compte pour que le
  fondateur voie toujours POURQUOI un compte est là et à quel point sa donnée
  est fraîche.

### Existe vs manque (chemin de build)
- EXISTE : file d'appro (ré-ouverte), refresh TTL, scoring + trainer
  (scoring-only), détection signaux + TTL, moteur de cohortes (API), suppressions,
  waterfall enrichissement multi-source, registres FR en découverte.
- MANQUE : (1) boucle outcome→lookalike→découverte, (2) signal→découverte
  (sourcing événementiel), (3) Zefix en source de découverte, (4) exhaust client
  → graine TAM, (5) cohort-engine câblé pour PROPOSER des ajustements de
  pondération ICP, (6) décroissance/élagage au niveau compte.

### Séquence proposée (petit → grand levier)
1. Zefix en découverte (S, adapter existe) → débloque la complétude CH.
2. Signal→découverte : quand un signal détecté match l'ICP sur une boîte hors
   TAM → proposition (M, réutilise détection + file d'appro).
3. Exhaust client → graine (M, réutilise capture + file d'appro).
4. Boucle outcome→lookalike (M, réutilise trainer + cohort-engine ; gating
   honnêteté + referral-quarantine).
5. Élagage par décroissance (S-M).

## 3. Cadrage vs Monaco
Monaco vend une "world database of billions of data points" pré-construite —
on ne peut pas la répliquer. Notre edge tient sur trois choses qu'eux n'ont
pas structurellement : (a) les registres nationaux = complétude gratuite et
RGPD-clean sur NOS géos (CH/FR/BE/QC) qu'une DB US couvre mal ; (b) l'exhaust
du client = comptes chauds propriétaires ; (c) une boucle d'évolution honnête
(expériences à petit n, pas de fausse précision). "Boil the lake" sur une géo
précise bat une "world DB" superficielle sur cette géo.
