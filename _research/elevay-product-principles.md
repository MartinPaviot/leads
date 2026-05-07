# ELEVAY — PRINCIPES PRODUIT

> Ces principes sont des contraintes d'architecture, pas des guidelines. Ils ne sont pas negociables. Chaque decision produit les respecte ou est rejetee.

---

## 1. KAIROS, PAS CHRONOS

Le produit ne planifie pas. Il reconnait.

**Concretement :**
- Pas de "cadence builder" ou l'utilisateur configure "Email 1 jour 1, Email 2 jour 3, Call jour 5."
- A la place : un moteur de signaux qui detecte les moments et propose des actions. "Ce prospect est pret MAINTENANT. Voici le signal. Voici un angle."
- L'UX principale n'est pas un calendrier de taches. C'est un **radar** — une vue temps reel des mouvements dans le marche de l'utilisateur.
- Les actions sont declenchees par des evenements, pas par des timers.
- Quand il n'y a pas de signal, le produit ne pousse pas a agir. Le silence est une reponse valide.

**Ce que ca interdit :**
- Pas de "auto-send" programme. L'utilisateur approuve chaque action au moment kairos.
- Pas de "drip campaigns" temporelles comme feature principale.
- Pas de "envoyer X emails par jour" comme KPI visible.

**Ce que ca implique techniquement :**
- Event-driven architecture, pas cron jobs
- Signal ingestion pipeline (job changes, funding, tech stack changes, content engagement, pricing page visits)
- Scoring en temps reel avec decay (un signal de la semaine derniere vaut moins qu'un signal d'aujourd'hui)
- Notification system base sur l'urgence du kairos, pas sur un schedule

---

## 2. EPISTEME REVELE, PHRONESIS DECIDE

La machine montre. L'humain choisit.

**Concretement :**
- Chaque suggestion du produit est formulee comme une REVELATION, pas comme une DIRECTIVE.
  - OUI : "Ce prospect a visite ta pricing page 3 fois cette semaine et vient de recruter un Head of Sales."
  - NON : "Envoie un email a ce prospect maintenant."
- Le produit fournit le contexte, le signal, l'angle possible, le draft. L'humain decide d'agir ou pas, d'editer ou pas, de pousser ou d'attendre.
- Le bouton principal n'est jamais "Send." C'est "Review."

**Ce que ca interdit :**
- Pas d'actions automatiques sur les prospects de l'utilisateur sans approbation humaine (sauf les actions invisibles : enrichissement, scoring, monitoring).
- Pas de "AI qui close des deals" ou "AI qui booke des meetings." L'AI prepare. L'humain execute.
- Pas de language dans l'UI qui pretend que la machine "decide" ou "sait." Elle "voit", "detecte", "suggere."

**Ce que ca implique techniquement :**
- Distinction claire dans le data model entre actions automatiques (background) et actions proposees (require human approval)
- Chaque suggestion a un "confidence score" visible — pas cache derriere un ranking opaque
- L'utilisateur peut toujours voir POURQUOI le produit suggere quelque chose (transparent reasoning)

---

## 3. POLYTROPOS — MILLE VISAGES, UNE IDENTITE

Le produit est different pour chaque utilisateur, sans configuration manuelle.

**Concretement :**
- A l'onboarding, le produit detecte le stade de l'utilisateur (nombre de clients, ACV, geo, maturite outbound) et adapte TOUT : l'interface, les suggestions, les frameworks proposes, le vocabulaire, les benchmarks affiches.
- Un founder a 0 clients voit un guide de validation (Phase -1). Un founder a 30 clients voit un systeme de scaling. Meme produit.
- Les frameworks sont routes automatiquement : < $25K ACV → Gap Selling questions en discovery coaching. > $100K → MEDDPICC apparait.
- Les benchmarks affiches sont contextualises : "pour un SaaS B2B de ta taille, 5% de reply rate est dans le top quartile" — pas des benchmarks generiques.

**Ce que ca interdit :**
- Pas de "settings page" avec 50 toggles ou l'utilisateur configure son experience.
- Pas de "one size fits all" ou tout le monde voit la meme interface.
- Pas de "templates library" ou l'utilisateur browse et choisit. Le produit PROPOSE le template adapte a la situation.

**Ce que ca implique techniquement :**
- Profil utilisateur dynamique (recompute regulierement, pas fixe a l'onboarding)
- Routing engine qui mappe situation → features/frameworks/UI
- Contextualized content engine (pas static content)

---

## 4. XENIA DANS CHAQUE EMAIL GENERE

Les emails qu'Elevay aide a creer donnent avant de demander.

**Concretement :**
- Le template engine a un HARD CONSTRAINT : chaque premier email doit contenir une valeur (insight, observation, donnee) AVANT tout CTA.
- Le produit refuse de generer un email qui est un pur "ask" (demande de meeting sans valeur en amont).
- Le scoring interne d'un email draft inclut un "xenia score" : ratio valeur donnee / valeur demandee.
- Les soft CTAs sont le default. "Hard CTAs" (book a meeting) ne sont proposes que quand le signal indique un intent explicite.

**Ce que ca interdit :**
- Pas de "just checking in" comme follow-up genere.
- Pas de "I'd love to pick your brain" sans offrir quelque chose en echange.
- Pas de templates qui commencent par "I" / "We" / "Our product." Commencer par le prospect.

**Ce que ca implique techniquement :**
- Email generation pipeline avec validation rules (pre-send checks)
- Xenia score comme metrique visible dans le draft review
- Pitching detection : si l'email pitch le produit de l'utilisateur trop tot → warning

---

## 5. KLEOS PAR LES ACTES

Le produit mesure ce qui construit la reputation, pas ce qui flatte l'ego.

**Concretement :**
- Les metriques principales ne sont PAS open rate, sent count, ou sequence completion rate (vanity / Sirenes).
- Les metriques principales SONT :
  - **Referrals generes** (kleos pur — quelqu'un te recommande sans que tu aies demande)
  - **Positive reply rate** (pas total replies — les reponses qui indiquent un vrai interet)
  - **Pipeline velocity** (vitesse a laquelle le pipeline avance, pas sa taille)
  - **Time-to-value** post-close (combien de temps avant que le client voie un resultat)
- Le dashboard principal montre ces 4 metriques. Tout le reste est secondaire.

**Ce que ca interdit :**
- Pas de "emails sent today" comme metrique hero sur le dashboard.
- Pas de gamification du volume (badges, streaks, leaderboards de sends).
- Pas de "pipeline total" comme metrique principale (un gros pipeline stagne est pire qu'un petit qui avance).

---

## 6. METIS DANS L'ARCHITECTURE

Le produit trouve les passages indirects, pas les voies frontales.

**Concretement :**
- Le routing ne propose pas toujours l'action la plus "directe" (envoyer un email au CEO). Il propose l'action la plus "juste" (engager sur LinkedIn d'abord, commenter son post, PUIS envoyer).
- Le produit detecte quand la force frontale est contre-productive (ex: prospect en Allemagne → pas de cold email, suggerer cold call avec presumed consent documente ou LinkedIn).
- Le produit identifie les passages indirects : connexions mutuelles, events en commun, contenus publies par le prospect, opportunites de warm intro.

**Ce que ca interdit :**
- Pas de "blast 500 prospects" comme action one-click.
- Pas d'approche unique pour tous les marches (la metis s'adapte au terrain).

---

## 7. NOSTOS — NE PAS DERIVER

Le produit aide l'utilisateur a rester sur son cap.

**Concretement :**
- Le produit rappelle l'ICP quand l'utilisateur s'en ecarte. "Ce prospect est hors de ton ICP (trop petit / mauvais secteur / pas de signal). Tu veux quand meme continuer?"
- Le diagnostic montre clairement quand le funnel derive : "Ton reply rate a baisse de 30% cette semaine. Le probleme est [diagnostic]."
- Le produit propose des corrections de cap, pas juste des alertes.

**Ce que ca interdit :**
- Pas de "add anyone to a sequence" sans warning de fit.
- Le produit ne facilite pas la dispersion. Il la detecte et la signale.
