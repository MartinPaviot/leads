# Office hours — Onboarding par inférence : être *juste* day-one

Problème (Martin) : la qualité du TAM, des contacts, du message dépend
entièrement de la précision du setup. Si on n'est pas juste dès le début, on
perd toute crédibilité. Monaco met un humain (FDAE) précisément parce que la
fiabilité day-one est dure. But : automatiser ce que fait l'humain
(triangulation + jugement + question quand il doute) et réduire l'humain
irréductible à : **le user confirme + répond à 2-3 questions pointues**.

## Doctrine de fiabilité (être juste ≠ deviner bien)

1. **Revealed > declared** — déduire de ce que le user a DÉJÀ fait (qui il
   email/rencontre/close, qui paie, qui est sur sa page clients) plutôt que de
   ce qu'il déclare. Confirmer > remplir un formulaire vide.
2. **Trianguler** — la confiance vient de l'ACCORD entre sources indépendantes.
3. **Confidence-gate par élément** (industrie, taille, persona, voix, ACV…).
4. **Confiance basse → DEMANDER (question pointue), jamais deviner ni vider un
   formulaire.** C'est le seul endroit du human-in-the-loop.
5. **Montrer la preuve, jamais asséner** — « industrie = fintech parce que ta
   home + 4/6 clients le disent ». Assertion fausse sans preuve = mort de la
   crédibilité.

## Éléments à être juste × info nécessaire × points de collecte × confiance

(voir le tableau détaillé dans la conversation ; résumé)
- **ICP** : industrie/taille/géo/business-model/ACV/anti-persona/trigger/persona
  /pain. Sources : page clients (révélé), email/agenda/CRM won (révélé),
  enrichissement des clients, pricing/positioning, déclaré (en confirmation).
- **TAM** : ICP→critères + couverture multi-source + dedup + buyer joignable.
  Confiance : sample-gate 20 comptes avant build complet.
- **Contacts** : persona/compte + rôle À JOUR + email/tél vérifiés.
- **Produit/value-prop** : site + emails de pitch + case studies.
- **Voix** : emails ENVOYÉS (le plus vrai) > posts LinkedIn > brand voice site.
- **Signaux** : détecteurs + trigger déduit de l'ICP ; fraîcheur (TTL) + URL.
- **Preuve** : case studies + wins passés + testimonials.

## Points de collecte — tout ce qu'on pourrait connecter

Principe anti-rebloat : **connexion adaptative** — le système demande LA
connexion qui réduit le plus son incertitude courante (« je ne suis pas sûr de
ton ACV → connecte ta facturation »), pas une checklist de 15 intégrations.
Chaque connexion est aussi un **signal propriétaire qu'un lac froid (Apollo/
Monaco) ne peut PAS avoir** : ta facturation, ton inbox, ton réseau.

### Tier 1 — vérité révélée, fiabilité maximale
- **Facturation / paiements (Stripe, Chargebee) + compta (Pennylane FR, Bexio
  CH, Xero, QuickBooks)** — *le sous-estimé n°1* : qui PAIE = la liste clients
  la plus vraie + l'ACV réel par client + le churn. Plus fiable que le CRM
  (aspirationnel/stale) ou l'email. → ICP par client-payant + bande d'ACV vraie.
- **CRM live en OAuth (HubSpot, Salesforce, Pipedrive, Attio)** — pipeline,
  won/lost, stades, tailles. Live >> CSV statique. → ICP par outcome + ACV.
- **Boîte mail + agenda** (déjà) — conversations réelles, won/ghost, buyers
  rencontrés, **voix dans les emails envoyés**.

### Tier 1 — graphe warm + voix
- **LinkedIn (session du user via Unipile)** — connexions (warm-path), messages
  (voix + qui il parle), engagement. = connection-graph PR #213.
- **Slack / Teams** — channels partagés/DM externes avec clients/prospects →
  relations réelles + voix en registre casual.

### Tier 2 — voix du client + pain (or pour le messaging)
- **Support (Intercom, Zendesk, Front)** — conversations clients = pains et
  langage réels + signal at-risk/expansion.
- **Transcripts de meetings (déjà capturés via notetaker)** — langage acheteur,
  objections, use-cases.
- **Avis (G2, Capterra)** — proof + langage de positionnement.

### Tier 2 — signal product-led
- **Analytics produit (Segment, Amplitude, PostHog, Mixpanel)** — comptes
  actifs, activation-milestone (le trigger PLG). Pour les ICP product-led.

### Tier 2 — demande / inbound
- **Pixel visitor-ID sur LEUR site (Snitcher/RB2B-class)** — dé-anonymise les
  visiteurs → comptes à intention. *Gap mutuel avec Monaco (ils l'utilisent pour
  eux, ne le vendent pas) → notre opportunité.*
- **GA / Search Console** — qui visite, quoi, géo → validation ICP + demande.
- **Calendly / Typeform** — demandes de démo = comptes les plus chauds + langage.
- **Plateformes d'ads (Google/LinkedIn Ads)** — qui convertit = validation ICP.

### Tier 3 — docs / proof (faible friction, haute valeur)
- **Google Drive / Notion** — decks, collateral, case studies, battlecards,
  parfois un doc ICP déjà écrit. → produit/value-prop/proof sans demander.
- **Upload du pitch deck** — l'articulation par le founder lui-même
  (produit/marché/ICP/concurrence).

## La limite honnête
Boîte établie (clients + historique + vrai site) → triangulation ultra-fiable.
Founder zéro-data → AUCUN système ni humain n'est « juste » (ICP génuinement
inconnu) → hypothèse honnête + validation rapide (Method pré-PMF) ; c'est là, et
là seulement, que le concierge humain optionnel a de la valeur. « Ultra-fiable
day-one » = **calibré** (juste quand confiant, questionneur quand non), pas
magique sans données.

## Suite
Creuser en premier la **triangulation de l'ICP** : 3 sources qui se recoupent +
scoring de confiance + questions déclenchées quand ça diverge + sample-gate 20.
C'est le maillon dont dépend tout le reste.
