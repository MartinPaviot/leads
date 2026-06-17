# Audit filtres — Accounts & Contacts par catégorie (lens GTM)

Date : 2026-06-16 · Auteur : audit code réel (pas de doc périmée)
Tenant de référence : Pilae (47dca783) — Suisse romande, 100–1000 FTE, low-tech /
fondations / santé / parapublic, motion **call-first** (Call Mode, sprints d'appels).

Légende statut :
- **[LIVE]** filtrable aujourd'hui
- **[DATA]** la donnée existe en base mais n'est PAS exposée en filtre (= le gisement)
- **[NEW]** demande une dérivation/un stockage nouveau

---

## 0. Diagnostic en une phrase

Les deux listes appliquent **le même jeu de filtres quelle que soit la catégorie**.
Un expert GTM ne filtre pas un « compte client » comme un « prospect froid » : chaque
segment du funnel = un métier différent = un jeu de filtres différent. Aujourd'hui le
stade existe comme filtre, mais **la barre de filtres ne s'adapte pas au stade**, et
80 % de la donnée GTM (récence, séniorité, statut séquence, priorité, joignabilité,
owner) est en base sans être filtrable. C'est ça « loin du compte ».

Principe directeur : **barre de filtres contextuelle par catégorie** + exposer la
donnée déjà capturée.

---

## 1. ACCOUNTS — filtres pertinents par catégorie

### Cat. A — Prospects froids / Non touchés (le tas d'attaque) — *le plus gros chez Pilae*
Définition : stade `new`, aucun deal ouvert/gagné. Job du rep : **choisir les
prochains comptes à attaquer**.

| # | Filtre | Statut | Pourquoi (GTM) |
|---|--------|--------|----------------|
| 1 | Grade de fit ICP (A+/A/B) | [LIVE] | ne travailler que le haut du panier |
| 2 | Bande de **priority score** (signal × fit × joignabilité) | [DATA] | c'est le tri de la call-queue — devrait être un filtre |
| 3 | **Signal actif** (hiring / funding / SaaS-remplaçable) + fraîcheur | [DATA] | les signaux sont des colonnes, pas des filtres |
| 4 | **Famille sectorielle** (low-tech / fondations / santé / parapublic) | [DATA] | industrie existe mais pas groupée en familles cliquables |
| 5 | **Canton / région romande** (GE/VD/VS/NE/FR/JU) | [NEW] | géo = pays seulement ; city/state en base, canton non dérivé |
| 6 | Taille 100–1000 FTE | [LIVE] | cœur d'ICP Pilae |
| 7 | **A ≥1 contact joignable** (ou « a au moins un contact ») | [DATA] | inutile d'attaquer un compte sans interlocuteur |
| 8 | **Jamais contacté** (aucune activité) | [DATA] | éviter de re-piocher, isoler le frais |
| 9 | Pas exclu / **pas déjà en séquence** | [LIVE excl.] / [DATA seq.] | anti-collision |
| 10 | Enrichi (score fiable) | [LIVE] | ne pas scorer sur du vide |

### Cat. B — Prospecting / En cours de travail
Définition : a de l'activité OU en séquence, pas de deal. Job : **tenir la cadence,
repérer les calages**.

| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Statut séquence** : en séquence / step envoyé / ouvert / répondu / bounce / fini-sans-réponse | [DATA] (`sequenceEnrollments`) |
| 2 | **Récence dernier contact** : <7j / 7–30j / >30j (calé) | [DATA] |
| 3 | **Prochaine action due / rappel planifié** | [DATA] (`tasks.dueDate`) |
| 4 | Sentiment du dernier échange (réponses positives) | [DATA] (`activities.sentiment`) |
| 5 | **Owner = moi** | [DATA] (`ownerId`) |
| 6 | Grade de fit (déprioriser le low-fit qui a glissé) | [LIVE] |

### Cat. C — Opportunity (deal ouvert)
Définition : deal ouvert. Job : **hygiène pipeline + forecast**.

| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Stade de deal** (qualification → négociation) | [DATA] (`deals.stage`, non exposé sur la liste comptes) |
| 2 | **Bande de montant** / ARR plateforme vs montant projet | [DATA] (`platformArr` / `projectAmount` — jamais sommés) |
| 3 | **Fenêtre de close** (ce mois / ce trimestre / en retard) | [DATA] (`expectedCloseDate`) |
| 4 | Owner du deal = moi | [DATA] |
| 5 | **Calé** : deal ouvert sans activité depuis N jours | [DATA] |
| 6 | Score / risque de deal | [DATA] (`deals.score`) |

### Cat. D — Customer (gagné)
Définition : deal gagné. Job : **expansion, QBR, veille churn**.

| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Expansion-eligible** : client sans deal d'upsell ouvert | [NEW dérivé] |
| 2 | Récence dernière interaction (clients dormants) | [DATA] |
| 3 | Bande d'ARR (`platformArr`) | [DATA] |
| 4 | Owner / CSM | [DATA] |
| 5 | Signal de santé (tendance sentiment) | [DATA partiel] |

### Cat. E — Nurture / Recycle (perdu ou froid)
Définition : deals perdus uniquement, ou dormance longue. Job : **timing de
ré-engagement**.

| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Raison de perte** | [DATA] (props deal) |
| 2 | Temps depuis perte / dernier contact | [DATA] |
| 3 | **Nouveau signal depuis la perte** (re-trigger) | [DATA] |
| 4 | Grade de fit (ne recycler que le bon fit) | [LIVE] |

### Cat. F — Disqualifié / Pas un fit (exclu)
| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Raison d'exclusion** (anti_icp_industry / size / do_not_contact) | [DATA] (`excludedReason` — vue existe, raison non filtrable) |
| 2 | Date d'exclusion | [DATA] (`excludedAt`) |
| 3 | Source (pour corriger la requête de sourcing fautive) | [DATA] (`sourceSystem`) |

---

## 2. CONTACTS — filtres pertinents par catégorie
*(aujourd'hui la liste n'a AUCUNE segmentation — juste « Tous » + Archive)*

### Cat. A — Par persona / rôle dans le groupe d'achat — *le manque n°1*
| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Palier de séniorité** (exec / lead-VP / manager / IC) | [DATA] (palier déjà stocké, TitleBadge) |
| 2 | **Persona** (les 13 personas ICP déjà calculés par LLM) | [DATA] (calculé au sourcing, à persister/exposer) |
| 3 | **Décideur vs influenceur vs utilisateur vs gatekeeper** | [NEW dérivé de persona/séniorité] |
| 4 | **Fonction/département** (eng, ops, finance, IT…) — via LLM, pas de liste en dur | [NEW] (pattern `matchIndustries`) |
| 5 | Pilae : « le vrai décideur de ce type d'org » (SG pour fédérations, DG pour fondations) | [NEW persona-aware] |

### Cat. B — Par engagement / statut relationnel
| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Jamais contacté** | [DATA] |
| 2 | **Statut séquence** (en séquence / envoyé / ouvert / répondu / bounce) | [DATA] (`sequenceEnrollments`) |
| 3 | **A répondu / réponse positive** (conversation vivante) | [DATA] |
| 4 | **RDV booké / réalisé** | [DATA] (`activities`) |
| 5 | **Refroidi** (a répondu puis silence > N jours) | [DATA] |
| 6 | **Lead entrant** (est venu à nous) | [NEW] (isInboundLead — persistance = tranche 3 non faite) |

### Cat. C — Par joignabilité (le motion d'appel) — *Tier 1 pour Pilae*
| # | Filtre | Statut |
|---|--------|--------|
| 1 | **A un mobile composable** (vs fixe vs aucun) | [NEW] (phone = champ unique, type non distingué) |
| 2 | A un email vérifié / délivrable | [DATA partiel] (présence oui, délivrabilité non suivie) |
| 3 | A un LinkedIn | [LIVE] (présence) |
| 4 | **Sans numéro → alimente « Trouver le mobile »** | [LIVE partiel] (phone=empty existe) |

### Cat. D — Par contexte du compte
| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Contacts dans des comptes A+/A** seulement | [DATA] (score société, pas un filtre contact) |
| 2 | Contacts dans des comptes d'un **stade donné** (prospects vs clients) | [DATA] |
| 3 | Famille sectorielle de leur société | [LIVE] (industrie en filtre colonne) |
| 4 | **Géo (canton/région) de la société** | [NEW] (pays en base, région non exposée) |
| 5 | Bande de taille de la société | [DATA] |

### Cat. E — Hygiène / conformité
| # | Filtre | Statut |
|---|--------|--------|
| 1 | **Poste obsolète** (« a quitté ce poste ») | [DATA] (`roleObsoleteAt`) |
| 2 | **Do-not-contact / opt-out** | [DATA] (`emailOptouts` / `meetingOptOuts`) |
| 3 | Owner = moi | [DATA] (`ownerId`) |
| 4 | Source (engine / CSV / inbound) | [DATA] (`sourceSystem`) |
| 5 | Donnée périmée (`lastEnrichedAt` > X mois) | [DATA] |

---

## 3. Filtres transverses dont LES DEUX listes ont besoin
- **Owner / « À moi »** (`ownerId` existe partout — déjà noté comme reste dans ownership)
- **Récence de dernière interaction** comme filtre de 1ère classe (pas juste une colonne)
- **Source granulaire** (engine / CSV / inbound / manuel — `sourceSystem`, aujourd'hui seulement tam/manual)
- **Fraîcheur donnée** (`lastEnrichedAt`)
- **Chemin d'intro chaud** (warm paths — existe en API, pas en filtre)

---

## 4. Recommandation de priorité (motion call-first de Pilae)

**Tier 1 — débloque la routine d'appel quotidienne (à construire en premier) :**
1. Contacts : **persona/séniorité** + **joignabilité (a un mobile)** + **jamais-contacté/récence** → c'est LA call list.
2. Accounts : **bande de priority-score** + **signal actif** + **a-un-contact-joignable** + **jamais-contacté** → le tas d'attaque.
3. Les deux : **Owner = moi / « À moi »**.

**Tier 2 — pipeline & motion :**
4. Accounts : **stade / montant / date de close** sur la catégorie Opportunity.
5. Les deux : **statut séquence** (en séquence / répondu / bounce).
6. Les deux : **récence dernière interaction** comme filtre.

**Tier 3 — hygiène & raffinement :**
7. Géo → canton/région (romandie).
8. Familles sectorielles en pills (pas valeurs d'industrie brutes).
9. Poste obsolète + do-not-contact + source granulaire + fraîcheur.

**Point structurel** : passer d'une barre de filtres unique à une **barre contextuelle
par catégorie** — en « Opportunity » elle expose stade/montant/close ; en « Prospects
froids » elle expose signal/priorité/joignabilité. C'est le vrai saut.
