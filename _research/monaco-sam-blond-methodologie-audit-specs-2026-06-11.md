# Audit PM — La méthodologie GTM de Sam Blond, feature par feature, traduite en specs Kiro

**Date**: 2026-06-11
**Source primaire**: `_research/raw/transcript-sam-blond-monaco-gtm.md` (podcast Turner Novak × Sam Blond, CEO Monaco, enregistré ~mai 2026 — « Monaco launched about three months ago » + GA « should come in July »)
**Posture de l'exercice**: je me place comme PM senior CHEZ Monaco, chargé de traduire ce que le CEO affirme en public en specs produit rigoureuses, avec un regard de CRO (chaque feature jugée par la variable de revenu qu'elle bouge). L'intérêt pour nous : reverse-engineerer la logique produit de Monaco depuis la bouche de son fondateur, et voir où sa méthodologie est solide, où elle est sur-vendue, et ce que ça implique pour Elevay.
**Limites**: n=1 podcast, discours marketing parlé. Je distingue systématiquement ce qui est revendiqué comme LIVE (« we have an insights agent ») de ce qui est décrit comme POSSIBLE (« AI can then route the meeting »). Les références §N pointent vers les sections du transcript.

---

## 0. Synthèse exécutive

**La thèse produit en une phrase** : le revenu est une équation à trois variables (« Revenue has three variables: opportunities (or leads) × conversion rates × ACV » §7), et Monaco est construit comme la boucle fermée qui optimise les trois depuis un seul plan de données — parce qu'un produit étroit ne peut pas relier ce qui close en bas du funnel à ce qu'on cible en haut (§6, §8).

**Les quatre doctrines méthodologiques** qui structurent le produit :
1. **Demand-first** (§20) : 9/10 founders diagnostiquent un problème de conversion alors que le bottleneck est la génération d'opportunités. Doubler les demos est plus facile qu'un lift de conversion de 50 %. Conséquence produit : le défaut du système doit pousser vers la demand gen, pas vers l'optimisation de conversion.
2. **Founder-sender** (§17) : « Who sends the outbound is very important » — l'origination vient du founder, c'est « ingrained into the platform itself ». Conséquence : délégation d'identité + approbation, pas d'envoi générique.
3. **Relevance, pas personnalisation** (§19) : les signaux marchent « because they're actually relevant » — le signal doit bénéficier au destinataire (job posting → on automatise ce rôle), l'anti-pattern étant la personnalisation cosmétique (« go Chiefs »). Conséquence : le signal est un déclencheur ET un contenu, avec citation vérifiable.
4. **Anecdotes > attribution pour le brand** (§10) : « The real answer is: we don't [measure] » — mais Sam cite lui-même LA mesure qui compte : reply rates « same company, same product, same message — exponentially higher » après le launch. Conséquence : ne pas attribuer par contact, mais instrumenter l'uplift global et capturer les échos de marque.

**Ce que le transcript révèle de nouveau vs nos teardowns** (détail en §5 du doc) :
- **GA mi-juillet 2026** — dans ~1 mois. Public beta = waitlist « metering who comes in » (§13).
- **Series B levée** (~mai 2026), narrative « FDAE = THE big competitive advantage » (§21). Pas dans nos docs (qui s'arrêtaient à $35M seed+A).
- **Insights agent revendiqué live** (§8) — la pièce la plus différenciante du discours, absente de nos teardowns UI.
- **ACV implicite ~$25K** (§9, l'exemple « $25K ACV deal » donné comme leur deal type).
- **Clients nommés** : Greptile, Judgment Labs, Parley (YC, legal immigration), Nowadays (AI event planning).
- **Revenue majoritairement par référence** (§13) — « most of our revenue today comes from referrals ».

**Verdict d'audit global** : la méthodologie est cohérente et la traduction produit est réelle (le transcript confirme la classification 6 étapes de notre teardown). Les deux failles structurelles que je documente en §4 : (a) **le piège statistique** — l'insights agent promet de la significativité statistique à des clients seed qui ont 20-50 opportunités par trimestre, ce qui est mathématiquement intenable sans tiers de confiance et correction multi-comparaisons ; les exemples fondateurs (Zenefits, Brex 4x) ont été découverts à des échelles de centaines d'employés ; (b) **l'aveu FDAE** — « you have to manage that agent — set it up, program it, check the messaging. We just do that for you » (§21) est un aveu que le produit seul ne tient pas sa promesse d'autonomie ; la marge en dépend (objection Series A admise).

---

## 1. L'équation de revenu comme colonne vertébrale

Lecture CRO : chaque feature se juge par la variable qu'elle bouge. C'est le critère de Sam lui-même (§7-8), je l'applique à son propre discours.

| # | Feature | Variable principale | Variable secondaire | Statut dans le transcript |
|---|---------|--------------------|--------------------|---------------------------|
| F1 | TAM Builder agentique | Opportunités (volume adressable) | Coût/temps humain | Live (§2) |
| F2 | Account Scoring | Conversion (qualité du ciblage) | Opportunités | Live (§2) |
| F3 | Signal Overlay + timing | Opportunités (reply rate) | Conversion (moment) | Live (§2, §19) |
| F4 | Buyer Finder (personas) | Conversion (bon interlocuteur) | Opportunités | Live (§2), persona-insight §8 |
| F5 | Séquences multi-canal founder-sender | Opportunités (reply rate) | — | Live, « ingrained » (§17-18) |
| F6 | Insights Agent | Conversion | Opportunités (re-ciblage) | Revendiqué live (§8) |
| F7 | Routing rep-level | Conversion | — | Capacité décrite, pas démontrée (§8) |
| F8 | Analytics outcome-first + diagnostic bottleneck | Les 3 (méta) | — | Doctrine forte, productisation implicite (§7, §20) |
| F9 | Boucle fermée closed-won → ciblage | Conversion ET opportunités | ACV (segments) | Argument d'architecture (§6, §8) |
| F10 | FDAE | Conversion + rétention (NRR) | COGS (marge) | Live, narrative Series B (§21) |
| F11 | Launch playbook | Opportunités (brand → reply rate) | Conversion (crédibilité) | Méthodo servie aux clients (§13-14) |
| F12 | Campagnes créatives / gifting / brand echo | Opportunités (reply rate uplift) | Conversion (crédibilité) | Méthodo, partiellement productisable (§10-11, §15) |

Hiérarchie de séquencement qui découle de la doctrine demand-first (§20) : F1→F5 (générer) avant F6→F7 (optimiser la conversion). Sam est cohérent : son produit a commencé par la demand gen, et le routing rep-level — qui ne sert que des équipes multi-closers, pas son ICP founder-led actuel — est un pari upmarket (§5 « steak dinners with committees »), pas une feature pour son client d'aujourd'hui.

---

## 2. Audit + specs par feature

Format par feature : ce que Sam affirme (verbatim) → lecture CRO → audit PM (forces, angles morts, risques) → spec Kiro condensée (user story, critères EARS, design, edge cases, métriques, tasks).

---

### F1. TAM Builder agentique (§2)

**Ce que Sam affirme**
- « There are specific sales workflows that AI and agents are just better than humans at — the things that are fully online. An example: building your TAM based off your ICP. »
- Historiquement « a meaningful percentage » du temps SDR ; « The outreach was actually the easier part ».
- « All of this can now be done in near-zero time. »

**Lecture CRO**
Bouge le volume d'opportunités adressables et libère du temps humain pour le customer-facing (§3, §9). Le TAM est l'actif amont : toute la machine en hérite. Un TAM imprécis = des séquences pertinentes envoyées aux mauvaises sociétés = reply rates morts ET marque brûlée sur le vrai marché.

**Audit PM**
- *Force* : le claim « fully online ⇒ agent supérieur » est bien délimité — Sam ne prétend pas que l'agent est meilleur partout (§3, §9), ce qui rend la thèse crédible.
- *Angle mort 1 — l'ICP est une hypothèse, pas une donnée*. « You have an idea of what that list looks like » suppose un ICP connu. Pour une seed, l'ICP est faux au départ par définition. Le TAM Builder sans boucle de révision (F9) fige une erreur. Le transcript ne traite jamais la révision d'ICP.
- *Angle mort 2 — aucune mention de qualité* : couverture des sources, déduplication, fraîcheur, taux d'erreur firmographique. « Near-zero time » dit le coût, pas la précision. Un PM doit fixer la barre des deux.
- *Risque* : le filtrage silencieux — si une source ne couvre pas un critère (ex. business model PLG/SLG, rarement structuré), filtrer dessus exclut silencieusement des comptes valides. (Note interne : on a exactement ce problème documenté côté Apollo — search masque les firmographiques.)

**Spec Kiro — TAM-BUILD**

*User story* : en tant que founder, je décris mon ICP en langage naturel et j'obtiens une base de tous les comptes vendables, dont je peux vérifier la précision avant que quoi que ce soit ne parte en séquence.

*Critères d'acceptation (EARS)*
1. WHEN l'utilisateur décrit son ICP en langage naturel, THE SYSTEM SHALL le traduire en critères structurés éditables (géo, effectif, verticale/sous-verticale, business model, signaux de stack) et afficher cette traduction pour validation explicite avant tout sourcing.
2. WHEN le TAM est construit, THE SYSTEM SHALL exposer par compte la provenance et la date de fraîcheur de chaque champ firmographique.
3. IF un critère de l'ICP n'est couvert par les sources que sur moins de X % des comptes candidats, THEN THE SYSTEM SHALL le déclarer « critère non fiable » et proposer de le traiter en scoring (F2) plutôt qu'en filtre dur — jamais de filtrage silencieux.
4. WHEN le TAM initial est prêt, THE SYSTEM SHALL imposer une porte de validation : un échantillon aléatoire de 20 comptes présenté à l'utilisateur ; en dessous de 85 % jugés « dans la cible », le sourcing est re-paramétré au lieu d'activer les séquences.
5. WHEN un compte est ajouté ou modifié post-construction (refresh), THE SYSTEM SHALL journaliser l'événement (le TAM est vivant, pas un export).
6. IF deux sources divergent sur un champ, THEN THE SYSTEM SHALL garder les deux valeurs avec provenance et choisir selon une règle de priorité visible, pas écraser.

*Design (points clés)*
- Pipeline : ICP NL → critères → sourcing multi-fournisseurs → enrichissement firmographique systématique post-sourcing (les APIs de recherche masquent souvent les firmographiques : enrichir par domaine après coup) → dédup par domaine + raison sociale → scoring (F2).
- Fraîcheur tierée par score de compte (lié F2/F3) : comptes chauds re-crawlés souvent, queue de TAM rarement — c'est ce qui rend le « basically real time » de §2 économiquement tenable.
- Échec partiel : un fournisseur down ⇒ le TAM se construit avec trous étiquetés, pas un échec global silencieux.

*Edge cases* : ICP contradictoire (« startups ET 5000 employés ») ⇒ retour utilisateur, pas une moyenne ; marchés < 500 comptes (le TAM exhaustif change la stratégie : couverture 100 % + profondeur par compte) ; comptes hors sources (le user peut injecter une liste, qui suit le même pipeline d'enrichissement).

*Métriques de succès (CRO)* : précision échantillonnée ≥ 85 % ; % de comptes avec ≥ 1 buyer actionnable (lié F4) ; time-to-first-list < 1 h ; % du TAM touché par séquence à 90 jours (un TAM construit mais pas travaillé = vanity).

*Tasks (ordre)* : (1) parseur ICP NL→critères + UI de validation [verify : 10 ICP de test traduits correctement] ; (2) orchestrateur sourcing + enrichissement post-sourcing [verify : champs firmographiques non nuls > 90 %] ; (3) provenance + fraîcheur par champ [verify : visible sur fiche compte] ; (4) porte d'échantillonnage 20 comptes [verify : workflow bloquant testé] ; (5) refresh tieré + journal [verify : event log] ; (6) test E2E ICP→TAM→sample-gate.

---

### F2. Account Scoring (§2)

**Ce que Sam affirme**
- « Scoring your accounts, because not every company is created equal. » Exemples de priors : HQ à San Francisco, « sweet spot for employee count », business model sales-led vs product-led.
- « Historically a very manual process. »

**Lecture CRO**
Le scoring n'augmente pas le volume, il réalloue l'effort — donc il bouge la conversion par unité d'effort. C'est la variable cachée de l'équation : à capacité de demos constante (§20 « demand-rich environment »), le score décide quelles demos on prend.

**Audit PM**
- *Conflation à clarifier* : les exemples de Sam (SF, effectif, business model) sont des **priors déclaratifs** — des croyances du founder — pas des poids appris. Le transcript saute sans transition des priors (§2) aux insights appris (§8). Un produit honnête sépare les deux couches et étiquette laquelle parle.
- *Risque 1 — boucle auto-réalisatrice* : on ne travaille que les hauts scores ⇒ seuls les hauts scores génèrent des outcomes ⇒ le score se confirme lui-même. Sans quota d'exploration, le système n'apprend jamais que son prior est faux.
- *Risque 2 — score opaque* : un score caché que le founder ne peut pas contester détruit la confiance au premier désaccord (« pourquoi cette boîte que je connais est à 34 ? »).

**Spec Kiro — ACCT-SCORE**

*User story* : en tant que founder, chaque compte porte un score de priorité dont je vois les raisons, qui démarre sur mes critères déclarés et n'évolue vers de l'appris que quand il y a assez de données pour le justifier.

*Critères d'acceptation (EARS)*
1. WHEN un score est affiché, THE SYSTEM SHALL montrer les 3 facteurs dominants avec leurs valeurs (« HQ Suisse romande : +22 », « effectif 340 : +15 »).
2. WHILE le tenant a moins de N closed-won (proposé : 30), THE SYSTEM SHALL maintenir le score en mode « déclaratif » étiqueté comme tel, sans pondération apprise.
3. WHEN le mode appris s'active, THE SYSTEM SHALL versionner les pondérations et notifier le changement (« le score v3 privilégie désormais les 50-200 FTE : 12 closed-won sur 14 dans cette tranche »).
4. THE SYSTEM SHALL réserver un quota d'exploration : E % (proposé : 15 %) du volume de séquences alloué à des comptes hors top-score, étiquetés « exploration », pour casser la boucle auto-réalisatrice.
5. IF l'insights agent (F6) propose une mise à jour de pondération, THEN THE SYSTEM SHALL la soumettre à validation humaine avec l'évidence — jamais d'auto-application.
6. WHEN l'utilisateur force un score (override), THE SYSTEM SHALL le respecter, le journaliser, et le confronter plus tard à l'outcome (apprentissage des overrides).

*Design* : deux couches additives (déclaratif : poids issus de l'ICP validé F1 ; appris : poids issus de F6/F9 avec n suffisant) ; recalcul à chaque refresh TAM ; le score est un champ first-class consommé par F3 (fraîcheur de crawl), F5 (priorité de séquence) et le diagnostic F8.

*Edge cases* : tenant mono-segment (le score discrimine peu ⇒ le dire, pas afficher une fausse granularité) ; données manquantes sur un facteur (neutre, pas pénalisant) ; deux ICP actifs (score par ICP, pas une moyenne).

*Métriques* : lift de conversion top-quartile vs bottom-quartile (le score « marche » si l'écart est réel) ; % d'overrides utilisateurs (trop d'overrides = score faux ou mal expliqué) ; part d'exploration réellement envoyée.

*Tasks* : (1) score déclaratif + facteurs visibles [verify : fiche compte] ; (2) seuil n + étiquette de mode [verify : tenant vierge reste déclaratif] ; (3) quota d'exploration dans l'allocateur de séquences [verify : 15 % ± 2 mesuré sur 4 semaines simulées] ; (4) versionnage + notification [verify : changelog] ; (5) E2E override→outcome.

---

### F3. Signal Overlay + intent timing (§2, §19)

**Ce que Sam affirme**
- « Then you overlay signals: are they visiting the website, hiring for a certain role? » ; « You can have an agent crawl every website in your entire database in basically real time. »
- §19, la doctrine : « they work because they're actually relevant ». Exemples : job posting d'EA → « Saw this posting [hyperlink to the job posting]. Want to try us for one week, free? » ; Nowadays → crawl des blog posts d'offsite → « Saw your blog post — we can help you plan the next one. You're reaching the right person... and it's top of mind because they wrote a blog post about it. »
- L'anti-pattern, verbatim : « "Saw you're from Kansas City, go Chiefs — are you thinking about finance workflow automation?" I'm actually more averse to that than to just telling me about the finance thing you build. »

**Lecture CRO**
Le signal bouge les deux premières variables à la fois : le reply rate (opportunités) parce que le message arrive au bon moment avec une raison réelle, et la conversion parce qu'on parle à la bonne personne (« the one who planned the thing ») d'un problème qu'elle vient d'exprimer. C'est la feature au meilleur ratio levier/coût du discours.

**Audit PM**
- *Force* : la doctrine §19 est un critère de qualité produit **testable** — « le signal bénéficie-t-il au destinataire ? » discrimine mécaniquement le signal utile (job posting = besoin exprimé) du signal cosmétique (ville, sport). Rare qu'un CEO donne un critère aussi opérationnalisable.
- *Angle mort 1 — coût du « basically real time »* : crawler tout le TAM en continu est économiquement absurde. Implicite à expliciter : fraîcheur tierée par score (F2).
- *Angle mort 2 — la péremption* : un job posting de 6 mois n'est plus un signal, c'est un fossile. Aucune mention de decay.
- *Angle mort 3 — la vérifiabilité* : l'exemple de Sam inclut « [hyperlink to the job posting] » — le signal cité doit être vérifiable par le destinataire. Si l'URL est morte au moment de l'envoi, le message devient un mensonge détectable. Fail-closed obligatoire.
- *Risque* : taxonomie ouverte (« crawl the internet for blog posts about a company kickoff » — Nowadays a défini SON signal). La vraie feature n'est pas une liste de signaux, c'est un **constructeur de signaux par ICP** ; sans garde-fous, l'utilisateur définit des signaux à 90 % de faux positifs et brûle son TAM.

**Spec Kiro — SIGNAL-OVERLAY**

*User story* : en tant que founder, je définis les signaux d'intention propres à mon produit ; le système surveille mon TAM, déclenche l'outreach au bon moment et n'utilise jamais un signal qu'il ne peut pas citer.

*Critères d'acceptation (EARS)*
1. WHEN un signal est utilisé dans un message, THE SYSTEM SHALL inclure la référence vérifiable (URL ou citation datée) et re-vérifier sa validité au moment de l'envoi ; IF la source n'est plus accessible, THEN le message SHALL être reformulé sans le signal ou mis en attente — jamais envoyé avec une citation morte.
2. WHEN un signal dépasse son âge maximal (configurable par type ; proposé : job posting 30 j, blog post 60 j, levée 180 j — cf. la fenêtre Veuve Clicquot §15 « raised in the last six months »), THE SYSTEM SHALL le déclasser : il peut encore prioriser un compte, plus jamais être cité dans un message.
3. WHEN l'utilisateur crée un signal personnalisé en langage naturel (« blog posts sur un kickoff »), THE SYSTEM SHALL générer la définition, l'exécuter sur un échantillon de 20 comptes, et présenter les hits pour calibration avant activation sur le TAM entier.
4. IF un draft contient une personnalisation de type « personnel non pertinent » (sport, ville natale, alma mater sans lien avec l'offre), THEN THE SYSTEM SHALL la bloquer avec la raison — la doctrine §19 encodée en lint de draft.
5. WHEN un signal se déclenche sur un compte, THE SYSTEM SHALL router vers la personne concernée par le signal (l'auteur du blog post, le hiring manager du posting) et pas seulement le persona par défaut (F4).
6. THE SYSTEM SHALL échelonner la fraîcheur de surveillance selon le score du compte (tier chaud : quotidien ; tier froid : hebdomadaire+), et l'afficher.

*Design* : taxonomie de base (hiring, publication de contenu, levée, visite web, changement de stack/techno) + signaux custom par tenant ; chaque signal stocké avec {type, source_url, extrait, detected_at, expires_at, account_id, person_id?} ; pipeline détection → scoring d'actionnabilité → éligibilité message (vérif URL à T-0 de l'envoi) ; le détecteur custom est une définition exécutable versionnée, pas un prompt jetable.
*Lien méthodo (notre doctrine interne)* : LLM = étape contrainte fail-closed (extraction/classification du signal), jamais juge final de l'envoi.

*Edge cases* : signal multiple sur le même compte (choisir LE plus actionnable, pas empiler — un message à un signal) ; signal détecté sur un compte déjà en séquence (insertion contextuelle vs collision de cadence) ; faux positif signalé par l'utilisateur (feedback → recalibration du détecteur).

*Métriques* : reply rate des messages signal-déclenchés vs cold (l'écart EST la feature ; si < +50 % relatif, les signaux sont mal définis) ; précision des signaux custom (échantillonnée) ; % de signaux cités vérifiables à l'envoi = 100 % (invariant).

*Tasks* : (1) modèle de données signal + taxonomie de base [verify : migration + insertion] ; (2) vérification de citation à l'envoi, fail-closed [verify : test URL morte ⇒ message retenu] ; (3) decay par type [verify : signal périmé non citable] ; (4) constructeur de signaux custom + calibration 20 comptes [verify : workflow E2E] ; (5) lint anti-personnalisation-cosmétique [verify : draft « go Chiefs » bloqué] ; (6) routing vers la personne du signal [verify : blog post → auteur].

---

### F4. Buyer Finder — personas et contacts (§2, §8)

**Ce que Sam affirme**
- « Then finding the buyers: this startup, we sell to the sales leader — who is it, what's their email? That used to be manual. »
- L'insight Brex (§8) : « finance people converted at ~4x the rate of controllers » — découvert seulement quand quelqu'un a regardé, parce que « a rep would show up on a call and not note whether they were talking to a CFO, a VP Finance, an FP&A person, a controller ».

**Lecture CRO**
Le bon interlocuteur est un multiplicateur de conversion (4x chez Brex) ET une condition d'opportunité (pas d'email = pas de touch). Le persona n'est pas une métadonnée : c'est la variable de ciblage la plus puissante que le transcript documente avec un chiffre.

**Audit PM**
- *La leçon cachée de l'anecdote Brex* : l'insight 4x n'a été possible que parce que le persona a fini par être **tracké**. La feature amont de l'insights agent (F6), c'est la **capture automatique du persona sur chaque interaction** — sans saisie manuelle, puisque « it's not in any of their DNA » de noter ça (§8). Le transcript ne le dit jamais explicitement ; c'est pourtant la dépendance critique.
- *Angle mort — la délivrabilité comme condition de survie* : « what's their email? » sans vérification = bounces = domaine grillé = TOUTE la machine s'arrête. Le transcript saute le sujet (à peine « domains that aren't your real domain » §17). Pour un CRO, la délivrabilité n'est pas une feature, c'est l'oxygène.
- *Risque* : taxonomie de personas trop fine (FP&A vs VP Finance vs CFO) = cellules statistiques vides en aval (F6). La taxonomie doit être hiérarchique (famille → titre exact) pour agréger proprement.

**Spec Kiro — BUYER-FIND**

*User story* : en tant que founder, chaque compte du TAM a son ou ses buyers identifiés avec un email vérifié et un persona classé, et chaque interaction enregistre automatiquement à quel persona j'ai réellement parlé.

*Critères d'acceptation (EARS)*
1. WHEN un compte entre dans le TAM, THE SYSTEM SHALL tenter d'identifier ≥ 1 contact du persona cible avec email vérifié ; IF aucun contact actionnable, THEN le compte SHALL être étiqueté « non actionnable — raison » et exclu des séquences (pas d'envoi à l'aveugle).
2. THE SYSTEM SHALL refuser d'envoyer à une adresse non vérifiée si le taux de bounce glissant du domaine expéditeur dépasse 2 % (protection de l'actif délivrabilité).
3. WHEN une interaction est capturée (call, email, meeting), THE SYSTEM SHALL classifier le persona de chaque participant (famille + titre) depuis le titre déclaré et le contexte, sans saisie manuelle — c'est la donnée d'entrée de F6.
4. THE SYSTEM SHALL maintenir une taxonomie hiérarchique de personas (famille → seniorité → titre exact) pour que F6 puisse agréger à la maille qui a du n.
5. WHEN le persona cible déclaré diverge du persona qui convertit (signal F6), THE SYSTEM SHALL proposer la bascule des first touches (« §8 : we oriented all first touches toward finance personas ») avec l'évidence.
6. IF un signal (F3) désigne une personne précise, THEN elle SHALL primer sur le persona par défaut du compte.

*Design* : cascade de fournisseurs de contacts avec coût/qualité par étage et provenance stockée ; vérification email systématique pré-séquence ; classification persona = enum hiérarchique stocké (jamais de parsing à la volée dans l'UI — règle qu'on s'applique déjà) ; le persona effectif d'une interaction est extrait du transcript/des participants, recoupé avec le titre déclaré.

*Edge cases* : multi-buyers (champion + economic buyer — tracker les deux rôles, le multi-threading triple les taux de close à l'échelle) ; titre ambigu (« Operations » ⇒ famille large, pas un pari) ; contact parti de la boîte (signal de churn de donnée ET signal d'opportunité chez son nouvel employeur).

*Métriques* : % du TAM actionnable (buyer + email vérifié) — c'est LE chiffre de couverture amont ; bounce rate < 2 % (invariant) ; % d'interactions avec persona auto-classé ≥ 95 % (sinon F6 est aveugle).

*Tasks* : (1) cascade contacts + vérification + provenance [verify : compte test → contact vérifié] ; (2) étiquette « non actionnable » + exclusion séquences [verify : pas d'envoi] ; (3) classification persona des interactions [verify : 20 transcripts classés, précision ≥ 90 %] ; (4) taxonomie hiérarchique [verify : agrégation famille] ; (5) E2E signal-personne > persona-défaut.

---

### F5. Séquences multi-canal + doctrine founder-sender (§17, §18)

**Ce que Sam affirme**
- « The opinions I'll express here are ingrained into the platform itself. » (la phrase la plus importante du transcript pour un PM : la méthodologie EST le produit)
- « Who sends the outbound is very important... you want the origination to come from the founder. Founders get higher reply rates... It's founder-to-founder — not necessarily "I'm selling you something", even though it really is. »
- Multi-canal : « The table stakes are LinkedIn and email. It's not one plus one equals two — it's one plus one equals four. You can say "following up from my message on LinkedIn"... You tie it all back together. » Téléphone en 3e canal selon l'industrie, gifting en 4e.
- Anti-patterns : « not just spraying the universe with cold email through domains that aren't your real domain » ; le « just following up » a « reached diminishing returns. Everyone knows it's automated. »
- Le levier créatif founder-only : l'exemple Parley — « I started Parley after watching my father... » — « content only a founder can articulate — and it leads to significantly higher reply rates. »
- « Message and sequence structure really matter — how many touchpoints, how the message is structured. Nothing earth-shattering, but it's already set up for you. »

**Lecture CRO**
Tout converge sur le reply rate (opportunités). Le founder-sender est un multiplicateur gratuit en argent et coûteux en temps founder — donc le produit n'a de sens que si le coût en temps founder par message tend vers zéro (préparation automatique, approbation rapide), sinon il cannibalise le customer-facing time (§9).

**Audit PM**
- *Force* : « already set up for you » = des défauts opinionés (structure de séquence, nombre de touches, espacement) plutôt qu'un éditeur vide. C'est le bon choix pour des founders non-vendeurs. (Cohérent avec les benchmarks : 4-7 touches optimal, 8+ triple les plaintes spam.)
- *Tension non résolue — founder-sender vs scale* : la doctrine vaut pour le segment founder-led actuel. Sam le dit lui-même : « Over time you expand beyond founders sending the outbound. » La spec doit versionner la doctrine par stage (founder-led → premiers reps → équipe), pas la coder en dur.
- *Risque opérationnel — l'intégrité cross-canal* : « following up from my message on LinkedIn » n'est légitime que si le message LinkedIn a été réellement délivré (invitation acceptée, message parti). Sinon le produit fait mentir le founder. C'est un état machine par canal avec confirmations de délivrance, pas un séquenceur naïf.
- *Risque identité* : envoyer « en tant que » founder = délégation d'identité. Le founder doit voir et approuver ce qui part sous son nom, au moins au début — sinon premier message raté = confiance détruite et churn.

**Spec Kiro — SEQ-MULTI**

*User story* : en tant que founder, mes séquences partent de mon identité réelle (mon domaine, mon LinkedIn), multi-canal, avec des messages que j'aurais pu écrire, et je garde le contrôle de ce qui sort sous mon nom sans que ça me coûte plus de quelques minutes par jour.

*Critères d'acceptation (EARS)*
1. WHEN un workspace est en stage « founder-led », THE SYSTEM SHALL définir le founder comme expéditeur par défaut de toute séquence et exiger son approbation explicite des N premiers messages (proposé : 20) avant de passer en auto-envoi par type de message.
2. IF une étape email référence un touch d'un autre canal (« following up from LinkedIn »), THEN THE SYSTEM SHALL vérifier la délivrance effective de ce touch ; sinon, reformuler l'étape sans la référence.
3. THE SYSTEM SHALL refuser la configuration d'envoi depuis un domaine qui n'est pas le domaine réel de l'entreprise (doctrine §17) et imposer des plafonds de volume par boîte (warmup progressif).
4. WHEN une séquence est créée, THE SYSTEM SHALL proposer une structure par défaut (6-8 touches / 15 jours / email+LinkedIn entrelacés, téléphone optionnel selon l'industrie) éditable — jamais un canvas vide.
5. IF un draft de relance est du type « just following up » sans valeur ajoutée nouvelle, THEN THE SYSTEM SHALL le rejeter et exiger un apport (nouveau signal, nouvelle ressource, nouvel angle) — l'anti-pattern §18 encodé.
6. WHEN l'onboarding du workspace capture l'histoire d'origine du founder (« pourquoi j'ai créé X »), THE SYSTEM SHALL la proposer comme bloc de message là où elle est pertinente (l'asset Parley §17) — et nulle part ailleurs.
7. WHEN le stage du workspace passe à « équipe de vente », THE SYSTEM SHALL proposer la transition d'expéditeur (reps en origination, founder en escalade) au lieu d'appliquer silencieusement l'ancienne doctrine.

*Design* : séquenceur à états par canal (chaque étape a des préconditions de délivrance) ; identité = boîtes réelles par utilisateur (jamais d'envoi cross-owner — règle qu'on s'applique déjà) ; file d'approbation founder avec apprentissage (après N approbations sans édition sur un type de message, proposer l'auto-envoi de CE type) ; cadence respectant la collision (un prospect, une conversation à la fois).

*Edge cases* : invitation LinkedIn jamais acceptée (la séquence continue par email, sans référence croisée) ; réponse sur un canal pendant qu'une étape est queued sur l'autre (stop global immédiat de la séquence) ; founder en vacances avec file d'approbation pleine (escalade ou pause, jamais d'envoi non approuvé par défaut).

*Métriques* : reply rate par canal et par combinaison (le « 1+1=4 » §18 doit se voir dans les données : reply rate multi-canal vs mono-canal sur cohortes comparables) ; temps founder par message approuvé (< 30 s en régime de croisière) ; % de messages édités avant approbation (proxy de qualité des drafts).

*Tasks* : (1) état machine cross-canal + préconditions [verify : test étape dépendante retenue] ; (2) file d'approbation + apprentissage par type [verify : bascule auto après N] ; (3) garde-fous domaine réel + caps volume [verify : config domaine jetable rejetée] ; (4) templates par défaut + bloc origin-story [verify : séquence créée non vide] ; (5) lint « just following up » [verify : draft rejeté] ; (6) E2E réponse ⇒ stop multi-canal.

---

### F6. Insights Agent (§8) — la pièce maîtresse, et le plus gros risque

**Ce que Sam affirme**
- « We have an insights agent, trained to cut data every possible way — buyer, location, vertical and sub-vertical, segment and sub-segment — and see when you reach statistically significant information worth surfacing to a customer. »
- Les deux exemples fondateurs : Zenefits — « the thing influencing conversion rates more than anything was where the company was headquartered » ; Brex — « finance people converted at ~4x the rate of controllers ».
- Le point décisif : « Then the next step is logical: we oriented all our sales resources around the states with the highest conversion rates; we oriented all first touches toward finance personas. » — l'insight ne vaut que par la réallocation qu'il déclenche.
- Et l'étoile polaire : « What are the characteristics of companies that are closing, to apply back to targeting — not the characteristics of companies we can get a meeting with. »

**Lecture CRO**
C'est la feature de conversion par excellence — elle remplace « a BCG- or McKinsey-style analyst » et des années d'angle mort (« companies wouldn't realize these insights until they were a couple hundred employees »). Sa valeur est conditionnelle : insight → action appliquée → effet mesuré. Un insight non actionné est un rapport ; un insight faux actionné est une destruction de pipeline.

**Audit PM — le piège statistique (risque produit n°1 du discours)**
- Les deux exemples fondateurs ont été découverts **à l'échelle** (Zenefits et Brex à des centaines d'employés, des milliers d'opportunités). Le client Monaco est une seed/Series A avec 20-50 opportunités par trimestre. « Cut data every possible way » sur ce volume = problème de comparaisons multiples garanti : en coupant 50 dimensions sur 40 deals, on TROUVERA des écarts « significatifs » purement aléatoires. Un agent qui industrialise le p-hacking est pire que pas d'agent : il produit des insights faux, présentés avec l'autorité de la machine, qui déclenchent des réallocations destructrices.
- « Statistically significant » est invoqué sans seuil, sans correction, sans taille de cellule minimale. C'est exactement le genre de claim qu'un PM doit transformer en garde-fous chiffrés ou refuser de shipper.
- Confondeurs non mentionnés : SF-vs-reste corrèle avec taille, secteur, maturité — l'écart géographique de Zenefits avait une cause structurelle (réglementation assurance par État) que Sam connaissait par expertise métier, pas par la donnée seule. L'agent doit chercher la colinéarité avant de conclure.
- La version honnête à petit n existe : proposer des **expériences** plutôt que des conclusions (« 7/9 vs 2/8 sur ce découpage — trop tôt pour conclure ; je route les 20 prochains first touches 50/50 pour tester »). C'est ce qui sépare une intelligence mesurée d'un générateur de plausible.

**Spec Kiro — INSIGHTS-AGENT**

*User story* : en tant que founder, le système me dit ce qui distingue mes deals qui closent, avec un niveau de confiance honnête, me propose l'action qui en découle, et vérifie ensuite que l'action a eu l'effet promis.

*Critères d'acceptation (EARS)*
1. WHEN l'agent détecte un écart de conversion entre cohortes, THE SYSTEM SHALL le classer en trois tiers : « observation » (n insuffisant), « hypothèse à tester » (signal présent, sous le seuil), « insight » (n par cellule ≥ seuil ET significatif après correction des comparaisons multiples) — et n'employer le mot « insight » que pour le tiers 3.
2. IF un écart est en tiers « hypothèse », THEN THE SYSTEM SHALL proposer un plan d'expérience (allocation contrôlée des prochains first touches, durée, n cible) au lieu d'une conclusion.
3. WHEN un insight est présenté, THE SYSTEM SHALL exposer l'évidence complète : le découpage, les n, les taux, l'intervalle, et les confondeurs vérifiés (colinéarité géo × taille × secteur).
4. WHEN un insight est appliqué (réallocation de ciblage, bascule de persona, repondération de score), THE SYSTEM SHALL snapshoter la baseline et mesurer l'effet à J+30 et J+60 ; IF l'effet ne se confirme pas, THEN l'insight SHALL être révoqué visiblement et la réallocation proposée au retrait.
5. THE SYSTEM SHALL calculer les insights sur les caractéristiques des deals **qui closent** (étoile polaire §8), et étiqueter séparément tout pattern qui ne prédit que la prise de meeting.
6. WHEN aucune cellule n'atteint le seuil (cas nominal d'une seed), THE SYSTEM SHALL le dire explicitement (« pas encore assez de deals pour apprendre — voici les 2 hypothèses les plus prometteuses à tester ») plutôt que produire du bruit.

*Design* : moteur d'analyse sur le plan de données unifié (interactions + personas F4 + signaux F3 + outcomes pipeline) ; hiérarchie de découpages (famille de persona avant titre exact, région avant ville) pour maximiser le n par cellule ; correction de type Benjamini-Hochberg ou priors hiérarchiques ; registre des insights avec cycle de vie (proposé → testé → appliqué → confirmé/révoqué) ; chaque application est réversible et journalisée.
*Lien méthodo interne* : c'est l'incarnation exacte de notre règle « intelligence grounded/validated/measured, LLM = étape contrainte » — ici le LLM rédige l'explication, les stats décident.

*Edge cases* : tenant mono-segment (rien à comparer ⇒ le dire) ; saisonnalité (cohortes par période, pas tout-temps) ; insight contradictoire avec un override utilisateur (présenter le conflit, l'humain tranche) ; ACV très hétérogène (pondérer par revenu, pas par count — sinon l'agent optimise les petits deals faciles).

*Métriques* : taux de confirmation à J+60 des insights appliqués (cible > 70 % — sinon les seuils sont trop laxistes) ; % de sorties en tiers honnête (« pas assez de données ») chez les tenants < 30 deals — devrait être majoritaire ; lift de conversion réalisé post-application (la seule métrique qui justifie la feature).

*Tasks* : (1) plan de données analytique (cohortes, cellules, n) [verify : requêtes sur fixtures] ; (2) moteur de tiers + correction multi-comparaisons [verify : test sur données synthétiques sans effet réel ⇒ zéro « insight » émis] ; (3) générateur de plans d'expérience [verify : hypothèse ⇒ plan 50/50 cohérent] ; (4) cycle de vie + mesure J+30/J+60 + révocation [verify : E2E sur fixture avec effet planté] ; (5) UI évidence complète [verify : n, taux, confondeurs visibles] ; (6) eval suite : 15 cas (effets réels, effets nuls, confondeurs) — l'agent doit discriminer.

---

### F7. Routing rep-level outcome-based (§8)

**Ce que Sam affirme**
- « We had reps who sold far better to founders than to finance people... you get insights at the rep level... AI can then route the meeting to whoever has the highest probability of closing it. »
- « You can gamify everything, all oriented around outcomes... And it's totally objective — not the sales leader favoring someone with more opportunities. It's all AI. »
- En toile de fond, la position comp : « do you compensate an SDR on meetings booked — which they fully control — or on the revenue those meetings generate? I land on revenue. »

**Lecture CRO**
Pure conversion à demande constante : la même demo close plus si elle atterrit chez le bon rep. Mais pour l'ICP actuel de Monaco (founder-led, 0-3 vendeurs), la feature est vide — elle ne sert que le mouvement upmarket (§5). Et le routing détermine le revenu des reps : c'est une feature de comp autant que de conversion.

**Audit PM**
- *Surclaim à dégonfler* : « totally objective — it's all AI » est faux au sens où la fonction objectif (probabilité de close ? revenu espéré ? LTV ? équité de distribution ?) est un choix de management encodé par le produit. L'objectivité revendiquée masque ce choix. Un PM doit l'exposer, pas le cacher.
- *Le piège statistique au carré* : cellules rep × type d'opportunité — avec 5 reps et 6 segments, 30 cellules sur quelques dizaines de deals chacun au mieux. Encore plus vide que F6. Les seuils de F6 s'appliquent doublement.
- *Boucle de verrouillage* : le rep routé sur les founders devient encore meilleur sur les founders (pratique) et n'apprend jamais le reste ; le nouveau rep n'a pas d'historique ⇒ il ne reçoit rien ⇒ il n'aura jamais d'historique. Quota d'exploration obligatoire, comme F2.
- *Équité et contestabilité* : un routing qui affecte la paie doit être auditable (facteurs journalisés), contestable (override manager avec motif), et transparent pour les reps — sinon c'est un grief RH automatisé.

**Spec Kiro — REP-ROUTE**

*User story* : en tant que sales leader, chaque meeting est proposé au rep qui a la meilleure probabilité de le closer, je vois pourquoi, je peux passer outre, et les nouveaux reps reçoivent de quoi faire leurs preuves.

*Critères d'acceptation (EARS)*
1. IF l'équipe compte moins de 3 closers OU moins de N meetings routés par segment (proposé : 20), THEN THE SYSTEM SHALL rester en mode « suggestion motivée » — jamais d'auto-assignation.
2. WHEN un meeting est routé, THE SYSTEM SHALL journaliser les facteurs, le score de chaque rep candidat, et permettre l'override manager avec motif (piste d'audit complète).
3. THE SYSTEM SHALL réserver un quota d'exploration par rep (chaque rep reçoit une part de segments hors de son profil historique) — anti-verrouillage et rampe des nouveaux.
4. WHEN la fonction objectif est configurée (close rate, revenu espéré, charge équilibrée), THE SYSTEM SHALL l'afficher à l'équipe — le choix de management est explicite, pas enfoui.
5. WHEN un pattern rep × segment atteint le tiers « insight » (mêmes seuils que F6), THE SYSTEM SHALL le présenter au sales leader avant de l'activer dans le routing.

*Design* : consommateur direct de F6 (mêmes tiers de confiance, mêmes corrections) ; le routing est une politique versionnée ; gate produit : la feature n'apparaît qu'aux workspaces ≥ 3 closers (pour l'ICP founder-led actuel, elle est invisible — roadmap upmarket).

*Edge cases* : rep surchargé (le meilleur closer ne peut pas tout prendre — contrainte de capacité dans l'objectif) ; congés/départs (redistribution sans casser les cohortes de mesure) ; deal multi-segment (règle de précédence visible).

*Métriques* : lift de close rate des meetings routés vs baseline pré-routing (cohorté) ; taux d'override manager (> 30 % = le modèle ou la confiance est cassé) ; distribution de revenu par rep avant/après (le produit doit pouvoir prouver qu'il n'a pas concentré le pipeline).

*Tasks* : (1) gate ≥ 3 closers [verify : invisible en dessous] ; (2) mode suggestion + journal facteurs [verify : audit trail] ; (3) quota d'exploration [verify : distribution mesurée] ; (4) config fonction objectif visible [verify : UI équipe] ; (5) E2E insight F6 → politique de routing → mesure.

---

### F8. Analytics outcome-first + diagnostic demand-vs-conversion (§7, §20)

**Ce que Sam affirme**
- « Revenue has three variables: opportunities (or leads) × conversion rates × ACV. »
- Le misdiagnostic : « nine out of ten founders or early sales leaders misdiagnose the bottleneck as conversion rates » quand « the bottleneck... is demand gen: opportunity creation ». Le symptôme verbatim : le deal qui a « pushed » en fin de mois et qu'on sur-analyse — « The problem isn't that you didn't convert that one customer — it's that you didn't have five customers in play. »
- La math : « you convert 10% of demos. Moving to 15%... is actually a 50% increase, and especially at scale that's hard. Versus: last month we had 10 demos; going to 20 — effectively doubling demos — is... far easier. »
- La règle d'allocation : « if a channel is working for you in demand gen, double and triple down on it until you... can't take more demos », jusqu'au « demand-rich environment ».

**Lecture CRO**
C'est la méta-feature : le reporting qui dit OÙ porter l'effort. La doctrine de Sam est productisable telle quelle — le dashboard ne doit pas montrer des métriques, il doit rendre un **diagnostic** : « ton bottleneck est la demande » (ou la conversion, ou la capacité), avec le calcul visible.

**Audit PM**
- *Force* : le « 9/10 » est une heuristique d'expérience, pas une donnée — mais comme **prior par défaut** c'est du design intelligent : en l'absence de preuve contraire, orienter vers la demand gen est l'erreur la moins coûteuse (sur-investir la demande fait du pipeline ; sur-optimiser la conversion sur 10 demos ne produit rien).
- *Honnêteté à petit n, encore* : afficher « conversion 16,7 % » sur 6 opportunités est un mensonge de précision. Intervalles ou agrégats glissants obligatoires.
- *La pièce manquante : le modèle de capacité*. « Until you can't take more demos » suppose de connaître la capacité de demos de l'équipe. C'est une donnée que le produit possède (calendriers, meetings capturés) — le « demand-rich environment » devient un état calculable : opportunités en jeu vs capacité × couverture cible.
- *Comp sur le revenu* (§8) : si on comp les SDR/agents sur le revenu aval, les fenêtres d'attribution et le lag des deals doivent être cohortés — un reporting calendaire mensuel casse cette logique (le meeting de mars close en juin).

**Spec Kiro — REV-EQUATION**

*User story* : en tant que founder, j'ouvre le dashboard et je sais immédiatement laquelle des trois variables me bloque, ce que vaut marginalement chaque action (une demo de plus vs un point de conversion de plus), et si je suis en environnement demand-rich ou demand-constrained.

*Critères d'acceptation (EARS)*
1. WHEN le dashboard s'ouvre, THE SYSTEM SHALL afficher l'équation instanciée (opps × conversion × ACV = run-rate vs objectif) avec la variable bottleneck identifiée et la sensibilité marginale de chaque variable (« +1 demo/semaine = +X CHF de run-rate ; +5 pts de conversion = +Y »).
2. IF les opportunités en jeu < K × (objectif mensuel / ACV) (couverture cible, K configurable, défaut 4-5), THEN THE SYSTEM SHALL déclarer l'état « demand-constrained » et orienter les recommandations vers la génération (doctrine §20), calcul visible.
3. WHEN l'utilisateur sur-analyse un deal perdu isolé (symptôme §20), THE SYSTEM SHALL recadrer avec la couverture (« ce mois-ci tu avais 2 deals en jeu pour un objectif qui en demande 5 — le problème est en amont »).
4. IF une cellule de calcul a n < 15, THEN THE SYSTEM SHALL afficher l'intervalle ou l'agrégat trimestriel glissant — jamais un pourcentage nu sur 6 deals.
5. WHEN un canal de demand gen montre un coût par opportunité stable ou décroissant sur volume croissant, THE SYSTEM SHALL recommander le « double down » (§20) tant que la capacité de demos n'est pas saturée.
6. THE SYSTEM SHALL calculer la capacité de demos (calendriers + historique) et afficher l'écart capacité vs demande — la définition opérationnelle du « demand-rich environment ».
7. WHEN des métriques sont rapportées par cohorte d'origination (pour le comp au revenu §8), THE SYSTEM SHALL suivre chaque cohorte de meetings jusqu'au close, pas par mois calendaire.

*Design* : trois variables calculées depuis le plan de données (pas de saisie) ; bottleneck = min de sensibilité marginale ajustée de la difficulté (le lift de conversion est pondéré « hard » par défaut, doctrine §20) ; états {demand-constrained, conversion-constrained, capacity-constrained} avec règles explicites ; tout chiffre cliquable vers les deals sous-jacents (citations, pas de boîte noire).

*Edge cases* : ACV bimodal (deux produits ⇒ deux équations, pas une moyenne) ; mois à zéro deal (état « pas assez de données », pas division par zéro maquillée) ; pipeline importé d'un CRM précédent (cohortes marquées « héritées », exclues des sensibilités).

*Métriques* : précision du diagnostic rétrospectif (sur les tenants historiques, le bottleneck déclaré à M aurait-il prédit le levier qui a marché à M+2 ?) ; adoption (le founder revient-il chaque semaine) ; % de recommandations suivies.

*Tasks* : (1) calcul des 3 variables + drill-down [verify : chiffres = SQL direct] ; (2) sensibilités marginales + bottleneck [verify : fixtures aux 3 états] ; (3) modèle de capacité demos [verify : calendrier test] ; (4) règle de couverture K× + état demand-constrained [verify : seuils] ; (5) garde-fou petit n [verify : 6 deals ⇒ intervalle] ; (6) cohortes d'origination [verify : meeting mars → close juin attribué à mars].

---

### F9. Boucle fermée closed-won → ciblage (§6, §8)

**Ce que Sam affirme**
- L'argument anti-point-solution : « if you're an outbound-only product, you have no insight into ACVs, what's converting, how customers perform over time, who we just closed, how to feed that data point back to the top of the funnel. With one data plane... there are real tailwinds. »
- « What are the characteristics of companies that are closing, to apply back to targeting. »

**Lecture CRO**
C'est l'argument structurel de toute la plateforme : la boucle ferme l'équation sur elle-même (les closes d'aujourd'hui re-ciblent les opportunités de demain). C'est aussi la justification du breadth-first (§6) — sans le bas du funnel, le haut est aveugle.

**Audit PM**
- *Force* : architecturalement imparable contre les point solutions. C'est le moat de données, pas le moat de features.
- *Risque — overfitting au petit n* : extraire un « profil gagnant » de 8 closed-won, c'est apprendre du bruit. La boucle doit hériter des tiers de confiance de F6, et à petit n produire un profil « indicatif » qui ajuste les marges du TAM, pas le redéfinit.
- *Risque — la boucle optimise le passé* : si les 10 premiers clients sont venus du réseau du founder (référence §13 : « most of our revenue today comes from referrals »), le profil gagnant encode le réseau, pas le marché. Les cohortes d'origine doivent être séparées (référé vs outbound) avant d'apprendre.
- *Garde-fou humain* : une mise à jour d'ICP est une décision stratégique. Proposer avec évidence, ne jamais auto-appliquer.

**Spec Kiro — CLOSED-LOOP**

*User story* : en tant que founder, chaque deal gagné ou perdu affine le profil de qui je devrais cibler, le système me propose les mises à jour d'ICP/score avec les preuves, et je décide.

*Critères d'acceptation (EARS)*
1. WHEN un deal passe closed-won ou closed-lost, THE SYSTEM SHALL extraire son vecteur de traits (taille, géo, verticale, persona d'entrée, signal d'origine, canal, ACV, durée de cycle) et l'agréger aux profils win/loss.
2. WHEN le profil gagnant diverge du scoring actif au-delà d'un seuil, THE SYSTEM SHALL proposer une mise à jour de pondération (F2) ou d'ICP (F1) avec l'évidence — validation humaine obligatoire.
3. THE SYSTEM SHALL séparer les cohortes par origine (référé / outbound / inbound) et n'apprendre le ciblage outbound QUE des cohortes outbound — le réseau du founder n'est pas un signal de marché.
4. IF n closed-won < 30, THEN les propositions SHALL être étiquetées « indicatives » et limitées à des ajustements de marge (élargir/resserrer un critère), jamais une redéfinition d'ICP.
5. WHEN une mise à jour est appliquée, THE SYSTEM SHALL versionner l'ICP/score et mesurer l'effet sur les cohortes suivantes (même cycle de vie que F6).
6. THE SYSTEM SHALL proposer du sourcing lookalike depuis les closed-won (« 12 comptes ressemblant à tes 5 meilleurs clients ») comme action directe de demand gen.

*Design* : pipeline événementiel (deal stage change → extraction → agrégation) ; les profils win/loss sont des objets versionnés consultables ; intégration F1 (re-sourcing), F2 (repondération), F6 (mêmes seuils stat).

*Edge cases* : closed-won « hors profil » spectaculaire (l'exception ne fait pas la règle — flagger, pas apprendre) ; churn précoce d'un closed-won (le profil gagnant doit décompter les bad fits a posteriori — « how customers perform over time » §6) ; deals importés sans traits complets.

*Métriques* : précision prospective du profil (les comptes top-profil convertissent-ils mieux sur la cohorte SUIVANTE ?) ; % de propositions acceptées par le founder ; délai close → proposition.

*Tasks* : (1) extraction de traits sur transition de stage [verify : event fixture] ; (2) profils win/loss versionnés + cohortes par origine [verify : référé exclu de l'apprentissage outbound] ; (3) moteur de propositions + gate humain [verify : jamais d'auto-apply] ; (4) lookalike sourcing [verify : E2E vers F1] ; (5) mesure post-application [verify : cohorte suivante].

---

### F10. FDAE — Forward Deployed Account Executives (§21)

**Ce que Sam affirme**
- Deux jobs : « a complementary skill set... helping with messaging, multi-channel, what the message should say » + « our FDAEs deeply understand how Monaco and its agents operate. If you deploy a demand-gen agent... you have to manage that agent — set it up, program it, check the messaging. We just do that for you. »
- « It's definitionally not possible for a founder to understand how Monaco works the way a full-time Monaco employee does. »
- Trajectoire investisseurs : Series A — « the biggest objection was "how does this scale?" — the margins » ; Series B — « we hear this is THE big competitive advantage you have ».

**Lecture CRO**
Le FDAE est un levier de conversion (messaging expert) et surtout de rétention/NRR (onboarding réussi = client qui reste) — au prix d'un COGS qui plafonne la marge. La métrique de survie du modèle : revenu par FDAE, et sa pente.

**Audit PM — l'aveu et ce qu'on en fait**
- « You have to manage that agent — set it up, program it, check the messaging » est **l'aveu produit central du transcript** : l'agent autonome ne l'est pas. Monaco a choisi d'absorber cette complexité par des humains plutôt que de la résoudre par le produit — choix défendable (time-to-market, feedback loop) mais qui n'est viable que si chaque release productise du travail FDAE. Sinon le « competitive advantage » de la Series B redevient l'objection de marge de la Series A à l'échelle.
- *Le FDAE est aussi un capteur* : il voit tous les workspaces — c'est le canal de feedback produit le plus dense de l'entreprise. Non-instrumenté, cette valeur s'évapore en Slack interne.
- *Risque de dépendance client* : « definitionally not possible for a founder to understand » est une fierté inversée — si le client ne peut pas comprendre son propre outil, le produit a échoué en lisibilité. La cible : le FDAE configure, le client COMPREND ce qui a été configuré (transparence des actions).
- *Cohérence avec §13* : « metering who comes in, waitlist for companies not right in the strike zone » — le FDAE ne scale que si l'admission filtre les clients qu'on peut rendre successful. La porte d'entrée fait partie du modèle de service.

**Spec Kiro — FDAE-OPS (tooling interne + transparence client)**

*User story (interne)* : en tant que FDAE, j'opère N workspaces clients depuis une console unique, chaque action que je fais chez un client est visible par lui, et le temps que je passe par tâche est mesuré pour que le produit absorbe mes tâches répétitives.

*Critères d'acceptation (EARS)*
1. THE SYSTEM SHALL fournir une console multi-workspace aux FDAE avec actions auditées : tout changement effectué par un FDAE est journalisé et visible par le client (« Monaco a ajusté votre séquence X : raison »).
2. WHEN un FDAE effectue le même type d'action manuelle ≥ X fois sur ≥ Y workspaces (proposé : 10 fois / 3 workspaces), THE SYSTEM SHALL créer une candidate à productisation avec le temps cumulé dépensé — le backlog produit se nourrit du travail FDAE mécaniquement, pas par anecdote.
3. THE SYSTEM SHALL mesurer le temps FDAE par tâche et par workspace, et reporter le ratio workspaces/FDAE et son évolution par release — la métrique qui répond à l'objection Series A.
4. WHEN un nouveau client est admis, THE SYSTEM SHALL vérifier les critères de strike zone (§13) ; IF hors zone, THEN waitlist motivée — l'admission protège le modèle de service.
5. WHEN le FDAE configure un agent client (signaux, séquences, ciblage), THE SYSTEM SHALL générer l'explication lisible par le client de ce qui a été configuré et pourquoi — contre la dépendance opaque.

*Design* : rôles et permissions dédiés (le FDAE n'est pas un admin client fantôme — accès séparé, audité) ; télémétrie de tâches (catégorisée : setup signal, retouche message, débogage délivrabilité...) ; pipeline candidate-à-productisation → backlog PM avec le coût annuel en heures FDAE comme score de priorité.

*Métriques* : workspaces par FDAE (et pente par trimestre — c'est LE chiffre) ; temps médian d'onboarding ; % d'actions FDAE expliquées au client ; top 5 des tâches répétitives par coût (= top 5 du backlog).

*Tasks* : (1) console multi-workspace + audit visible client [verify : le client voit l'action] ; (2) télémétrie de tâches [verify : catégories sur 2 semaines pilotes] ; (3) détecteur de répétition → candidates [verify : seuil déclenché sur fixture] ; (4) gate de strike zone à l'admission [verify : hors-zone ⇒ waitlist] ; (5) rapport ratio par release.

---

### F11. Launch playbook (§13, §14)

**Ce que Sam affirme**
- « You can launch a bunch of times. » (3 launches en 5 mois : public beta 11 février, Series B, GA mi-juillet)
- Table stakes : vidéo produit + « a spreadsheet with four tabs — employees, investors, friends of the firm, customers. When you launch, you track and do outreach to each group, both the day before and day of. With employees, ask: who are the three to five most influential people in your network...? »
- « 45 days before launch, assemble a launch committee — might be your whole five-person company... everyone brings two to three ideas... whiteboard everything, leave the room with the three or four best ideas, and execute them. » Budget par campagne, « the crazier the better ».
- Sam le fait déjà en service : « I've done this with a few of our customers » (workshops chez Judgment Labs).
- La preuve d'efficacité qu'il cite : reply rates « same company, same product, same message — exponentially higher » post-launch (§10).

**Lecture CRO**
Le launch est un multiplicateur de reply rate (la marque précède le message) et de conversion (crédibilité §10). Pour l'ICP founder-led, c'est l'événement de demand gen le plus rentable de l'année — et il est actuellement servi à la main par le CEO de Monaco. Service à productiser.

**Audit PM**
- *L'asset caché* : les 4 onglets du spreadsheet (employees, investors, friends, customers) sont des données que la plateforme POSSÈDE déjà (le plan de données unifié §6 contient les customers, les investors sont dans le graphe relationnel du founder). Faire ce playbook dans un spreadsheet externe alors que le produit a les données est une incohérence que le PM doit résorber.
- *La mesure réconciliée* : Sam dit « we don't measure » (§10) puis cite l'uplift de reply rate à message constant — qui EST une mesure, globale et honnête. Le produit doit mesurer exactement ça (marqueurs d'événements sur les séries temporelles outbound) et refuser l'attribution par contact (vouée à sous-estimer, doctrine §10).
- *Limite* : la partie créative (« the crazier the better ») ne se productise pas — le produit orchestre le processus (comité, échéances, budget, listes, tracking), il ne remplace pas l'idée. Ne pas prétendre l'inverse.

**Spec Kiro — LAUNCH-PLAY**

*User story* : en tant que founder qui prépare un launch (produit, levée, GA), je déroule un playbook guidé à J-45 avec mes listes d'amplification construites depuis mes données, mes campagnes budgétées, et après coup je vois l'uplift réel sur mon outbound.

*Critères d'acceptation (EARS)*
1. WHEN un launch est créé avec une date, THE SYSTEM SHALL générer le rétro-planning (J-45 comité et idéation, J-30 assets, J-7 listes et outreach préparé, J-1/J0 exécution et tracking) avec les rituels décrits §14.
2. THE SYSTEM SHALL construire les 4 listes d'amplification depuis le plan de données (employés du workspace, investisseurs, friends-of-the-firm, clients) et demander à chaque employé ses « 3-5 most influential people » pour peupler la liste friends (§14, verbatim productisé).
3. WHEN le jour J arrive, THE SYSTEM SHALL générer les messages d'activation par liste (la veille et le jour même) en file d'approbation founder (F5).
4. WHEN un événement de marque est enregistré (launch, flight de billboards, tournoi, campagne gifting), THE SYSTEM SHALL l'annoter sur les séries temporelles outbound (reply rate, meeting rate) et calculer l'uplift avant/après à séquence constante — sans jamais prétendre à l'attribution par contact (doctrine §10).
5. WHEN une campagne est créée dans le launch, THE SYSTEM SHALL exiger un budget cap (§14) et un responsable.
6. THE SYSTEM SHALL permettre de répliquer un launch passé comme template (« you can launch a bunch of times » — le 2e launch part du playbook du 1er).

*Design* : objet launch {date, type, campagnes[], listes[], assets[], budget} ; intégration séquences (l'outreach de launch est une séquence comme une autre, founder-sender) ; marqueurs d'événements = table dédiée consommée par les charts outbound (F8).

*Edge cases* : launch décalé (replanification en cascade) ; listes avec contacts en séquence active (collision : le message launch remplace le message froid, pas en plus) ; tenant sans investisseurs renseignés (la liste se construit, pas bloquante).

*Métriques* : uplift de reply rate à J+30 post-launch vs J-30 (la mesure de Sam §10) ; % des listes activées le jour J ; nombre de launches par client par an (récurrence = rétention du playbook).

*Tasks* : (1) objet launch + rétro-planning [verify : création E2E] ; (2) constructeur des 4 listes depuis les données [verify : listes peuplées sur fixture] ; (3) messages d'activation en file founder [verify : approbation] ; (4) marqueurs d'événements + uplift à message constant [verify : chart annoté] ; (5) templates de réplication.

---

### F12. Campagnes créatives, gifting, brand echo (§10, §11, §15)

**Ce que Sam affirme**
- Le rituel : « every single month, force yourself to come up with a creative idea. Meet as a group, whiteboard, vote on the best idea. » « The worst thing to do is nothing at all. »
- L'allocation : « of all your marketing dollars, have a meaningful percentage — 30%, 50% — that directly benefits the target customer rather than a third-party advertiser. »
- La barre du gift : « it's NOT the thought that counts... it can be negative value if it's some chachki. The bar is high: would you genuinely think this is cool? » Gifts sociaux et visibles : poker sets (~$100, ressortis aux poker nights), cadre Lego à l'entrée, Veuve Clicquot déclenché par une levée (« they'd raised in the last six months ») avec carte signée du CEO orientée équipe.
- La mesure : « The anecdotes are more valuable than the data points — the things people regularly bring up to you. » Et l'échec assumé (restaurant Brex) : « you should be trying a bunch of stuff, and some of it won't work... take the learning, cross it out, move to the next thing. »

**Lecture CRO**
Tout vise le reply rate futur (la marque qui précède) et la crédibilité en cycle (conversion). Le budget est borné par campagne — c'est du portfolio management : beaucoup d'essais bon marché, doubler sur ce qui résonne, mesuré aux anecdotes.

**Audit PM — l'idée la plus exploitable du transcript**
- « The anecdotes are more valuable than the data points » est une provocation qui cache une spec : **faire des anecdotes une donnée**. Monaco capture déjà chaque interaction (calls, emails, meetings). Détecter les mentions de marque dans les interactions capturées (« j'ai vu vos billboards », « j'étais au tournoi ») = le registre d'anecdotes de Sam, automatisé, rattaché à la campagne. Personne dans le transcript ne fait ce lien — c'est pourtant la jonction naturelle des deux moitiés du produit (capture × brand).
- Le ratio « bénéficie au client vs bénéficie à un tiers » (30-50 %) est calculable trivialement si chaque campagne classe ses dépenses. Métrique de discipline, coût nul.
- Le gifting signal-déclenché (champagne sur levée ≤ 6 mois) est déjà dans la mécanique F3 — la levée est un signal avec fenêtre de péremption.

**Spec Kiro — BRAND-ECHO**

*User story* : en tant que founder, je tiens mon portefeuille de campagnes créatives (rituel mensuel, budgets, essais/arrêts), le gifting se déclenche sur les bons signaux, et le système me remonte automatiquement chaque écho de marque entendu dans mes interactions.

*Critères d'acceptation (EARS)*
1. WHEN une interaction capturée contient une mention de campagne ou de marque (billboard, événement, gift, « on m'a parlé de vous »), THE SYSTEM SHALL la taguer « brand echo », la rattacher à la campagne si identifiable, et l'agréger dans le registre d'anecdotes (§10 productisé).
2. WHEN une campagne est créée, THE SYSTEM SHALL exiger un budget cap et classer chaque ligne de dépense « bénéficie au client cible » vs « bénéficie à un tiers », et afficher le ratio trimestriel vs la cible configurable 30-50 % (§11).
3. THE SYSTEM SHALL proposer le rituel mensuel (rappel, board d'idées, vote, décision) — léger, désactivable, mais par défaut actif (« the worst thing to do is nothing at all »).
4. WHEN un signal de levée est détecté sur un compte cible (F3, fenêtre ≤ 180 j), THE SYSTEM SHALL proposer la campagne de félicitations (gift social + carte du founder) en file d'approbation.
5. WHEN une campagne n'a généré aucun echo après sa fenêtre d'évaluation, THE SYSTEM SHALL proposer son arrêt (« cross it out ») — le portfolio s'élague.
6. THE SYSTEM SHALL afficher par campagne : dépense, echoes, uplift outbound éventuel (marqueurs F11) — trois colonnes, pas un modèle d'attribution.

*Design* : détecteur de brand echo = classification contrainte sur les interactions capturées (fail-closed : en cas de doute, pas de tag) ; registre d'anecdotes consultable avec verbatims sourcés (citation de l'interaction) ; campagnes = objets budgétés reliés aux marqueurs temporels F11.

*Edge cases* : echo négatif (« vos emails me spamment ») — tagué aussi, c'est le signal le plus précieux ; mention d'un concurrent (registre séparé, intel) ; gift refusé/non livré (statut de campagne honnête).

*Métriques* : echoes par campagne par dollar ; ratio bénéfice-client (vs cible) ; % de campagnes arrêtées après évaluation (un portfolio sain en tue — 0 % d'arrêt = personne ne regarde).

*Tasks* : (1) détecteur brand echo sur interactions [verify : 20 transcripts test, précision ≥ 90 %, fail-closed] ; (2) objets campagne + classification des dépenses + ratio [verify : calcul] ; (3) rituel mensuel [verify : rappel + board] ; (4) gifting signal-déclenché [verify : E2E levée → proposition] ; (5) vue portfolio 3 colonnes.

---

## 3. Doctrines non productisées (audit méthodologique pur)

**§3, §9 — La primauté du temps customer-facing.** « There is no higher-ROI use of founder time... than being customer-facing. AI doesn't automate away meeting... customers. In fact, the inverse — AI enables you to spend more time customer-facing. » Et le garde-fou : « There's a risk you leverage AI too much and remove yourself from the incredibly high-ROI things. » → Principe produit transversal plutôt que feature : toute feature doit AUGMENTER le temps client net du founder. Une feature qui ajoute de l'admin founder viole la thèse du produit. (Métrique possible : heures rendues par semaine — mais c'est un principe de revue de spec, pas un dashboard.) Le critère in-person : « We're not getting on a plane to meet a New York founder for a $25K ACV deal » — la règle déplacement/ACV est explicite, et accessoirement révèle l'ACV type de Monaco.

**§12 — Design partners gratuits contre engagement.** « We didn't charge. Charging would have been friction against the thing we really wanted: feedback. We did, though, get people to commit that they would actually make this their platform of record — not use it alongside another tool. » L'échange est précis : gratuité contre exclusivité d'usage + feedback. Pas de produit là-dedans, mais une discipline de company building remarquablement formulée — la contrepartie n'est pas de l'argent, c'est du **signal non dilué** (un design partner qui garde son ancien outil ne teste rien).

**§13 — Le zero-to-100, conditionnel.** « This is probably the wrong approach for most companies. What enabled us: we didn't need to be known to acquire the initial customers. » L'honnêteté de la condition est notable : le launch shotgun exige un canal d'acquisition indépendant de la notoriété (réseau, outbound, YC batch pour Brex). Doctrine à deux états, pas une recette.

**§16 — Naming.** « It's not a social activity... I took ownership. » + critère .com + associations voulues (success, wealth). Aucune implication produit.

**§20 — Le premier client.** « There is no one better in the world at acquiring the first handful of customers than the founder. » Embaucher un vendeur pour trouver le client n°1 = « the wrong diagnosis and the wrong solution » (c'est un problème de PMF). Implication produit indirecte : Monaco cible explicitement le founder-led et son onboarding doit le présupposer — pas de « invitez votre SDR » au jour 1.

---

## 4. Contradictions internes et risques systémiques (vue PM senior)

1. **La mesure bifurquée.** Le même discours exige la significativité statistique (§8) et refuse la mesure (§10). La réconciliation existe mais Sam ne la formule pas : mesurer rigoureusement là où le système d'attribution est fiable (funnel interne, données propriétaires), proxy-mesurer le brand (uplift global à message constant, echoes), et refuser l'attribution par contact pour le brand parce qu'elle sous-estime structurellement (« so much information you don't have that your takeaways will guide you in the wrong direction »). Un produit qui n'encode pas cette frontière fera l'un des deux mensonges : sur-attribuer le brand ou sous-investir dedans.

2. **Le piège du petit n — le risque produit n°1.** Toute la couche intelligence (F6, F7, F9) promet des insights statistiques à des clients dont le volume rend la statistique presque impossible. Les exemples fondateurs (Zenefits, Brex 4x) viennent d'échelles 100x supérieures à celles du client Monaco type. Sans tiers de confiance, corrections multi-comparaisons et bascule en mode « expérience proposée », l'insights agent est un générateur d'artefacts confiants — le pire produit possible, parce qu'il déclenche des réallocations réelles sur du bruit. C'est LE point où la promesse marketing et l'intégrité produit divergent.

3. **Les boucles auto-réalisatrices.** Scoring (F2), routing (F7), closed-loop (F9) : trois systèmes qui concentrent l'effort sur ce qui a déjà marché et cessent donc d'apprendre. Le remède est le même partout (quotas d'exploration, cohortes séparées) et n'apparaît nulle part dans le discours. Mention spéciale : prioriser SF (§2, §17) puis « découvrir » que SF convertit mieux.

4. **Founder-sender vs trajectoire upmarket.** La doctrine d'envoi (§17) sert l'ICP actuel ; la trajectoire revendiquée (§5, « steak dinners with committees ») la casse — un VP Sales enterprise n'envoie pas du founder-to-founder. La doctrine doit être versionnée par stage, sinon le produit contredira sa propre roadmap.

5. **FDAE : l'avantage qui est un aveu.** §21 admet que l'agent exige une gestion experte que le client ne peut « définitionnellement » pas avoir. Modèle viable si et seulement si le ratio workspaces/FDAE monte à chaque release (productisation mécanique du travail FDAE, F10). Sinon, l'objection de marge de la Series A revient avec l'échelle — Sam rapporte lui-même que c'était LA question.

6. **Breadth-first et la dette de cohérence.** « Part of our moat is the breadth of the platform from day one » (§6). Le coût jamais mentionné : N modules moyens plutôt qu'un excellent, et des coutures entre modules (nos audits internes sur Elevay documentent exactement ce mode de défaillance — seams, dead-ends). Le FDAE masque ces coutures chez Monaco — humains comme mortier entre les briques. Cohérent, mais c'est un coût de COGS récurrent, pas un moat.

7. **« It's all AI, totally objective » (§8).** Le routing « objectif » encode une fonction objectif choisie par le management (close rate ? revenu ? équité ?). Revendiquer l'objectivité de la machine pour dissoudre une décision de management est exactement le réflexe qu'un produit sérieux doit refuser : exposer le choix, le rendre configurable et auditable.

---

## 5. Faits compétitifs nouveaux + croisement avec nos teardowns

**Confirmations.** Le transcript valide la classification 6 étapes de `_research/monaco-bilan-et-classification-2026-05-06.md` : Build TAM (§2) / Overlay Signals (§2, §19) / Execute Sequences (§17-18) / Capture Activity (implicite §8 — la classification persona suppose la capture) / Track Pipeline (§7) / Ask Monaco (§8 — l'insights agent en est la version proactive, plus avancée que le chat réactif observé dans nos teardowns UI). La doctrine « primarily inbound today » de nos docs devient « most of our revenue today comes from referrals » (§13) — cohérent.

**Nouveautés vs nos docs.**
| Fait | Source | Impact |
|------|--------|--------|
| GA mi-juillet 2026 (3e launch) | §13-14 | Timing : pression concurrentielle dans ~1 mois ; s'attendre à une vague de bruit (vidéo, campagnes, presse) |
| Series B levée (~mai 2026) | §14, §21 | Nos docs s'arrêtaient à $35M (seed+A). Munitions en hausse |
| Insights agent revendiqué live | §8 | La feature la plus différenciante du discours ; absente de nos teardowns UI (jamais vue à l'écran — claim à vérifier au GA) |
| Routing rep-level | §8 | Décrit comme capacité (« AI can then route ») — probablement roadmap upmarket, pas live pour l'ICP founder-led |
| ACV implicite ~$25K | §9 | Première indication de pricing (nos docs : pricing 404). Elevay $999/mois ≈ $12K/an : nous sommes ~2x moins chers |
| Clients nommés : Greptile, Judgment Labs, Parley, Nowadays | §11, §14, §17, §19 | Tous des startups AI early — confirme le strike zone |
| Public beta = waitlist filtrée (« strike zone ») | §13 | L'admission filtrée fait partie du modèle FDAE |
| FDAE = narrative officielle de la Series B | §21 | Le service assumé comme moat — voir risque §4.5 |

**Deltas chauds pour Elevay** (pointeurs ; mapping complet dans `_research/monaco-vs-elevay-mapping.md`) :
- **Insights agent (F6)** : aucun équivalent chez nous — notre chat répond aux questions, rien ne coupe les cohortes proactivement ni ne propose de réallocations mesurées. C'est le delta le plus structurant du transcript. La version honnête (tiers de confiance, expériences à petit n) est précisément notre doctrine « intelligence, not a prompt » — nous sommes culturellement équipés pour la construire MIEUX que le claim de Sam.
- **Diagnostic bottleneck demand-first (F8)** : rien chez nous ne dit au founder « ta variable bloquante est X ». Productisation simple, valeur immédiate pour notre ICP founder-led — et la doctrine 9/10 s'applique trait pour trait à nos clients.
- **Brand echo (F12)** : nous capturons déjà les interactions (post-call qualification, transcripts) — le détecteur d'échos de marque est à notre portée et n'existe nulle part, pas même dans le discours de Monaco.
- **Signal-timing (F3)** : partiellement couvert (signaux + call-campaign engine) ; les manques : decay par type, citation vérifiable fail-closed à l'envoi, constructeur de signaux custom calibré, lint anti-personnalisation-cosmétique.
- **Founder-sender (F5)** : nos séquences sont déjà per-owner avec boîtes réelles ; il nous manque la doctrine par stage (founder par défaut en founder-led), la file d'approbation apprenante et l'intégrité cross-canal (préconditions de délivrance).
- **Launch playbook (F11)** : inexistant chez nous ; pertinent pour notre ICP (founders early) ; différenciation possible vs Monaco qui le fait à la main.

---

*Document rédigé le 2026-06-11 depuis le transcript seul (+ références croisées à nos teardowns existants). Toute citation § renvoie aux sections du transcript dans `_research/raw/transcript-sam-blond-monaco-gtm.md`.*
