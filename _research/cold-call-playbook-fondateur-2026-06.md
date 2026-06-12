# Playbook cold call FONDATEUR — structuré par phases d'appel (v1 — 2026-06-12)

**Statut : LE playbook opérationnel, régime fondateur assumé** (Martin est fondateur, salesMotion = founder-led). Ce doc formalise par phases ce que `cold-call-playbook-douablin-2026-06.md` posait par thèmes ; en cas de doute, ce doc fait foi.

**Adaptation Pilae — premier passage fait le 2026-06-12** : modèle économique ~50 % projet d'implémentation + ~50 % abonnement d'opération (site : pilae-cloud.pages.dev, sauvé en raw) → la sortie (a) du pivot est un PRÉ-DIAGNOSTIC à chaud, jamais un close en ligne (détail en Phase 4). Le playbook est **seedé comme knowledge produit** : 10 entrées tenant (8 « Cold call — … » process + offre product + objections) éditables dans Settings → Knowledge, consommées par le chat, la génération de script (`generateCallScript`) et la construction de listes TAM. Le **sprint mono-secteur est exécutable depuis le chat** (2026-06-12) : `proposeCallSprint` (« extrais les DG des EMS ») résout la cible sur les colonnes stockées et donne les comptes honnêtes (cible / avec téléphone / joignables), puis `applyCallSprint` écrit l'audience sur la campagne active — la liste du matin ne puise plus que dans le sprint (les rappels en cadence gardent leur échéance). Restent à remplir ensemble : récits-pairs réels et FAQ au mot près (slots 3 et 5) — directement dans ces entrées.

Clés de citation :
- **[SF mm:ss]** = Benjamin Douablin, vidéo « cold call fondateur » (coworking San Francisco, avec Greg) — `_research/raw/douablin-founder-coldcall-video-transcript.md`. Le volet FONDATEUR.
- **[CC mm:ss]** = Benjamin Douablin, podcast Coldcast d'Augustin Tonnel, 52 min — `_research/raw/douablin-cold-call-transcript.md`. Le volet méthode/équipe.
- **KB** = `cold-call-prep-playbook-2026-06.md` + `cold-call-exchange-top01-2026-06.md` (Gong 300M, 30MPC, Voss, Sandler, Challenger, JOLT — chiffres sourcés).
- Les apports **(Augustin)** et **(Greg)** viennent des hôtes, pas de Douablin.

---

## 0. La posture fondateur — à lire une fois, c'est elle qui change tout

1. **Tu n'es pas un vendeur.** « Tu n'es pas un vendeur de tapis, tu es là pour apporter une solution à un problème business » [SF 4:24]. Se comporter comme un vendeur en étant fondateur = perdu (Greg, intro [SF 1:03]). Corollaire contre-intuitif : « les personnes qui sont trop sales, ça s'entend ; un fondateur un peu moins sûr de lui semble humain » — la maladresse légère joue POUR toi [SF 14:12-14:33]. Pas besoin du pitch parfait [SF 13:58].
2. **Présente-toi fondateur, sans en jouer.** Le trust d'un fondateur est bien supérieur à celui d'un SDR junior ou d'un sales « là pour sa commission » : « fondateur, a priori, ne va pas planter sa boîte » [SF 6:33-6:41]. Nuance (Greg) : ne pas en jouer au point de biaiser l'échange — certains parlent juste parce que tu es fondateur [SF 6:52].
3. **Détachement de l'outcome.** Le cold call est dur émotionnellement (rejet, comme en dating [SF 2:39-2:54]) ; le déblocage = « avec quoi je suis content ? » → **une information prise = call réussi** ; le meeting est un bonus [SF 3:10-3:34]. Convergence KB : le besoin se sent dans la voix et déclenche la réactance — moins tu pousses, moins il résiste.
4. **Pas d'ego — position d'aide.** « Je t'appelle et je te demande un peu d'aide. Les gens sont toujours contents d'aider » [SF 8:04] ; les seniors aiment aider les nouveaux, ça les pose en advisor [SF 8:21-8:30]. Les C-levels installés APPRÉCIENT d'être appelés par un fondateur — c'est différenciant [SF 14:55-15:03].
5. **Désacraliser.** Un call qui se passe mal : raccrocher, passer au suivant. « Tu peux le rappeler le lendemain, il ne s'en rappellera pas — on a une mémoire super courte » [SF 14:40]. « La personne ne sait pas qui vous êtes, elle ne retiendra pas votre nom » [CC 48:44]. Ne jamais le prendre personnellement.
6. **Acting.** Le script s'apprend comme un texte d'acteur : « ils ne le récitent pas, ils le vivent » [CC 44:29] ; « un bon sales se plonge dans un texte, se l'approprie, joue son rôle » [SF 11:35]. Le script reste visible (imprimé, post-it) même maîtrisé [CC 44:29].
7. **Closer, pas booker.** « Je n'étais pas incentivé à booker des meetings ; j'étais incentivé à closer les clients et à apprendre des choses sur mon marché » [SF 12:22-12:27]. Le call d'un fondateur peut aller jusqu'à la vente — c'est la différence structurelle avec un SDR.
8. **Dur, donc peu compétitif.** La pression émotionnelle est LA barrière à l'entrée [SF 2:39] ; (Greg) « sur LinkedIn ils sont 1 000, des mecs qui font du cold call il y en a 5 — et tu parles directement à ton audience » [SF 15:22]. Douablin : 40 premiers clients signés comme ça (rapporté par Greg [SF 0:30]) ; « si demain je remonte une boîte, je le fais, c'est sûr » [SF 15:14].

---

## 1. Vue d'ensemble — les 7 phases

| Phase | Quand / durée | Objectif | Sortie |
|---|---|---|---|
| 0. Préparer la session | Avant le bloc d'appels | Liste + imprégnation + FAQ relue | Composer sans réfléchir |
| 1. Ouverture | 0-30 s | Permission obtenue, statut fondateur posé | « OK, je t'écoute » |
| 2. Collecte | 30 s-2 min | L'état de l'art CHEZ EUX, avant tout pitch | Leur process/outils décrits |
| 3. Pains | 1-2 min | Le prospect se reconnaît dans UN pain | « Oui, ça on le vit » |
| 4. Pivot | L'instant clé | Choisir la sortie : closer là / booker / collecter | Décision a, b ou c |
| 5. Verrouillage | 1-2 min | Engagement pris EN LIVE, jamais en différé | Propale partie / invit acceptée / sortie propre |
| 6. Post-call | 2 min max | Documenter, cadencer, boucler | CRM + FAQ + mots à jour |

Règles transverses (KB) : sur un cold call réussi le rep parle ~55 % ; UN sujet vivide à la fois, jamais une liste lue ; ton lent, posé, descendant — seule la demande de permission monte ; jamais « je vous prends à un mauvais moment ? » (2,15 % de réussite, le pire opener mesuré).

---

## PHASE 0 — Préparer la SESSION (pas chaque appel)

- **La liste de 100, pas de 1 000** [SF 4:01-4:15]. Critère d'inclusion : une conviction assez forte pour se dire « je ne vais pas lui voler son temps — cette personne sera contente d'avoir échangé ». C'est ce qui donne le « mindset de gagnant » à l'ouverture [SF 4:24].
- **Une hypothèse par sprint** [SF 8:42-8:49] : « je pense que ce produit répond à ce segment de marché » — la session sert à la valider. Un segment à la fois.
- **Imprégnation batch sectorielle, pas de fiche unitaire** [CC 43:54-44:29] : 15 min de recherche par prospect = 15 min perdues quand il ne décroche pas. À la place : 30-60 min sur l'industrie avant une liste de 50-100 — quelques sites, quelques profils, « voir ce qui ressort » → des exemples prêts pour TOUTE la liste. (Augustin) « S'imprégner du quotidien du prospect », un secteur par session, jamais bricolage-puis-banque-puis-food [CC 46:46]. Nuance maison : quand la fiche prospect est auto-générée, son coût marginal est ~0 — imprégnation batch ET accroche unitaire (outil détecté) se cumulent.
- **Le bloc agenda, non négociable** [SF 8:56-9:08] : Douablin se bloquait TOUS les mardis, 4 h et parfois 8 h non-stop (9 h-20 h) — « un truc de gros bourrin ». La régularité bat l'intensité ponctuelle.
- **L'environnement** [SF 9:16-9:30] : appeler à plusieurs (cofondateurs, autres founders), un tableau, une compétition légère — « ce n'est pas à qui a le meilleur pitch, c'est une question d'y aller ». Rituel d'équipe transposable en solo : réécoute hebdo des 3 meilleurs et 3 pires calls, dédramatiser les pires [CC 19:44-20:04].
- **Joignabilité** : « on n'a pas envie d'appeler des mauvais numéros » [SF 2:32]. Mono-fournisseur ≈ 25-30 % de couverture ; cascade multi-fournisseurs : 60-85 % emails, 50-70 % mobiles [CC 28:51-32:51].
- **La FAQ relue avant la session** : si tu as fait 400 calls, tu connais toutes les questions — « tu les documentes au mot près dans ton playbook » [SF 11:19-11:28]. La sortie « closer maintenant » (phase 4a) n'est possible que si tu réponds à tout instantanément.
- **Un script par cible**, attaché à la liste, imprimé [CC 9:06, 46:00].

---

## PHASE 1 — OUVERTURE : fondateur + permission (0-30 s)

Le verbatim Douablin, quasi mot pour mot [SF 4:50-5:05] :

> « Hello [Prénom], [TON PRÉNOM], fondateur de [BOÎTE]. Je vois que tu as [OBSERVATION : cette boîte dans tel domaine / telles équipes / tel outil]. J'aurais aimé prendre 30 secondes de ton temps — si c'est OK pour toi, je t'explique le détail de mon appel. »

(Registre tu/vous et Madame/Monsieur selon la cible — slot d'adaptation ; le canon romand actuel est au vouvoiement formel.)

Mécanique :
- **« Fondateur de »** dans la première phrase — c'est le levier de trust [SF 6:41].
- **L'observation** = la raison d'appel : « je vois que tu as… » — prouvée x2,1 sur la prise de RDV (KB). Elle sort de l'imprégnation batch (phase 0), pas d'une fiche de 15 min.
- **La permission sur 30 secondes** achète l'attention : « quand j'ai ça, j'ai son attention » [SF 5:05]. KB : la phrase de permission MONTE (vraie question), tout le reste DESCEND.
- **Si non** : ne pas pousser — transformer en rappel + une phrase de raison (canon), ou sortie propre. Le « non » du début est un réflexe à l'interruption, pas un rejet (KB).

---

## PHASE 2 — COLLECTE : l'état de l'art chez eux, AVANT tout pitch

L'inversion fondateur — après la permission, on ne pitche PAS, on demande [SF 5:12-5:26] :

> « Voilà, je lance [CATÉGORIE, une demi-phrase, sans vendre]. J'ai vu que vous aviez sans doute [ACTIVITÉ LIÉE]. Aujourd'hui, comment vous faites ? C'est quoi vos process, vos outils ? »

- « J'allais chercher de l'information. Pas vendre. Je ne disais pas forcément ce que je faisais — je comprenais l'état de l'art sur mon sujet, chez mes prospects » [SF 5:26].
- Pourquoi le téléphone et pas l'email : personne ne répond à un cold email pour dire « non, et voilà pourquoi » ; au téléphone on te dit « attends, là tu es à côté de la plaque » — le feedback négatif explorable est LA donnée rare [SF 7:31-7:48]. (Greg) 20 appels = ta réponse de marché, là où une landing + 1 500 € d'ads itère pendant des semaines [SF 12:47-13:18].
- Dosage : 30-60 secondes en mode vente établie ; ce bloc s'étend franchement en mode exploration produit (le call devient un accélérateur de discovery [CC 4:05, SF 3:34]). Early stage, ça reste pertinent des mois, voire des années — tant que le product-market fit n'est pas trouvé [SF 7:48-8:04].

---

## PHASE 3 — ÉCLAIRER LES PAINS — jamais frontal

Le principe : « il ne faut pas vendre les bénéfices de la solution, il faut éclairer les pains » [SF 5:41-5:49]. Et jamais « avez-vous des problèmes ? » — « les gens ne disent pas oui bien sûr j'ai des problèmes » [CC 34:59]. Deux formes à combiner :

- **Le récit-pair** [CC 34:59-35:18] : raconter ce que vivent des confrères/clients du même persona — « un tel nous raconte que… » — et laisser le prospect se reconnaître : « c'est plus facile de dire "ah oui, moi aussi" que de répondre à un frontal ».
- **Les pains nommés, validés un par un** [SF 5:49-6:04] : Douablin éclairait 2-3 problématiques précises (« la qualité de données, le coverage multi-marchés ») puis : « est-ce que c'est les problématiques que tu rencontres ? ». Le canon Martin (un enjeu à la fois, max 3, s'arrêter au premier qui mouche) s'applique tel quel.

> « Ce qu'on entend chez des [PERSONA] comme vous : [PAIN n°1, raconté via un pair, concret et daté]. Chez d'autres, c'est plutôt [PAIN n°2]. Vous, vous êtes plutôt dans lequel — ou ni l'un ni l'autre ? »

- **Si ça mord** : creuser — « tirer la pelote » [CC 35:18] — ET vérifier le calibrage solution↔problème : « parfois le problème existe et on a juste mal calibré la solution » [SF 6:04-6:14]. C'est une question de discovery produit autant que de vente.
- **Puis seulement** la solution, en une phrase : « nous, on développe une solution qui fait [X] — est-ce que ça résonne pour vous ? » [SF 5:35].
- **Si rien ne mord** après 3 pains : phase 4, sortie (c) — on collecte quand même (« qu'est-ce qui vous occupe vraiment sur [DOMAINE] en ce moment ? ») et on sort proprement.

---

## PHASE 4 — LE PIVOT : choisir la sortie (la décision fondateur)

C'est ici que le fondateur diverge du SDR. Le SDR booke mécaniquement (« tu poses trois questions et tu books un meeting, c'est terminé » [SF 12:12]). Le fondateur choisit entre **trois sorties** :

**(a) CLOSER MAINTENANT** — ça mord fort, l'interlocuteur a le temps (ceux qui disent « 2 minutes » ont parfois 30 minutes devant eux [CC 36:30]), le compte est clairement ICP.
→ Continuer là : mini-discovery, répondre à TOUTES les questions instantanément, jusqu'à ~15 minutes, et envoyer la propale dans la foulée — « ça m'est arrivé de faire des calls de 15 minutes, j'envoyais la propale à la fin et ça signait dans la foulée » [SF 11:56-12:04].
→ Condition : la FAQ maîtrisée au mot près. « Attends, il faut que j'en parle à mon CTO » = le signal qu'il faut passer en (b) [SF 11:03-11:19]. Raccourcir un cycle ≠ mettre la pression (« je ne mets jamais la pression à quelqu'un pour acheter » [SF 11:03]) ; raccourcir = tout répondre au moment où la question tombe [SF 10:48].

> **Adaptation Pilae (2026-06-12)** : FullEnrich est un SaaS self-serve peu cher — le « ça signait dans la foulée » tient pour CE modèle-là. L'offre Pilae = ~50 % projet d'implémentation + ~50 % abonnement d'opération : un close en ligne n'est pas réaliste. Chez nous, la sortie (a) devient **ÉTENDRE À CHAUD** — 10-15 minutes de pré-diagnostic au téléphone (outils en place, volumes, échéances, qui décide) pour arriver au rendez-vous de cadrage avec un dossier à moitié rempli et un cycle raccourci. Tout le reste de la sortie (a) (FAQ instantanée, jamais de pression, signal « j'en parle à mon CTO » → (b)) s'applique tel quel.

**(b) BOOKER LE RDV** — ça mord, mais le cadre est court, ou il manque un décideur, ou le sujet mérite la séance complète.
→ Le RDV ~45 min avec livrable annoncé (canon). Garde-fou : ne pas trop en dire — « tu lui donnes suffisamment à manger pour qu'elle n'ait plus la nécessité de prendre le rendez-vous » [CC 37:02]. On amorce, on ne déballe pas.

**(c) COLLECTER ET SORTIR** — ça ne mord pas.
→ Une dernière question d'apprentissage, merci, sortie propre. Le call reste gagné : « je suis content si je prends une information pendant ce call » [SF 3:27].

Règle de bascule : sur un compte ÉVIDEMMENT dans la cible, ne pas sur-qualifier — « parfois tu n'as même pas besoin de poser des questions, tu sais qu'il faut le rencontrer » [CC 38:56] → aller vite à (a) ou (b).

---

## PHASE 5 — VERROUILLER : en live, jamais en différé

Selon la sortie choisie :

**(a) Propale** : récapituler à voix haute les points validés, annoncer la propale, l'envoyer LE JOUR MÊME (idéalement pendant qu'on est encore en ligne), et fixer au téléphone le moment où on se redit oui/non.

**(b) RDV** : calé PENDANT l'appel, agendas synchronisés — « un rendez-vous qui n'est pas dans l'agenda n'est pas un rendez-vous pris » [CC 37:02]. Puis le triptyque (Augustin) [CC 42:37-43:40] :
1. « Je vous envoie l'invitation — je vous invite à l'accepter maintenant, comme ça elle se glisse dans votre agenda et je suis certain qu'elle n'est pas tombée dans les spams. »
2. « Je vous prends encore 30 petites secondes pour préparer notre prochain échange. »
3. **Deux questions FERMÉES** (jamais ouvertes) dont les réponses servent réellement à préparer le RDV — le prospect voit que la séance sera préparée, et on repart avec deux infos concrètes.
Le temps passé sur le call crée le mini-lien qui réduit les no-shows — le défaut du booking trop précoce, c'est les gens qui disent oui par politesse sans avoir compris [CC 42:20].

**(c) Sortie propre** : merci, porte ouverte (« si [PAIN] devient un sujet, je suis joignable »), et toute demande de ne plus être appelé respectée immédiatement.

---

## PHASE 6 — APRÈS L'APPEL : 2 minutes, pas plus

- **Disposition CRM immédiate** ; « rappelle-moi demain » = tâche demain matin [CC 12:15].
- **Cadence sans réponse** : NRP 1 → NRP 8, étalés sur 2 semaines [CC 12:15]. Un call qui s'est mal passé peut être retenté le lendemain — mémoire courte [SF 14:40].
- **FAQ playbook** : toute question nouvelle entendue → documentée AU MOT PRÈS, avec la réponse qui a marché [SF 11:28]. C'est l'actif qui rend la sortie (a) possible et qui équipera les futurs sales [SF 10:30-10:48].
- **Boucle messaging** : noter tels quels les mots qui ont fait mouche — c'est ce qui a donné à FullEnrich « un message beaucoup plus juste » sur son site dès le lancement, au lieu d'une proposition de valeur floue [SF 9:54-10:22]. Slot : où on capitalise ces formulations.
- **Bénéfices périphériques** : un pair qui aime aider peut devenir advisor, membre de l'advisory board, voire investisseur — tout cela est arrivé à Douablin PAR cold call [SF 8:30-8:42, 14:55]. Les noter et entretenir.
- **Hebdo** : réécoute 3 meilleurs / 3 pires [CC 19:44] ; un seul levier travaillé à la fois (KB : un levier corrigé peut tripler les RDV).

---

## Mesure (régime fondateur)

- **Victoire par call : une information.** Meeting ou signature = bonus [SF 3:27].
- **20 appels = une réponse de marché** sur une hypothèse de segment [SF 13:10].
- Références d'équipe pour se calibrer (pas des objectifs fondateur) : 50-60 dials/jour → 10-15 connects → 1-3 meetings [CC 9:06] ; KB : ~70 dials par RDV tenu au départ sur data mobile vérifiée.
- À suivre par session : dials, connects, infos apprises (oui/non), sorties a/b/c, propales, signatures.

---

## Slots à remplir à l'adaptation Pilae (étape suivante, ensemble)

1. **[OBSERVATION D'OUVERTURE]** par segment — le « je vois que vous… » honnête (issu de l'imprégnation batch + outil détecté).
2. **[QUESTION D'ÉTAT DE L'ART]** par segment — « aujourd'hui, comment vous gérez [DOMAINE] ? » version Pilae (outils du quotidien, qui gère l'IT, budget).
3. **[PAINS 1-2-3 + RÉCITS-PAIRS]** par segment × persona — tirés de VRAIS échanges Pilae ; sans pair réel, scène sectorielle prudente, jamais de faux client nommé.
4. **[SOLUTION EN UNE PHRASE]** — la version courte de l'offre (base : §1 du playbook ICP).
5. **[FAQ AU MOT PRÈS]** — les questions déjà entendues en prospection Pilae + les réponses qui marchent ; condition de la sortie (a).
6. **[CRITÈRES DE BASCULE a/b/c]** — quand closer en ligne (petite structure, décideur seul, pain net) vs booker (multi-acteurs, audit nécessaire).
7. **[2 QUESTIONS FERMÉES POST-BOOKING]** par segment — celles qui nourrissent la « première lecture chiffrée » apportée au RDV.
8. **[LIVRABLE DU RDV]** — canon actuel : « une première lecture de ce que vous pourriez remplacer et l'écart de coût ».

La matrice segments (10 familles, enjeux, qualifiers) existe déjà dans `pilae-call-playbook-icp-2026-06.md` §3 — l'adaptation consistera à la réécrire dans CES phases, avec le récit-pair et les trois sorties.

---

Sources : transcripts bruts dans `_research/raw/` (douablin-cold-call-transcript.md, douablin-founder-coldcall-video-transcript.md) ; thématique v1 : `cold-call-playbook-douablin-2026-06.md` ; références chiffrées : [[cold-call-methodology-kb]] ; registre : [[outbound-natural-not-engineered]] ; canon Pilae : `pilae-call-playbook-fondations-2026-06.md` + `pilae-call-playbook-icp-2026-06.md`.
