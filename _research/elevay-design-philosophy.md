# Elevay — Design Philosophy

_Principe directeur: si un element n'aide pas le user a closer son prochain deal, il n'existe pas._

---

## LA REGLE APPLE

Chaque feature doit passer ce test:

1. **Est-ce que ca aide le user a faire son PROCHAIN move?** Si non → delete.
2. **Est-ce que le user a BESOIN de comprendre comment ca marche?** Si non → cache.
3. **Est-ce que ca peut etre plus simple?** Si oui → simplifie jusqu'a ce que la reponse soit non.
4. **Est-ce que le silence serait mieux?** Si oui → ne montre rien.

---

## CE QUE LE USER NE VOIT JAMAIS

| Le systeme fait | Le user voit |
|---|---|
| Signal Reasoning Engine analyse 47 signaux | "Sarah est prete a entendre de toi" |
| Contextual bandit explore 168 timing slots | L'email part au bon moment |
| SmallML Bayesian predit a 87% | "Ce deal avance bien" |
| Enrichment waterfall query 3 APIs | Un dossier prospect complet |
| Thompson Sampling selectionne l'angle | Un draft qui sonne juste |
| Confidence score 0.73 < seuil | "Je te montre ce draft avant envoi" |
| Deliverability monitor detecte bounce +0.3% | Rien (le systeme ajuste seul) |
| Feedback loop met a jour le signal scoring | Rien (les recommandations s'ameliorent) |

**L'intelligence est invisible. Le produit est l'experience, pas l'engine.**

---

## L'INTERFACE: 3 SURFACES, C'EST TOUT

### Surface 1: TODAY (l'ecran d'accueil)

Le user ouvre Elevay le matin. Il voit:

```
┌─────��────────────────────────────────────────┐
│                                              │
│  Bonjour Martin.                             │
│                                              │
│  Aujourd'hui:                                │
│                                              │
│  ┌────────��───────────────────────────────┐  │
│  │  Sarah Chen, VP Eng @ Acme             │  │
│  │  Elle recrute 3 DevOps et a visite     │  │
│  │  ta page pricing hier.                 │  │
│  │                                        │  │
│  │  [Voir le draft]  [Pas maintenant]     │  │
│  └────────────────��───────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Deal Acme — relance necessaire        │  │
│  │  Marc n'a pas repondu depuis 6 jours.  │  │
│  │  Suggestion: appel direct.             │  │
│  │                                        │  │
│  │  [Appeler]  [Envoyer un email]         │  │
│  └─────────────────────────────���──────────┘  │
│                                              │
│  ┌───────────────────��────────────────────┐  │
│  │  Meeting avec Beta Labs dans 2h        │  ���
│  │  Brief pret.                           │  │
│  │                                        │  │
│  │  [Voir le brief]                       │  │
│  └──────────────────��─────────────────────┘  │
│                                              │
│  C'est tout pour aujourd'hui.                │
│                                              │
└──────────────────���───────────────────────────┘
```

**Regles:**
- Maximum 3-5 items. Jamais plus. Si rien d'actionnable → "Rien d'urgent. Continue ce que tu faisais."
- Chaque item = 1-2 phrases de contexte + 1 action primaire
- Pas de chiffres, pas de scores, pas de graphiques
- Le "pourquoi" est la si le user veut cliquer, mais pas force sur lui

### Surface 2: CHAT (le co-pilote)

Pour tout ce qui n'est pas dans "Today", le user demande:

```
┌────────────────���─────────────────────────────┐
│                                              │
│  Martin: Comment va le pipeline?             │
│                                              │
│  Elevay: 4 deals actifs. $87K en jeu.       │
│  Tu devrais closer Beta Labs cette semaine   │
│  (leur CTO a visite pricing 3x).            │
│  Acme est a risque — Marc est silencieux.    │
│                                              │
│  Martin: Pourquoi Acme est a risque?         │
│                                              │
│  Elevay: Marc n'a pas ouvert tes 2 derniers  │
│  emails. Pattern similaire a 4 deals perdus  │
│  dans les 3 derniers mois. Chaque fois, le   │
│  champion devenait silencieux puis le deal    │
│  mourait. Je recommande un appel direct.     │
│                                              │
│  Martin: Ecris un email a Sarah              │
│                                              │
│  Elevay: [draft en temps reel, style Martin] │
│                                              │
│  [Envoyer]  [Modifier]                       │
│                                              │
└──────────────���───────────────────────────────┘
```

**Regles:**
- Reponses courtes. 2-3 phrases par defaut. Detail seulement si demande.
- Jamais de jargon interne (pas de "signal cluster score", pas de "confidence 0.87")
- Langage naturel, comme un collegue intelligent qui connait tes deals
- Actions inline (bouton "Envoyer" directement dans le chat, pas de redirect)
- Le chat PEUT faire TOUT ce que le produit fait. C'est le seul point d'entree necessaire.

### Surface 3: REVIEW QUEUE (quand en mode gate)

Avant que le systeme ait la confiance pour envoyer seul:

```
┌──────────────────────────────────────────────┐
│                                              │
│  5 emails a valider                          │
│                                              │
│  ┌────────────────────────────────��───────┐  │
│  │  → Sarah Chen (Acme)                   │  │
│  │  "Sarah — ton talk KubeCon sur les     │  │
│  │  alert storms m'a parle. On vient de   │  │
│  │  resoudre ca pour [Client]. Le trick:  │  │
│  │  [insight]. Ca t'interesse?"           │  │
│  │                                        │  │
│  │  [Envoyer ✓]  [Modifier]  [Skip]      │  │
│  └───────���────────────────────────────────┘  ���
│                                              │
│  ┌──────────────────────────────��─────────┐  │
│  │  → James Liu (Beta Labs)               │  │
│  │  "James — on est dans le meme batch    │  │
│  ���  YC. Je vois que vous recrutez un      │  │
│  ���  Head of Infra..."                     │  │
│  │                                        │  │
│  │  [Envoyer ✓]  [Modifier]  [Skip]      │  │
│  └─────────────────────────────��──────────┘  │
│                                              │
│  [Tout envoyer]                4/5 approuves │
│                                              │
└���──────────────────────���──────────────────────┘
```

**Regles:**
- Pas de metadata visible (pas de score, pas de "signal: job change")
- Le user voit le MESSAGE, pas l'analyse
- Un clic pour approuver. Swipe-like, rapide, batch.
- Si le user modifie → le systeme apprend silencieusement
- Si >90% approuve sans modif pendant 2 semaines → le systeme propose de passer en autonome

---

## CE QUI N'EXISTE PAS

### Features tuees (qui existent chez les concurrents et qu'on ne fait PAS)

| Feature "standard" | Pourquoi on la tue |
|---|---|
| Dashboard avec graphiques | Bruit. Le user veut des ACTIONS, pas des courbes |
| Lead scoring visible (47/100) | Chiffre sans contexte. On montre "contacte cette personne" pas "score 47" |
| Sequence builder (drag & drop steps) | Le systeme decide la cadence. Le user n'a pas a configurer |
| Template library | Chaque email est unique. Pas de templates |
| "Analytics" tab | Si le user veut des stats → il demande en chat |
| Settings page avec 40 toggles | Le systeme s'ajuste. Si le user veut changer → chat |
| "Segments" et "Lists" | Le systeme segment automatiquement. Le user ne manage pas de listes |
| "Integrations" page | Ca marche ou ca marche pas. Connect at onboarding, never think about it again |
| CRM pipeline view (kanban) | Le systeme gere le pipeline. Le user voit "ce deal a besoin de toi" |
| "Reports" | Demande en chat: "comment ca va ce mois-ci?" |
| Notifications badge (47) | Max 1-2 notifications/jour. Si rien d'urgent → silence |
| "Import contacts" button | Le systeme trouve les contacts. Le user n'importe rien |
| Onboarding wizard (7 etapes) | Connecte email. C'est tout. Le reste est infere |

### Le principe du silence

```
Pas de notification > notification inutile
Pas de feature > feature qui ajoute du bruit
Pas d'info > info qui ne mene pas a une action
```

Si Elevay n'a rien d'actionnable a dire → elle ne dit RIEN. Pas de "daily digest", pas de "weekly report", pas de "voici vos stats". Le user ouvre l'app, voit "rien d'urgent", et retourne travailler.

**Le meilleur jour avec Elevay est un jour ou le user ne l'ouvre pas** parce que tout tourne en background et que les meetings se bookent seules.

---

## PROGRESSIVE DISCLOSURE (JAMAIS TOUT D'UN COUP)

### Ce que le user decouvre quand il en a BESOIN

| Moment | Ce qui apparait | Pourquoi |
|---|---|---|
| Premier jour | "Today" vide + chat + "Je suis en train d'analyser tes emails" | Pas de surcharge |
| Apres onboarding (30 min) | "J'ai compris ton business. Voici ce que je vois." | Premier moment de valeur |
| Premier draft pret | Review queue apparait pour la premiere fois | Introduction naturelle |
| Premiere reponse positive | "Ca a marche. Voici pourquoi." (1 phrase, pas un rapport) | Feedback sans bruit |
| Premier deal en mouvement | Brief de deal dans "Today" | Contextuel |
| Premiere meeting | Brief pre-meeting (notification 30 min avant) | Au bon moment |
| 2 semaines en mode gate | "90% de tes approvals sont sans modif. Je peux envoyer seul?" | Transition naturelle vers autonomie |

---

## DESIGN LANGUAGE

### Typographie et ton

- **Headlines**: direct, actif, court. "Sarah est prete." pas "Nouvelle opportunite detectee"
- **Body**: conversationnel, pair-a-pair. Comme un collegue, pas un outil.
- **Pas de jargon**: jamais "signal", "scoring", "ICP", "pipeline stage" dans l'UI. Langage humain.
- **Pas d'emoji** (jamais)
- **Pas de badge/gamification** (pas de "streak", pas de "level up")
- **Pas de celebration excessive** ("Deal ferme!" avec confetti → non. Juste la next action.)

### Couleur et espace

- Predominant: blanc + gris tres clair. Le contenu respire.
- Accent minimal: une seule couleur pour les actions primaires
- Aucun element decoratif qui ne serve pas
- Espace negatif genereux — chaque element est isole, lisible en 0.5s

### Interactions

- **1 clic maximum** pour toute action courante (approuver, envoyer, voir)
- **0 clic ideal**: le systeme agit seul quand la confiance est haute
- **Undo > Confirm**: au lieu de "Es-tu sur?", laisser faire + offrir undo 5s
- **Keyboard-first**: tout faisable au clavier pour les power users
- **Instantane**: toute interaction repond en <100ms (optimistic UI)

---

## LA METRIQUE QUI COMPTE

Pas le nombre de features. Pas le nombre de signaux detectes. Pas le reply rate.

**Time-to-next-deal.** C'est tout.

Combien de temps entre "le user se connecte" et "son prochain deal close"?

Tout ce qui raccourcit ce temps reste. Tout ce qui ne le raccourcit pas meurt.

---

## ANTI-PATTERNS A EVITER ABSOLUMENT

1. **"Power user" features** — si un feature necessite d'etre un power user, c'est un echec de design
2. **Configuration** — chaque toggle est un aveu d'echec ("on n'a pas su decider pour toi")
3. **Dashboards** — les dashboards sont pour les gens qui ne savent pas quoi faire. Elevay sait quoi faire.
4. **Data dumps** — montrer 50 leads d'un coup. Non. 3-5 max, les bons, au bon moment.
5. **"See all"** — si le user clique "voir tout", c'est qu'on n'a pas su prioriser pour lui
6. **Status pages** — "votre warmup est a 67%". Non. Le systeme gere. Si probleme → alerte contextuelle.
7. **Tutoriels/tooltips** — si le produit a besoin d'etre explique, redesign le produit

---

## COMMENT CA FONCTIONNE EN VRAI (1 JOURNEE TYPE)

### 8h — Le founder ouvre Elevay

```
"Bonjour Martin.

3 choses aujourd'hui:
1. Meeting avec Beta Labs dans 2h ��� brief pret
2. Sarah (Acme) est chaude — draft pret
3. Le deal Gamma Corp glisse — suggestion: relance telephonique

C'est tout."
```

Il clique "Voir le brief", lit 30 secondes, ferme. Il clique "Envoyer" sur le draft Sarah. Il note de rappeler Gamma apres son meeting. **Total: 45 secondes.**

### 10h — Meeting avec Beta Labs

30 min avant: notification mobile "Brief Beta Labs ready" (1 ligne).
Pendant le call: coach discret (overlay, suggestions si objection detectee).
5 min apres: "Voici le resume. Follow-up draft pret. [Envoyer] [Modifier]"

### 14h — Le founder check rapidement

```
"Sarah a repondu positivement. Elle veut un call jeudi.
J'ai propose 10h et 14h. En attente de confirmation.

Rien d'autre."
```

Il ferme. **Total: 10 secondes.**

### 18h — Fin de journee

Pas de notification. Pas de digest. Le systeme travaille en background.
Si rien d'urgent ��� silence.

### Bilan: <5 minutes d'attention totale par jour

Le founder a passe <5 min sur Elevay. Pendant ce temps:
- 1 email envoye (Sarah → reply positive → meeting bookee)
- 1 meeting prepped + coached + summarized + followed up
- 1 deal a risque identifie (il rappellera demain)
- 5 autres emails envoyes en autonome (pas besoin de son attention)
- 12 prospects recherches et enrichis (invisible)
- 3 signaux detectes et evalues (invisible)
- Bandit mis a jour avec les resultats du jour (invisible)

**Cible: le user ne pense pas a Elevay. Les meetings se bookent. Les deals avancent. C'est magique.**

---

## RESUME: 3 PRINCIPES DE DESIGN

**1. Show actions, not data.** Le user ne veut pas savoir que le score est 0.87. Il veut savoir quoi faire.

**2. Silence > bruit.** Si rien d'actionnable → ne rien montrer. Le meilleur produit est invisible.

**3. Progressive complexity, never forced.** L'user basique voit 3 boutons. L'user avance demande en chat. Jamais de friction pour l'un ou l'autre.
