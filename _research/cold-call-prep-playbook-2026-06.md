# Playbook Cold Call — Méthodologie complète de préparation

Objectif unique de campagne : decrocher un rendez-vous de 45 minutes, permission-based, par industrie.
Date : 2026-06-08. Sources : recherche web 2025-2026 (Gong 300M appels, Nooks, 30MPC, Cognism, Focus Digital, Orum, etc. — liste en fin de document).
Toutes les statistiques sont sourcees. Pas de superlatif, que des chiffres et des process reproductibles.

---

## 0. Cadrage : ce que veut dire "RDV 45 min permission-based"

Deux sens de "permission", ne pas les confondre :

1. **Permission d'ouverture** (pendant l'appel) : on demande l'autorisation de continuer 30 secondes au lieu d'enchainer un pitch. C'est l'opener permission-based.
2. **Permission de l'engagement** (le closing de l'appel) : on ne force pas un slot de 45 min, on donne le controle au prospect et une porte de sortie. Le RDV est "consenti", pas "arrache".

**Pourquoi 45 min et pas 15/30 ?** Les appels de decouverte qui finissent en closed-won durent en moyenne 30-40 min ; les sessions a valeur (audit, diagnostic, benchmark) tournent a 45-60 min (Winning by Design, Cognism). Un ask de 45 min n'est credible **que si la reunion delivre de la valeur en soi**, independamment de la vente. Donc :

- On ne vend jamais "un call de 45 min pour qu'on vous presente notre solution" (personne ne donne 45 min pour ca).
- On vend une **seance de travail / diagnostic / benchmark** dont le prospect repart avec un livrable, meme s'il ne signe jamais.
- On donne une **porte de sortie** explicite ("dans les 10 premieres minutes vous saurez si ca vaut la suite").

Regle structurante : **le CTA de l'appel ne demande pas 45 min tout de suite.** Il valide d'abord l'interet ("est-ce que ca vous parle ?"), puis cadre la seance de 45 min avec agenda + sortie de secours. (30MPC : "Interest-Based CTA" avant la demande de reunion.)

---

## 1. Les 5 chantiers de preparation (vue d'ensemble)

| # | Chantier | Question a laquelle il repond | Livrable | KPI de controle |
|---|----------|-------------------------------|----------|-----------------|
| 1 | **La Liste** | Qui appeler, dans quel ordre | Call list enrichie + scoree A/B/C | % comptes avec declencheur < 90 j |
| 2 | **Le Numero** | Comment les joindre, sans etre flague spam | Infra d'appel (data mobile verifiee + numeros reputes + composeur) | Connect rate / dials par connect |
| 3 | **La Connaissance** | Pourquoi eux, pourquoi maintenant | Brief d'appel 1 page par compte | % appels avec accroche contextuelle |
| 4 | **L'Approche** | Comment le dire (voix + psychologie) | Regles de tonalite + cadre objections | Talk/listen ratio, taux de RDV/connect |
| 5 | **Le Script** | Quoi dire, mot pour mot | Script modulaire personnalise par industrie | Taux opener->conversation->RDV |

Les 5 se compilent en **un brief d'appel d'une page** (section 11) + **un script modulaire** (section 6). Le reste du document detaille chaque chantier.

---

## 2. CHANTIER 1 — LA LISTE (qui appeler)

La qualite de la liste explique plus de variance que le script. Top teams atteignent 5-8 % dial->RDV "en combinant meilleure data et meilleurs talk tracks" (SalesHive). Une mauvaise liste plafonne le meilleur script.

### 2.1 ICP et segmentation
- Definir l'ICP par **firmographie** (secteur/NAF, taille FTE, CA, geo), **persona** (titres exacts du decideur + de l'influenceur), et **declencheur** attendu.
- Segmenter en **tiers** : Tier A (ICP + declencheur chaud), Tier B (ICP sans declencheur), Tier C (adjacent). On ne traite pas A et C avec la meme cadence ni le meme script.

### 2.2 Declencheurs (trigger events) = le "pourquoi maintenant"
Le declencheur donne la raison d'appeler aujourd'hui ; l'intent donne le sujet. Empiles, ils font un compte haute-priorite (Autobound). Declencheurs courants : levee de fonds, vague de recrutement (surtout sur les postes lies a votre douleur), changement de dirigeant, nouvel outil installe/retire, ouverture de site, fusion/acquisition, publication de resultats, appel d'offres.
- **Mentionner un declencheur rend l'appel 2,1x plus susceptible de booker** (raison d'appel explicite, Gong/Nooks). Le declencheur EST l'accroche de l'opener.

### 2.3 Sources de donnees (firmographie + contacts)
- **Europe / francophone** : Cognism (200M+ contacts EU, le plus fort en mobile verifie et conformite RGPD ; a rachete Kaspr, data FR), Kaspr (FR). 
- **Volume / US + EU** : Apollo (large mais precision telephone ~40 %, a re-enrichir), ZoomInfo (fort US, plus faible EU/compliance).
- **Sources publiques francophones gratuites** : recherche-entreprises.api.gouv.fr (FR : NAF, dept, effectif), Zefix/LINDAS (CH : UID, canton, but social). Identite d'entreprise fiable, mais sans telephone direct.
- **Orchestration / enrichissement** : Clay (waterfall multi-fournisseurs : on interroge le moins cher d'abord, on tombe sur le suivant si vide ; pull des signaux/declencheurs automatiquement).

### 2.4 Scoring et priorisation
Score = fit ICP (0-100) x presence de declencheur (x2 si < 30 j) x joignabilite (mobile verifie dispo ?). On appelle dans l'ordre du score. **Ne jamais composer une liste a froid non triee.**

### 2.5 Hygiene de liste
- Verifier les numeros AVANT d'appeler (un numero mort = un dial perdu + risque reputation).
- Suppression list : ne jamais re-sourcer un compte exclu/clos (traçabilite, conformite, et respect du prospect).
- Re-fraicheur : la data telephone se degrade ; re-verifier les Tier A toutes les 4-8 semaines.

**Livrable chantier 1 :** une call list ou chaque ligne porte : entreprise, persona, **mobile verifie**, declencheur date, score, et 1 phrase d'accroche pre-redigee.

---

## 3. CHANTIER 2 — LE NUMERO (les joindre sans etre flague)

C'est le chantier le plus sous-estime. Un excellent script sur une mauvaise infra telephonique ne connecte jamais.

### 3.1 Type de numero appele : mobile >> ligne directe >> standard
Donnees 2025 (eMarketNow, Cognism, coldcallbenchmarks) :

| Type de numero | Dials pour 1 connect | Note |
|----------------|----------------------|------|
| Standard / accueil (main line) | ~19 | Le pire : on tombe sur un gatekeeper/IVR |
| Ligne directe (desk) | ~13 | Mieux, mais souvent renvoye |
| **Mobile professionnel** | **chiffre a un seul digit** quand la data est propre | +61 % de connexion vs lignes fixes ; jusqu'a 7x plus efficace que le standard |

- **Mobile = +45 a +61 % de connect** vs non-mobile.
- **Precision de la data** : mobile phone-verifie = 87 % de justesse ; verification IA jusqu'a 98 % (Cognism Diamond Data). Sur data verifiee, connect rate 18-22 % vs 8-12 % sur data generique. **L'ecart de precision entre fournisseurs atteint ~30 points.** C'est l'investissement #1.

### 3.2 Reputation du numero EMETTEUR (eviter "Spam Likely")
Depuis STIR/SHAKEN (authentification operateur, applique par les carriers), tout appel mal authentifie demarre "suspect" (SalesHive, Nextiva, PhoneBurner). Declencheurs algorithmiques de flag : pics de volume, duree moyenne d'appel < 30 s, schemas de neighbor-spoofing.

A mettre en place :
- **Enregistrer ses numeros aupres des carriers** (#1 priorite) + viser une **attestation A** STIR/SHAKEN aupres de l'operateur/plateforme.
- **Branded Caller ID** (afficher le nom de l'entreprise) : +80 % de taux de reponse dans les cas cites.
- **Plafond ~75 appels/jour/numero** ; au-dela, la reputation se degrade. Donc **rotation de plusieurs numeros** pour repartir le volume.
- **Local presence** : numero d'emission au meme indicatif regional que le prospect (augmente le decroche), a utiliser sans abuser (sous surveillance accrue des carriers).
- **Monitorer la reputation** et "remedier" (changer) un numero flague avant qu'il plombe la campagne.

### 3.3 Le composeur (dialer)
| Type | Debit | Quand |
|------|-------|-------|
| Single-line | 1 appel a la fois | Comptes Tier A a fort enjeu, recherche profonde |
| Power dialer | sequentiel, 1 par 1 mais automatise | Volume moyen, conserve la qualite |
| **Parallel dialer** | 2-4 numeros simultanes, connecte au 1er decroche, **125+ dials/h** | Volume eleve (60-150+ dials/j/rep), prospection Tier B/C |

Benchmarks fournisseurs : Orum (pick-up moyen ~5,3 %), Koncert, Nooks. Les equipes "AI SDR + parallel dialing + deliverabilite" rapportent 15-18 %+ de connect-to-meeting (a prendre avec prudence, chiffres editeurs).

### 3.4 La technique du double-dial
Rappeler dans les 15-60 s si pas de reponse. Une etude : 16 % de decroche en 1 appel vs **60 % en 2 appels rapproches**, sans agacement note. A cadencer (pas plus de 2x), reserve aux Tier A.

### 3.5 Conformite FR / CH / EU (a verrouiller AVANT de composer)
- **B2B en France** : pas d'opt-in. La prospection entre professionnels reste possible **sans consentement prealable**, sur base de l'**interet legitime** RGPD, a 3 conditions : interet legitime reel et proportionne, **lien entre l'offre et la fonction** du contact, et **traçabilite de la source + base legale** documentee (chaque contact rattache a une source claire). (economie.gouv.fr, CNIL, Nomination.)
- **B2C en France** : bascule en **opt-in strict au 11 aout 2026** (loi du 30 juin 2025) ; **Bloctel disparait** (remplace par l'interdiction par defaut). Ne concerne pas le B2B mais attention aux pros en nom propre / TPE assimilables a des particuliers.
- **Suisse** : LCD art. 3 (clause de l'asterisque dans l'annuaire = ne pas demarcher), nLPD pour la data. B2B tolere mais respecter les oppositions.
- **Horaires** : rester sur les heures ouvrees professionnelles ; documenter les demandes de ne plus etre appele (opt-out immediat).

**Livrable chantier 2 :** infra = data mobile verifiee + pool de numeros enregistres/brandes en rotation (<75/j chacun) + composeur adapte au tier + regle double-dial + registre de conformite (source/base legale/opt-out).

---

## 4. CHANTIER 3 — LA CONNAISSANCE (recherche pre-appel)

Objectif : pouvoir dire en 1 phrase **pourquoi EUX et pourquoi MAINTENANT**. C'est ce qui transforme un opener "canned" en accroche contextuelle (les seuls openers gagnants mènent par le contexte, 30MPC/Gong).

### 4.1 Le cadre "3 angles en 3 minutes" (ou brief IA)
Trois niveaux a couvrir avant de composer :
1. **Entreprise** : declencheur recent (levee, recrutement, lancement, M&A, resultats), priorite affichee (site, communique, rapport annuel), stack/outils (offres d'emploi = signaux d'outils et de douleurs).
2. **Persona** : role exact, ce dont il est redevable (KPI), son anciennete (nouveau dans le poste = fenetre d'ouverture), son parcours LinkedIn.
3. **Declencheur -> douleur** : relier le signal a une douleur que vous adressez ("vous recrutez 5 commerciaux -> rampe d'onboarding -> ...").

### 4.2 Checklist de recherche (a remplir dans le brief)
- [ ] Declencheur date + source (URL)
- [ ] 1 priorite business de l'entreprise (citation/preuve)
- [ ] Outil/process actuel probable sur votre categorie (offre d'emploi, techno detectee)
- [ ] Le KPI dont le persona est responsable
- [ ] 1 pair/concurrent comparable que vous servez (pour l'opener "heard the name")
- [ ] L'accroche d'ouverture, redigee mot pour mot (1 phrase)
- [ ] Le probleme "triggering" a peindre (section 6.2)

### 4.3 Automatisation IA (pertinent pour industrialiser)
- **Brief pre-appel genere par LLM** : on injecte data enrichie + notes + signaux, sortie structuree et scannable (bullets, sections) pour que le rep extraie l'essentiel en 30 s (Databar, Apollo).
- **Clay** : pull automatique signaux/declencheurs + enrichissement.
- **Hyperbound** : generer un bot-persona depuis un profil LinkedIn (1 clic) pour s'entrainer sur le compte avant l'appel ; scorecards IA sur 100 % des appels reels (integration Gong/Salesloft/Chorus).

**Livrable chantier 3 :** un brief 1 page par compte Tier A (Tier B/C : version condensee auto-generee).

---

## 5. CHANTIER 4 — L'APPROCHE (voix + psychologie)

Le "comment on le dit" pese autant que le "quoi". Gong : top-quartile connecte 13,3 % vs 5,4 % moyenne.

### 5.1 Principes
- **Contexte d'abord** : mener par une info sur EUX avant de se presenter. Les 2 openers gagnants (Gong, 300M appels) le font.
- **Probleme avant pitch** : peindre une douleur vive et specifique avant la solution (30MPC : "Problem Proposition").
- **Conversation, pas monologue** : decouper le pitch en morceaux qui appellent une reaction (ce que font les humains).
- **Talk/listen** : le rep doit parler **< 45 %** du temps ; le prospect > 55 %.

### 5.2 Tonalite — le framework PAVP (Pitch, Allure/pace, Volume, Prononciation)
Mecanique entrainable, pas un "etat d'esprit". Donnees Gong Labs (300M+ appels) : les tops **parlent ~14 % plus lentement** et utilisent **+38 % d'inflexions de tonalite assuree** que les sous-performants.
- **Pitch** : affirmations qui **descendent** en fin de phrase. L'uptalk (montee = question) fait douter.
- **Allure (pace)** : viser **140-160 mots/min**. Les nerveux accelerent ; les surs ralentissent.
- **Volume** : demarrer un peu plus fort pour capter, puis adoucir pour installer la confiance.
- **Prononciation** : articuler sans sur-jouer.
Un seul levier mal regle peut couter la moitie des RDV ; en isoler un et le travailler 2 semaines suffit a deplacer la perf.

### 5.3 Gestion des objections
Deux ecoles complementaires :
- **Mr. Miyagi (30MPC)** : la plupart des objections sont une **reaction a l'interruption**, pas un rejet du produit. 3 temps : (1) **donner raison** ("c'est legitime..."), (2) **creuser** par une question facile, (3) **vendre le test-drive** (l'exploration, pas le produit).
- **Josh Braun** : **nommer l'elephant**, labelliser le negatif pour le desamorcer, passer de "vendeur" a "scientifique", de "parler" a "ecouter". Une objection est une **occasion de decouvrir la verite**, pas un mur a "casser".
- **A ne jamais dire** : "Je vous prends a un mauvais moment ?" -> **2,15 %** de reussite (le pire opener, Gong) ; tue le taux de RDV de ~40 %.

---

## 6. CHANTIER 5 — LE SCRIPT (mot pour mot, modulaire)

Structure complete d'un appel. Chaque bloc est un module ; on personnalise les variables [entre crochets] par compte et par industrie (section 7).

### 6.1 Opener (3-5 s, contexte d'abord)
Deux variantes data-backed (Gong : "heard the name" 11,24 %, permission-based 11,18 % ; vs "mauvais moment" 2,15 %).

**A. Permission-based contextuel** (le plus polyvalent)
> "Bonjour [Prenom], [Nom] de [Societe]. Je vous appelle a froid, je l'assume. J'ai vu [declencheur : que vous ouvrez un site a Lausanne / que vous recrutez 5 commerciaux / que vous migrez de X]. C'est exactement pour ca que j'appelle. Vous me donnez 30 secondes et vous me dites si ca vaut la peine de continuer ?"

**B. "Heard the name tossed around"** (quand on sert des pairs visibles)
> "Bonjour [Prenom], [Nom] de [Societe]. On travaille pas mal avec des [pairs : DAF de PME industrielles romandes, comme X et Y]. Mon nom vous dit quelque chose ?"
> - Si non : "Ah, je me croyais plus connu. Bon, la vraie raison de mon appel..."
> - Si oui : "Normalement on devrait deja bosser ensemble. Vous avez entendu quoi ?"

Regles : nommer la **raison d'appel** (x2,1 de chances de RDV) ; citer une **connexion commune** si possible (+70 %) ; **jamais** "c'est un mauvais moment ?".

### 6.2 Problem Proposition (le coeur)
Trois temps (30MPC) :
1. **Probleme declencheur** : peindre une scene precise et visualisable (qui, ou, quel moment, quelle emotion). "La plupart des [persona] que j'appelle me decrivent ca : [scene concrete et douloureuse]."
2. **Solution en une phrase** : "Nous, on [verbe differenciant] pour que [le probleme disparaisse]."
3. **Micro-CTA d'interet** (PAS encore la reunion) : "Ca vous parle, ou vous etes deja au point la-dessus ?"

### 6.3 L'ask du RDV 45 min (permission-based)
Seulement APRES un signal d'interet sur le micro-CTA :
> "Voila ce que je propose, et ce n'est pas un pitch : **45 minutes en mode seance de travail**. On [diagnostique X / on benchmarke votre [KPI] contre 20 boites comparables / on cartographie Z]. Vous repartez avec [livrable concret : un audit chiffre, un comparatif, une cartographie] **meme si on ne bosse jamais ensemble**. Et tres honnetement, dans les 10 premieres minutes vous saurez si ca merite la suite. Je vous bloque ca **mardi 14h ou plutot jeudi matin** ?"

Pourquoi ca tient 45 min : c'est cadre comme **valeur livree au prospect** (audit/benchmark/diagnostic), avec **agenda implicite**, **porte de sortie** ("vous saurez en 10 min"), et **choix binaire** de creneau (reduit la friction de calendrier).

### 6.4 Banque d'objections (Miyagi + Braun) — FR
- **"Envoyez-moi un mail"** : "Avec plaisir. Pour ne pas vous envoyer un PDF generique de plus, une question rapide : aujourd'hui, [question facile/qualifiante] ?" (la mini-question baisse la garde et relance la dynamique — Close.com.)
- **"Pas le temps / je suis en reunion"** : "Je comprends, je tombe en plein truc. Deux options : 30 secondes maintenant pour voir si ca merite qu'on se reparle, ou je vous rappelle [creneau precis]. Vous preferez quoi ?"
- **"Pas interesse" (tot dans l'appel)** : "C'est totalement legitime, vous ne me connaissez pas. La plupart des [persona] me disent pareil les 10 premieres secondes... puis realisent que [probleme]. Je vous laisse juge : [probleme], ca vous parle oui ou non ?"
- **"On a deja un outil / fournisseur"** : "Logique, vous ne seriez pas [titre] sans avoir regle ca. La plupart de ceux qu'on aide avaient deja [categorie] ; ce qui les a fait bouger, c'est [angle differenciant]. Ca vaut 45 min pour mesurer l'ecart, ou vous etes deja au top sur [metrique] ?"
- **"C'est quoi le prix ?"** : "Ca depend de [variable] — c'est justement une des choses qu'on cadre dans la seance. Pour vous donner un chiffre qui veut dire quelque chose : [question de cadrage] ?"

### 6.5 Closing live (anti no-show — voir section 8)
> "Parfait. **Je vous envoie l'invitation la, maintenant, pendant qu'on est au telephone.** Vous me confirmez que vous l'avez recue ? L'objet sera clair et il y aura l'agenda en 3 points."

### 6.6 Messagerie vocale (8-14 s, max 2 par prospect)
Les voicemails fonctionnent surtout comme **amorce multicanale** (Gong : reply email passe de 2,73 % a 5,87 % avec voicemail) ; callback direct ~4,8 %. Garder < 30 s, idealement **8-14 s** ; personnalise = +41 % de callback ; **3 voicemails ou plus font CHUTER** le reply email a 2,2 %.
> "[Prenom], [Nom] de [Societe]. Je vous appelle au sujet de [declencheur/probleme precis]. Je vous renvoie un mail, mais rappelez-moi au [numero] si [probleme] est un sujet chez vous. Bonne journee."

### 6.7 Gatekeeper (standard/accueil)
Ne jamais pitcher le gatekeeper. Ton calme, bref, assure (= signale un appel attendu, pas une vente) :
> "Bonjour, vous pourriez m'aider ? Je cherche a joindre [Prenom Nom], c'est au sujet de [sujet precis non-commercial : leur projet X / un point sur Y]. Vous me le passez ?"
Le silence apres la demande pousse le gatekeeper a transferer (reponse par defaut). Brievete + autorite > supplication. (Cognism, Mr Inside Sales, Prospeo.)

---

## 7. PAR INDUSTRIE — la matrice d'adaptation

Important sur les chiffres : la colonne "conv. vente" ci-dessous vient de Focus Digital (taux appel->VENTE 2025) et sert de **proxy de difficulte relative** par secteur — ce n'est PAS le taux dial->RDV (qui, lui, tourne autour de 2,5 % en moyenne et 5-8 % top performers, tous secteurs confondus). Plus la conv. vente est basse, plus le cycle est long/technique et plus il faut de volume + de personnalisation pour booker.

| Industrie | Persona cible | Douleur / declencheur dominant | Angle d'accroche | Timing / canal | Sensibilite & conformite | Conv. vente (proxy difficulte) |
|-----------|---------------|-------------------------------|------------------|----------------|--------------------------|-------------------------------|
| **Tech / SaaS** | VP Sales/Eng, RevOps, fondateur | Efficience GTM, churn, scaling ; levee, recrutement eng, changement de stack | Tres factuel, vocabulaire metier, zero fluff ; "fit dans la stack existante" | Eviter lundi ; multicanal indispensable (acheteurs async) | Faible | **0,95 %** (~105 appels/vente) — le plus dur |
| **Industrie / Equipement / Machines** | Dir. usine, achats, dir. ops, dirigeant PME | Productivite, maintenance, penurie main d'oeuvre, couts | Concret, ROI operationnel ; **valorisent l'appel direct** | Tot le matin (avant production) ; **telephone fort**, peu digital | Faible | **0,88 %** (~114) — le plus dur du panel |
| **Sante / Medtech / Pharma** | Dir. etablissement, achats, medecin-chef, DSI sante | Budget contraint, conformite, charge administrative ; nouvel equipement, appel d'offres | Prudence, preuve, **jamais sur-promettre** ; parler conformite/securite | Cycle long, multi-acteurs ; voix + email | **TRES forte** : donnees de sante = RGPD art. 9 ; procedures d'achat hospitalieres | 1,12-1,21 % (~83-89) |
| **Services financiers** | DAF, dir. financier, risk/compliance | Cout, risque, reglementation, reporting | Autorite et serieux ; references comparables ; chiffres | Tot le matin ; voix | **Forte** : secret bancaire (CH), MiFID, enregistrement d'appel encadre (consentement) | **1,54 %** (~65) |
| **Assurance** | Dir. agence, souscription, courtage | Volume, conversion, conformite distribution | Performance commerciale, conformite DDA | Voix + relance | Forte (DDA, data clients) | **2,12 %** (~47) |
| **Distribution / Retail / Negoce** | Dir. achats, dir. magasin/e-comm | Marge, stock, omnicanal | Impact marge/CA concret | Hors heures de pointe magasin | Moyenne | ~2,5 % |
| **Services pro & business services** (RH, paie, conseil, marketing) | Dirigeant, DRH, DAF | Temps, croissance, couts | Gain de temps + ROI rapide | Souple ; multicanal | Faible | **2,22-2,61 %** — les plus accessibles |
| **Secteur public / parapublic / fondations** | Secretaire general, resp. achats, direction | Budget contraint, procedures (marches publics), mission/efficience | Efficience + conformite + mission ; **ton non agressif** | Cycle tres long, multi-parties ; voix + ecrit formel | Marches publics (seuils, appels d'offres) ; pas de "vente pression" | Variable, cycle long |

### 7.1 Adapter le script par industrie (les 2 variables qui changent)
Seuls **l'opener (contexte)** et **le probleme declencheur** changent vraiment ; la mecanique (permission, problem prop, ask 45 min, objections) reste.

- **Industrie/Manufacturing** : opener tot le matin, ton direct, probleme = "ligne a l'arret / piece manquante / equipe qui tourne a vide". Le telephone est ICI le meilleur canal (ces acheteurs valorisent le contact direct).
- **SaaS/Tech** : opener ultra-precis (declencheur techno reel), probleme = metrique GTM chiffree ; la moindre approximation de vocabulaire vous disqualifie.
- **Sante/parapublic** : opener sobre, probleme = charge administrative/conformite/budget ; ne jamais sur-vendre ; cadrer la seance 45 min comme "diagnostic conforme aux procedures".
- **Finance/assurance** : opener avec reference comparable (autorite), probleme = cout/risque/reporting ; verrouiller la conformite enregistrement.

### 7.2 Note specifique a ton ICP (Suisse romande, 100-1000 FTE, low-tech / fondations / sante / parapublic, declencheur "SaaS remplacable")
- Le coeur de cible (fondations, parapublic, sante, low-tech romand) est **cycle long, multi-acteurs, peu digital** : le **telephone direct y a un avantage** (ces segments valorisent le contact humain plus que les acheteurs SaaS).
- L'accroche "SaaS remplacable" est un **declencheur de douleur concret** : opener = "j'ai vu que vous utilisez [outil X] ; la plupart des [persona] romands qu'on appelle le gardent par inertie alors qu'ils paient [douleur]...".
- Conformite : B2B = interet legitime OK, mais documenter source + lien fonction/offre ; respecter LCD/asterisque en CH.
- Le RDV 45 min "diagnostic/benchmark" colle bien a des organisations qui aiment les **procedures cadrees** : vendre la seance comme un audit structure, pas un call commercial.

---

## 8. CONCEVOIR le RDV 45 min pour qu'il soit TENU et UTILE

Booker ne sert a rien si le prospect ne vient pas. Avec confirmation, le taux de presence passe de ~50 % a 75-85 % en 30 jours (souvent +2x de pipeline net sans changer le volume de booking).

### 8.1 Agenda type qui justifie 45 min (a annoncer)
1. 0-10 min : contexte + ce que vous avez deja prepare sur eux (preuve que c'est une seance, pas un pitch).
2. 10-30 min : le diagnostic/benchmark (questions de decouverte ; le prospect parle > 55 %).
3. 30-40 min : restitution des constats + livrable (audit chiffre / comparatif / cartographie).
4. 40-45 min : prochaine etape (definie ensemble, pas imposee).

### 8.2 Protocole anti no-show
- **Invitation envoyee en live, < 60 s apres l'accord**, confirmee verbalement ("vous l'avez recue ?").
- **Objet clair** (pas "Introduction call") + **agenda 2-3 bullets** + noms/roles des participants + lien visio.
- **Confirmation J-1** : email court avec 2 boutons **"Confirmer" / "Reporter"** (jamais "Annuler" ; on facilite le report, pas l'abandon).
- Eventuellement **double opt-in** (2e confirmation) pour les comptes a risque ; auto-liberer les slots morts.
Resultat attendu : show rate 75-85 %.

---

## 9. METRIQUES, FUNNEL & CADENCE

### 9.1 Le funnel chiffre (planification de capacite)
Formule : RDV tenus / dial = p(connect) x p(connect->RDV) x p(presence).
Hypotheses : p(connect->RDV) = 0,12 (opener permission + bon brief ; plage 0,06 faible -> 0,14 fort, Gong/Nooks 11-14 %), p(presence) = 0,80 (protocole section 8).

| Scenario | p(connect) | Dials pour 1 RDV **tenu** de 45 min |
|----------|-----------|-------------------------------------|
| **A. Data generique / standard** | 0,05 | **~208 dials** |
| **B. Mobile verifie + double-dial + bonne heure** | 0,15 | **~70 dials** |
| **C. Top quartile** (data + tonalite + ciblage + parallel dialer ; connect->RDV 0,14) | 0,20 | **~45 dials** |

Lecture : **la preparation (data + numero + voix + ciblage) divise par ~4-5 le nombre de dials par RDV tenu** (de ~208 a ~45). C'est la justification chiffree d'investir les 5 chantiers.

Capacite/jour : un rep manuel fait ~44-45 dials/j (moyenne secteur) ; un parallel dialer fait 125+ dials/h. En scenario B (70 dials/RDV), manuel = ~0,6 RDV/j ; parallel a 150 dials/j = ~2 RDV tenus/j.

### 9.2 Benchmarks a suivre (2025-2026)
- Connect rate B2B : 2-4 % data generique, 8-12 % correcte, **18-22 % mobile verifie** ; top-quartile 13,3 % (Gong).
- Dial->RDV : moyenne ~2,5 % (1 RDV / 40 dials) ; **top performers 5-8 %** (15-20 dials/RDV).
- Il faut en moyenne **8 tentatives** pour joindre un prospect ; >50 % des reps s'arretent a 3-5 (la plupart des conversations arrivent au 3e essai).
- 69 % des acheteurs B2B sont ouverts a un appel a froid d'un nouveau fournisseur ; 82 % ont deja accepte un RDV issu d'un cold outreach strategique.

### 9.3 Cadence multicanale (le telephone comme colonne vertebrale)
- **6-8 touches sur 15-21 jours**, dont **3-5 tentatives d'appel** ; espacements 1-2 j au debut puis 2-3 j.
- Phone + email + LinkedIn combines : jusqu'a **+287 %** vs canal unique.
- Front-load : concentrer les touches quand l'interet est le plus haut, puis espacer.

### 9.4 Meilleur moment pour appeler
- **Jours** : mardi (meilleur), mercredi, jeudi. Eviter lundi matin (surcharge) et vendredi aprem (deconnexion week-end). (Note : certaines etudes placent lundi 8h tres haut — tester sur VOTRE data.)
- **Heures** : **8h-11h** (creux 10-11h tres bon, +31 % vs autres creneaux) et **16h-17h** (+109 % vs midi pour qualifier). Eviter 12h-14h.
- **Definir "connecte"** : appel >= 30 s ET resultat "connecte" (sinon on se ment sur le connect rate).

---

## 10. LA PILE OUTILS (par fonction)

| Fonction | Options 2025-2026 |
|----------|-------------------|
| Data contacts/mobiles (EU) | Cognism (Diamond, EU/RGPD), Kaspr (FR) ; Apollo (volume, re-enrichir) ; sources publiques : recherche-entreprises.api.gouv.fr (FR), Zefix/LINDAS (CH) |
| Enrichissement / orchestration | Clay (waterfall + signaux) |
| Declencheurs / intent | Autobound, Clay, alertes (levees, recrutements, news) |
| Composeur | Orum, Koncert, Nooks (parallel) ; power dialer pour volume moyen ; single-line pour Tier A |
| Reputation numero | Branded Caller ID + enregistrement carrier + monitoring/remediation reputation |
| Brief pre-appel IA | LLM (brief structure), Databar, Apollo AI |
| Entrainement / coaching | Hyperbound (roleplay IA depuis LinkedIn, scorecards), Gong/Chorus (analyse appels reels) |
| Booking / anti no-show | Cal.com / scheduling avec "requires confirmation", rappels J-1 |

---

## 11. CHECKLIST DE PREPARATION PRE-APPEL (le rituel, a cocher)

**Avant la campagne (une fois) :**
- [ ] ICP + persona + declencheurs definis ; liste segmentee A/B/C et scoree
- [ ] Data mobile **verifiee** (>85 %) ; numeros morts purges
- [ ] Pool de numeros emetteurs enregistres/brandes, en rotation (<75/j) ; attestation A
- [ ] Composeur choisi par tier ; regle double-dial cadree
- [ ] Conformite : registre source + base legale (interet legitime B2B) + process opt-out
- [ ] Script modulaire redige + 2 variantes d'opener + banque d'objections
- [ ] Protocole anti no-show pret (modele d'invite + email J-1)
- [ ] Roleplay IA fait sur 3-5 personas

**Avant CHAQUE appel Tier A (90 s) :**
- [ ] Declencheur + source identifies
- [ ] 1 priorite business + 1 KPI du persona
- [ ] Accroche d'opener ecrite mot pour mot
- [ ] Probleme "triggering" a peindre choisi
- [ ] 1 pair comparable pret (opener "heard the name")
- [ ] Creneau de RDV a proposer (choix binaire) + livrable de la seance 45 min defini
- [ ] Tonalite : 140-160 wpm, pitch descendant, respirer

---

## 12. TEMPLATE DE PLAYBOOK A REMPLIR (1 page par segment/industrie)

```
SEGMENT / INDUSTRIE : __________________________
PERSONA(S) CIBLE(S) : __________ | KPI dont il est redevable : __________
DECLENCHEURS A CHASSER : __________ , __________ , __________
SOURCE DATA + base legale : __________________________

OPENER (variante choisie) :
"__________________________________________________________"

PROBLEME DECLENCHEUR (scene a peindre) :
"__________________________________________________________"
SOLUTION 1 PHRASE : "On ____ pour que ____ disparaisse."
MICRO-CTA : "Ca vous parle, ou vous etes deja au point ?"

ASK 45 MIN (seance + livrable + sortie) :
"45 min de travail : on ____ ; vous repartez avec ____ meme sans suite ;
en 10 min vous saurez. Mardi 14h ou jeudi matin ?"

TOP 3 OBJECTIONS + REPONSES (Miyagi/Braun) :
1. ____ -> ____
2. ____ -> ____
3. ____ -> ____

VOICEMAIL (8-14 s) : "__________________________"
GATEKEEPER : "__________________________"

LIVRABLE DE LA SEANCE 45 MIN : __________ (audit / benchmark / cartographie)
AGENDA J-1 (anti no-show) : objet ____ | 3 bullets ____ | bouton Confirmer/Reporter

CADENCE : ___ touches / ___ jours | ___ appels | heures : 8-11h & 16-17h
CIBLE FUNNEL : connect ___ % | connect->RDV ___ % | presence ___ %
```

---

## Sources (2025-2026)

- Gong — Best/worst cold call openers (300M appels) : https://www.gong.io/blog/the-best-and-worst-cold-call-openers-backed-by-data-from-300m-calls
- 30MPC — The Ultimate Cold Calling Framework : https://www.30mpc.com/newsletter/the-ultimate-30mpc-cold-calling-framework | Cold call metrics : https://www.30mpc.com/newsletter/how-to-book-more-meetings-in-fewer-cold-calls-cold-call-metrics
- Nooks/permission-based (13,9 % vs 5,8 %) via Prospeo : https://prospeo.io/s/permission-based-opener | Hyperbound : https://www.hyperbound.ai/blog/permission-based-opener-cold-calling
- Tonalite PAVP (Gong Labs, 14 % plus lent / +38 %) : https://prospeo.io/s/cold-call-tonality
- Connect rate / data : https://prospeo.io/s/cold-call-connect-rate | eMarketNow main vs direct vs mobile : https://www.emarketnow.com/blog/main-line-direct-dial-work-mobile-dials-per-connect-2025/ | Cold Call Benchmarks 2025 : https://coldcallbenchmarks.com/p/2025-phone-data-benchmark-report
- Cognism — EMEA data / Diamond / stats : https://www.cognism.com/blog/emea-b2b-data | https://www.cognism.com/blog/cold-calling-statistics | Objections : https://www.cognism.com/blog/cold-call-objections | Gatekeeper : https://www.cognism.com/blog/get-past-the-gatekeeper | Voicemail : https://www.cognism.com/blog/voicemail-scripts
- Spam likely / STIR-SHAKEN : https://saleshive.com/blog/avoid-spam-likely-outbound-calls/ | https://www.nextiva.com/blog/caller-id-reputation.html | https://www.phoneburner.com/blog/spam-calls-4-strategies-to-avoid-spam-labeling
- Dialers (power vs parallel) : https://www.orum.com/blog/power-dialing-vs-parallel-dialing | https://www.koncert.com/blog/whats-the-best-dialer-for-cold-calling
- Best time to call : https://www.mightycall.com/blog/best-time-to-cold-call-research/ | https://pipeline.zoominfo.com/sales/best-days-to-cold-call | https://leadsatscale.com/insights/the-optimal-cold-call-time-window-data-from-40000-outbound-calls/
- Conversion par industrie : https://focus-digital.co/average-cold-call-conversion-rate/
- Cadence multicanale : https://woodpecker.co/blog/how-many-touches-multichannel-sales-cadence/ | https://leadsatscale.com/insights/outbound-sales-cadence-the-7-touch-sequence-that-books-meetings/ | https://www.sproutworth.com/multichannel-cold-outreach/
- Double-dial : https://www.tendril.us/post/how-to-double-your-pickup-rate | https://top1.fm/DailySalesTips/sales-tip-481-call-twice-and-get-a-60-answer-rate-lee-rozins/
- No-show / booking : https://www.default.com/post/how-to-reduce-no-shows-appointments | https://orrjo.com/blog-reduce-meeting-no-shows
- Discovery length : https://winningbydesign.com/resources/blog/the-anatomy-of-a-perfect-discovery-call/ | https://www.cognism.com/blog/discovery-calls-101
- Reglementation FR/B2B : https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/professionnels-comment-respecter-la-reglementation-sur-le-demarchage | https://www.nomination.fr/blog/prospection-telephonique-b2b-reglementation/ | https://monexpertrgpd.com/prospection-telephonique-rgpd-entreprises/
- Benchmarks generaux : https://saleshive.com/blog/b2b-sales-cold-calling-benchmarks-teams-2025/ | https://optif.ai/learn/questions/cold-call-to-meeting-conversion-rate/
- Objection "send me an email" : https://www.close.com/blog/send-more-info | Josh Braun : https://joshbraun.com/learn/objections/
- IA / roleplay : https://www.hyperbound.ai/ | Clay : https://www.clay.com/
