# Challenge des specs SENDING — Que ferait Ulysse

> Les trois specs (SENDING-001, 002, 003) totalisent ~76h d'ingenierie. Elles sont tactiquement solides mais philosophiquement compromises. Ulysse ne les ecrirait pas. Voici pourquoi, et ce qu'il ferait a la place.

---

## L'erreur philosophique des specs actuelles

J'ai propose de **construire l'infrastructure pour 100 clients alors qu'on en a 0**.

Ulysse ne construit jamais ce dont il n'a pas encore besoin. Il utilise ce qu'il trouve. Le cheval de Troie est fait du **bois des bateaux echoues**. Il n'invente pas un nouveau materiau. Il regarde ce qui est la et l'utilise differemment.

Mes specs construisent :
- Un warmup engine pour ramper de 0 a 100 emails/jour par mailbox (SENDING-001)
- Une abstraction transport pour router cold → Instantly → managed pool → fallback (SENDING-002)
- Un systeme de provisionnement multi-registrar avec inbound mail processor (SENDING-003)

Pour quel cas d'usage reel a date 0 ? **Aucun.** Le besoin reel des 10 premiers clients d'Elevay est : envoyer **5 a 10 emails par jour** a des founders qu'ils connaissent a un degre, depuis leur Gmail existant, avec un message hyper-personnalise base sur un signal reel.

A 5-10 emails/jour depuis un Gmail qui a 5 ans d'activite organique, **il n'y a pas besoin de warmup, pas besoin d'Instantly, pas besoin de domaine manage.**

J'ai construit les murs de Troie. Ulysse aurait demande : "Pourquoi sieger ?"

---

## Le test des 5 questions d'Ulysse

Pour chaque feature proposee, Ulysse pose 5 questions :

1. **Quel est le but reel ?** (pas le feature — le but)
2. **Qu'est-ce qui existe deja qu'on pourrait utiliser ?** (le bois des bateaux)
3. **Quel est le moment ou on en a vraiment besoin ?** (kairos — pas avant)
4. **Quel est le passage indirect ?** (metis — pas la voie frontale)
5. **Qu'est-ce qui se passe si on ne le construit pas ?** (le test du non-faire)

Appliquons aux 3 specs.

---

## SENDING-001 (Warmup Engine) — VERDICT D'ULYSSE : DIFFERER ENTIEREMENT

**1. Quel est le but reel ?** Que les premiers cold emails atterrissent dans la inbox plutot que dans le spam.

**2. Qu'est-ce qui existe deja ?** Les mailboxes Gmail/Outlook des utilisateurs. Elles ont des annees d'activite organique. Leur reputation est deja construite.

**3. Quel est le moment ou on en a vraiment besoin ?** Quand un utilisateur veut envoyer **plus de 30 cold emails par jour** depuis un domaine **frais** (sans historique). Pas avant.

**4. Quel est le passage indirect ?** Ne pas sortir des mailboxes existantes. A 5-10 cold emails/jour depuis un Gmail age, le risque de bruler le domaine est minime. Le **rate limiting intelligent** (5/jour par defaut, signal-triggered uniquement, hyper-personnalisation requise) remplace le warmup engine.

**5. Qu'est-ce qui se passe si on ne le construit pas ?** Pour les 100 premiers clients, **rien**. Aucun probleme. Le moment ou ca devient un probleme, c'est quand un client a besoin de scaler a 200+ emails/jour, et a ce moment on saura exactement ce qu'on doit construire parce qu'on aura vu les patterns reels.

**Decision :** Differer SENDING-001 entierement. Liberer 17h d'ingenierie.

**Ce qu'on fait a la place (3h de travail) :**
- Modifier `sending-identity.ts` guardrail pour autoriser cold-on-primary jusqu'a 10/jour si l'email contient un trigger explicite ET un score xenia > 0.7 (donne avant de demander)
- Logger chaque cold-on-primary dans `coachingInsights` pour audit
- Surface dans le dashboard : "Tu envoies depuis ta mailbox principale. Au-dessus de 30 cold/jour, on te recommande un domaine dedie. Aujourd'hui : N envoyes."

C'est la phronesis de l'utilisateur qui decide quand passer a un domaine dedie, pas la machine qui le force.

---

## SENDING-002 (Transport Routing avec Instantly) — VERDICT D'ULYSSE : RADICALEMENT SIMPLIFIER

**1. Quel est le but reel ?** Pouvoir envoyer un cold email a une vraie personne depuis un vrai domaine, et que ca arrive.

**2. Qu'est-ce qui existe deja ?** L'audit a confirme que `MailboxDirectTransport` est partiellement implemente pour Gmail/Outlook OAuth (warmup + reply intents). On peut l'etendre a cold intent.

**3. Quel est le moment ou on en a besoin d'Instantly ?** Quand on veut router 200+ cold emails/jour sur 3-5 domaines avec rotation et deliverability optimization. Pas avant.

**4. Quel est le passage indirect ?** Etendre `MailboxDirectTransport` au cold intent au lieu de construire l'abstraction Transport + Instantly + fallback chain. Une seule ligne de code dans le routing : si tenant n'a aucun provider externe, autoriser cold via mailbox-direct avec rate limit.

**5. Qu'est-ce qui se passe si on ne construit pas Instantly maintenant ?** Pour les 100 premiers clients (qui envoient < 30/jour), rien. Quand un client veut scaler, on cable Instantly **a ce moment-la**, en 2 jours, parce qu'on aura le besoin reel pour calibrer.

**Decision :** Differer toute la partie Instantly. Garder uniquement :
- L'extension de `MailboxDirectTransport` au cold intent (avec rate limit)
- L'observabilite par transport dans `pipelineEvents`

**Ce qu'on fait (4h au lieu de 21h) :**
- Etendre `MailboxDirectTransport.isAvailableFor` pour accepter `intent: 'cold'` si rate limit OK
- Modifier `email-send-worker.ts` pour appeler ce transport pour cold quand aucun provider externe configure
- Logger `transport_selected` dans `pipelineEvents`
- Stocker la limite quotidienne dans `connectedMailboxes.dailyColdLimit` (default 10, configurable par utilisateur)

L'abstraction Transport + Instantly + fallback chain s'ecrira **quand un client paiera plus cher pour ca**. Pas avant.

---

## SENDING-003 (Self-Service Sending Onboarding) — VERDICT D'ULYSSE : DIFFERER ENTIEREMENT

**1. Quel est le but reel ?** Que l'utilisateur puisse onboarder rapidement et envoyer son premier cold email.

**2. Qu'est-ce qui existe deja ?** Le flow OAuth Gmail/Outlook existant. L'utilisateur connecte sa mailbox principale en 30 secondes.

**3. Quel est le moment ou on a besoin de domaines manages ?** Quand un client veut scaler au-dela de ce que sa mailbox principale peut absorber (>30 cold/jour). Pas avant.

**4. Quel est le passage indirect ?** L'onboarding existant est suffisant. L'utilisateur connecte son Gmail. Le rate limit fait le reste. Pas de domaine a registrer, pas de DNS a configurer, pas de inbound mail processor a builder.

**5. Qu'est-ce qui se passe si on ne le construit pas ?** Les 100 premiers clients sont onboardes en 30 secondes au lieu de 5 minutes. Ils utilisent leur Gmail. Ils envoient leur premier cold email **le jour meme**, pas dans 14 jours apres warmup.

**Decision :** Differer SENDING-003 entierement. **38 heures d'ingenierie liberees.**

Le moment ou on construit ca, c'est quand 5+ clients par mois demandent "comment je peux envoyer plus que mon Gmail permet ?" Et a ce moment, on aura les besoins concrets — pas une speculation a 38h.

---

## Ce qu'Ulysse construirait a la place avec les 76h liberees

Les 76h ne disparaissent pas — elles vont la ou est le **vrai bottleneck pour acquerir le premier client** : l'**intelligence du produit**, pas l'**infrastructure d'envoi**.

| Investissement | Heures | Pourquoi |
|---|---|---|
| **Detection de signaux plus profonde** | ~20h | Le pattern "founder qui recrute son premier commercial" est le signal le plus precieux pour Elevay. Le detecter avec precision (LinkedIn, WTTJ, job boards francais) = lead direct vers le ICP. Aujourd'hui le signal scanner couvre funding/hiring de facon generique. Affiner pour CE pattern specifique = 10x plus de prospects matchant l'ICP exact. |
| **Generation de messages hyper-personnalises avec preuve de recherche** | ~20h | Pre-send review existe. L'etendre : detection automatique du niveau de personnalisation (mention du contenu publie par le prospect, reference a un evenement specifique de leur entreprise). Bloquer les drafts qui ressemblent a des templates. C'est ce qui fera la difference entre 1% et 8% reply rate sur les 5/jour autorises. |
| **Phronesis layer plus visible** | ~15h | Le founder coach quotidien existe. Le rendre lisible : "Tu as 3 prospects en kairos aujourd'hui. Voici lesquels, voici pourquoi, voici l'angle." Reveler ce que la machine voit que l'humain ne voit pas. C'est la valeur centrale du produit. |
| **Champion enablement assets** | ~10h | One-pager, ROI calculator, business case generes par les skills existants — les rendre **partageables** via lien public. Pas un MAP complet, juste des artefacts que le champion peut forwarder en interne. |
| **Le rate limit intelligent + observabilite cold-on-primary** | ~7h | Ce qu'on a decrit ci-dessus. C'est tout ce qu'on doit construire cote sending. |
| **Total** | **72h** | |

Les 4h restantes : amortissement, debug, polish.

---

## Le re-cadrage philosophique

| Spec originale | Esprit | Verdict d'Ulysse |
|---|---|---|
| SENDING-001 (warmup engine) | "Construisons l'infrastructure pour scaler" | Hubris. On scale rien. On a 0 client. |
| SENDING-002 (transport abstraction + Instantly) | "Construisons une couche generique pour swap les providers" | Premature optimization. Le coupling avec un provider qu'on n'utilise meme pas. |
| SENDING-003 (managed domains self-service) | "Construisons un service pour eviter aux users de toucher au DNS" | On resoud un probleme que les 10 premiers clients n'ont pas. |

| Re-cadrage Ulysse | Esprit | Pourquoi |
|---|---|---|
| Cold-on-primary avec rate limit + xenia gate | "Utilisons le bois des bateaux" | Mailbox existante, reputation existante, rate limit pour ne pas tout bruler |
| Differer SENDING-001/002/003 jusqu'au signal de besoin reel | "Kairos — pas avant le moment juste" | Construire pour 0 → 30 clients d'abord, decider de l'infrastructure scale a partir des donnees reelles |
| Reinjecter 72h dans l'intelligence du produit | "Le moat n'est pas l'envoi, c'est le voir" | Detection de signaux + generation hyper-personnalisee + phronesis surfacing — c'est ce qui fait gagner les deals |

---

## Ce que ca change concretement

**Sprint immediat (1 semaine au lieu de 4-5 semaines) :**
1. Modifier `sending-identity.ts` guardrail (xenia score + rate limit + signal trigger required pour cold-on-primary) — 3h
2. Etendre `MailboxDirectTransport` au cold intent — 2h
3. Dashboard tile : "Cold sends today — N/10 limite primaire, recommandation a [seuil] de bouger sur domaine dedie" — 2h
4. Logger pour audit + `coachingInsights` quand cold-on-primary fire — 1h
5. Tests + deploy — 4h

**Total : 12h. Martin peut envoyer son premier cold email d'Elevay vers un prospect founder dans la journee.**

Avec les 64h restantes redirigees vers l'intelligence produit, dans 2 semaines :
- Detection signal "first commercial hire" pour founders SaaS francais
- Generation message hyper-personnalisee avec verification automatique de la profondeur
- Surface kairos quotidienne ("voici tes 3 prospects mom")
- Champion enablement partageable

C'est ce qu'Ulysse construirait. **C'est ce qui fait gagner le premier client, pas les murs de Troie.**

---

## Les principes en tension

J'avais ecrit dans `elevay-product-principles.md` : "Le produit n'a pas de cadences planifiees, il opere en kairos." Mais SENDING-001 etait un warmup engine — pure logique chronos sur 14 jours. **Contradiction.** Ulysse l'aurait vue immediatement.

J'avais ecrit : "Polytropos — meme produit, plusieurs visages selon le contexte." Mais SENDING-002 forcait une seule abstraction transport sur tous les cas d'usage, alors que les premiers clients n'ont besoin que de leur mailbox existante. **Contradiction.**

J'avais ecrit : "Nostos — ne pas deriver de la mission." La mission est de donner aux founders la maitrise de leur relation au marche. Pas de leur fournir des sub-domaines manages. **Contradiction.**

Les specs etaient en contradiction avec les principes que j'ai moi-meme ecrits. C'est exactement la derive que Penelope tisse et detisse pour eviter — le piege d'avancer dans la mauvaise direction parce que ca ressemble a du progres.

---

## Decision

**Archiver SENDING-001, 002, 003 en l'etat actuel** (les garder comme reference pour quand le besoin reel arrivera — dans 6 mois, ils seront probablement different parce qu'on aura des donnees reelles).

**Ouvrir un nouveau spec : `SENDING-MINIMAL`** qui couvre :
- Cold-on-primary avec rate limit + xenia gate + signal trigger required
- Extension `MailboxDirectTransport` au cold intent
- Dashboard surface
- Tests

**~12h d'ingenierie. Premier cold email envoyable depuis Elevay dans la journee.**

Et rediriger les 64h liberees vers l'intelligence produit — la ou est le vrai moat, le vrai differenciateur, le vrai chemin vers Ithaque.
