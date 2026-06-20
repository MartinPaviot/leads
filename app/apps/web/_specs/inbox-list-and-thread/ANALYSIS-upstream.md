# Upstream — analyse complète : liste de mails + reading view (clic)

> Capturé en live le 2026-06-20 sur app.upstream.do, workspace Elevay
> (contact@elevay.app). Screenshots : `UP-live-inbox.png`, `UP-list-hover.png`
> (liste), `UP-live-thread.png`, `UP-thread-detail.png` (clic/thread).
> Objectif : designer un produit de qualité PM-expert pour Elevay, fidèle à
> Upstream sur le feel, en gardant notre couche intelligence (Monaco+Lightfield).

---

## 1. La LISTE de mails (vue inbox)

### 1.1 Structure de la page (3 zones empilées verticalement)

```
┌─────────────────────────────────────────────────────────────────┐
│  [logo Elevay]   ⌕ Search ........................   Upgrade Pro │  ← barre top pleine largeur
├──────────┬──────────────────────────────────────────────────────┤
│ SIDEBAR  │  Primary 3 · Needs Reply · Follow Ups · Promotions 41 │  ← split-strip (onglets)
│ folders  │  · Social 1 · Qonto 29 · Noise +                      │
│          ├──────────────────────────────────────────────────────┤
│ Inbox    │  ● [av] Louis Lecat   Thank you from the Upstream …   Yesterday │
│ Needs R. │    [av] Rahul Vohra   Martin, welcome to Superhuman … Apr 10   │  ← LISTE
│ Follow U.│  ● [av] LegalPlace    Vous avez du courrier ! …       Apr 10   │     dense
│ ──────   │    [av] HubSpot       936695 est votre code …         Mar 27   │
│ Starred  │    [av] Zeno Rocha    Welcome to Resend! …            Mar 23   │
│ Snoozed  │    [av] verify@x.com  Martin, confirm your email …    Mar …    │
│ Sent     │    ...                                                          │
│ Drafts   │                                                                 │
│ Scheduled│                                                                 │
│ All Mail │                                                                 │
└──────────┴──────────────────────────────────────────────────────┘
```

Deux axes de navigation orthogonaux :
- **Sidebar gauche** (~224px) = les *dossiers* (Inbox, Needs Reply, Follow Ups,
  Starred, Snoozed, Sent, Drafts, Scheduled, All Mail) + footer promo.
- **Split-strip horizontal** (au-dessus de la liste) = les *catégories/splits*
  (Primary, Needs Reply, Follow Ups, Promotions, Social, custom Qonto, Noise).
  Chaque onglet = icône colorée + libellé + compteur. L'actif est souligné.

### 1.2 Anatomie d'une RANGÉE (single-line, dense)

De gauche à droite, sur **une seule ligne** (~44px de haut, fond blanc) :

| # | Élément | Détail observé |
|---|---------|----------------|
| 1 | **Dot non-lu** | Point bleu plein, ~6px, colonne la plus à gauche. Présent UNIQUEMENT si non-lu (Louis Lecat, LegalPlace en ont ; Rahul Vohra, HubSpot non). |
| 2 | **Avatar** | ~28px, rond, logo de marque (HubSpot, Google, Resend) ou monogramme couleur (initiales) pour une personne. |
| 3 | **Expéditeur** | Nom court ("Louis Lecat", "Rahul Vohra", "LegalPlace"). **Gras si non-lu**, poids normal si lu. Largeur fixe (~140px) — colonne alignée. |
| 4 | **Sujet + snippet** | Sur la MÊME ligne : sujet (semi-gras) puis snippet du corps (gris `text-secondary`), séparés par un espace/em-dash, tronqués à une ligne (`…`). Ex : "**Vous avez du courrier !** Accédez à votre espace pour lire votre courrier…". Prend toute la largeur centrale flexible. |
| 5 | **Date** | À droite, gris, ~11px. Relatif récent ("Yesterday"), puis date courte ("Apr 10", "Mar 27", "Feb 18"). Tabular-nums, colonne alignée droite. |

Pas de case à cocher visible au repos — elle apparaît au hover/sélection
(multi-select Superhuman-style). Pas d'icônes d'action permanentes dans la rangée.

### 1.3 États

- **Non-lu** : dot bleu + nom expéditeur en gras. La rangée reste fond blanc
  (pas de fond bleuté — c'est le dot + le gras qui portent l'état, discret).
- **Lu** : pas de dot, nom en poids normal.
- **Hover** : la rangée se surligne (fond très légèrement gris/`bg-hover`).
  Pas de barre d'actions rapides flashy au hover — Upstream est clavier-first
  (héritage Superhuman). Le hover sert surtout à viser + révéler la checkbox.
- **Sélection (lecture)** : pas de pane de droite — cliquer **remplace** la liste
  par le thread plein écran (URL `/threads/<id>`). [Founder : "on s'en fou du
  plein écran" → chez nous = split pane, voir §3.]

### 1.4 Le split-strip (onglets catégories) — mécanique

Vérifié en cliquant chaque onglet en live (cf. analyse précédente, mémoire) :
- **Primary** = la catégorie "boîte principale" (`other` chez nous, relabelé Primary).
- **Needs Reply** = file de **brouillons de réponse générés par l'IA** (PAS
  "en attente de ta réponse"). C'est un Split Inbox configurable (gear +
  "Also show in Primary").
- **Follow Ups** = **suggestions de relance IA** (PAS "tu as répondu"). Split Inbox.
- **Promotions / Social** = catégories type Gmail (saved searches).
- **Qonto** = split custom de l'utilisateur (filtre par expéditeur/domaine).
- **Noise** = catégorie "bruit" filtré, avec un `+` pour en créer.

Chaque onglet porte un compteur. Couleur d'icône distincte par onglet.

---

## 2. Le CLIC → reading view (thread)

Screenshots `UP-thread-detail.png` (Rahul Vohra) + `UP-live-thread.png`.

### 2.1 Structure (haut → bas)

```
┌─────────────────────────────────────────────────────────────────┐
│  ←  🗄  🗑  ⋮            + Add channel   [avatars]   💬 Comment    │  ← toolbar thread
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Martin, welcome to Superhuman Mail 🎉                          │  ← SUJET (24px gras)
│                                                                   │
│   [av] Rahul Vohra <rahul.vohra@superhuman.com>   Tue 4:02 PM    │  ← en-tête message
│        Hi Martin,                                                  │
│        Welcome to Superhuman Mail — the most productive …        │  ← CORPS (lisible,
│        We rebuilt email from the ground up to be AI-native …     │     généreux)
│        Add Accounts +                                             │
│        You can add all your Gmail & Outlook …                    │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  Reply all                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Hit Ctrl+J to draft with AI                                  ││  ← COMPOSER inline
│  └─────────────────────────────────────────────────────────────┘│
│  Aa  B I U S  🔗  ≣ ≣  " </>      📎 🖼            Send ▾        │  ← barre format + Send
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Toolbar du thread (haut)

- Gauche : **← retour** (vers la liste), **archiver** (boîte), **supprimer**
  (poubelle), **⋮ more**.
- Droite : **+ Add channel** (multi-canal), **avatars** des participants,
  **💬 Comment** (commentaire interne d'équipe — pas envoyé au prospect).

### 2.3 Sujet

- Une seule ligne, **~24px, gras**, couleur primaire. C'est le premier élément
  sous la toolbar — il domine. Emoji conservé inline.

### 2.4 Bloc message

- **Avatar** (logo/monogramme) + **Nom expéditeur** + **`<email>`** en gris +
  **date/heure** poussée à droite ("Tuesday 4:02 PM").
- **Corps** : rendu HTML riche, interlignage généreux, largeur de lecture
  confortable. Réactions emoji en haut-droite au survol.
- Plusieurs messages = empilés chronologiquement (le plus ancien en haut),
  chacun avec son en-tête. Quote-folding pour les longues citations.

### 2.5 Composer (inline, bas de thread)

- **Label "Reply all"** au-dessus.
- Champ de saisie avec placeholder **"Hit Ctrl+J to draft with AI"** —
  l'affordance IA est le placeholder lui-même.
- **Barre de formatage** sous le champ : `Aa` (police), `B I U S` (gras/
  italique/souligné/barré), `🔗` lien, listes `≣ ≣`, citation `"`, code `</>`.
- **Pièces jointes** : 📎 fichier, 🖼 image.
- **Send ▾** à droite (split-button : envoyer / programmer / envoyer + tâche).
- Le composer est **inline** dans le thread (pas une modale) — on lit et on
  répond au même endroit, sans changer de contexte.

---

## 3. Écart Elevay actuel vs Upstream — ce qu'un PM-expert corrige

### 3.1 La LISTE — déjà alignée (fait cette session)

`_inbox-row.tsx` : rangée single-line 44px, avatar + expéditeur + sujet+snippet
+ date + étoile au hover. Dot non-lu présent. **Conforme.** Reste à vérifier :
- l'alignement en colonnes de l'expéditeur (largeur fixe) vs notre flux libre ;
- le gras-si-non-lu sur le nom (à confirmer) ;
- la checkbox multi-select au hover.

### 3.2 Le THREAD — c'est ICI l'écart de feel ("années lumières")

`_conversation-pane.tsx` (1092 lignes) empile, **AU-DESSUS du premier message** :
collision notice, "Next action", fresh signals, prospect brief, thread summary,
"Ask about this thread", notes, action items, key details, handled note,
prepared reply, "What this thread tells us" (signals/objections/next steps/
competitors). Puis seulement les messages (`route.ts` ligne 969).

Résultat : on ne voit PAS l'email en ouvrant le thread — on voit un mur de
cartes d'analyse. Upstream ouvre sur **le sujet + le message**, point.

L'en-tête (lignes 610-762) empile aussi 6-8 boutons qui wrappent (Generate
draft, Reply, Generate nudge, Book meeting, Book <time>, Assign, Labels,
Presence, Stop sequence, Snooze, Done) — visuellement chargé vs la toolbar
4-icônes d'Upstream.

**Décision PM-expert (ce que je construis) :** *email-first, intelligence à un
clic.* Ne PAS supprimer l'intelligence (c'est notre différenciation) mais la
**reléguer** : 
1. Toolbar compacte en haut (icônes : retour si pane, archive, snooze, done,
   ⋮ more) — comme Upstream, pas 8 boutons en ligne.
2. **Sujet gras 18-20px** en premier.
3. **Le(s) message(s) en premier** sous le sujet — on lit l'email immédiatement.
4. L'intelligence (signals, brief, action items, next action…) passe dans un
   **panneau repliable "Intelligence"** ou la colonne CRM de droite, fermé par
   défaut sur les threads courts, ouvrable d'un clic. Le "Prepared reply" et le
   "Next action" restent visibles (haute valeur, actionnables) mais condensés.
5. **Composer inline** en bas avec l'affordance "⌘/Ctrl+J pour rédiger avec
   l'IA" comme placeholder (on l'a déjà via le raccourci — l'exposer comme
   placeholder rend l'affordance découvrable, comme Upstream).

### 3.3 Le multi-mailbox "All inboxes"

Déjà construit : sous-segment "Mailboxes" dans `_inbox-folders.tsx` (lignes
185-207), "All inboxes" + une ligne par boîte avec pastille couleur, gated
`mailboxes.length >= 2`. **Pris en compte.** Avec 1 boîte (cas Martin) : masqué
à dessein. Aucune action requise.

---

## 4. Décisions designées (specs à construire)

| ID | Décision | Pourquoi |
|----|----------|----------|
| LT-1 | Thread = email-first : messages avant les cartes intelligence | C'est l'écart de feel n°1 |
| LT-2 | Intelligence repliée dans un panneau "Intelligence" (fermé par défaut, ouvrable) | Garder la valeur sans noyer l'email |
| LT-3 | Toolbar thread compacte (icônes) au lieu de 8 boutons en ligne | Calme visuel = Upstream |
| LT-4 | Composer : placeholder "⌘/Ctrl+J pour rédiger avec l'IA" | Affordance IA découvrable |
| LT-5 | Liste : nom expéditeur en gras si non-lu + largeur colonne fixe | Alignement Upstream |
| LT-6 | Liste : checkbox multi-select révélée au hover | Parité triage |
| LT-7 | Sujet du thread en 18-20px gras, premier sous la toolbar | Hiérarchie Upstream |

Construits par ordre de valeur de feel : LT-1/LT-2/LT-3 (le gros écart), puis
LT-7/LT-4 (polish thread), puis LT-5/LT-6 (polish liste).
