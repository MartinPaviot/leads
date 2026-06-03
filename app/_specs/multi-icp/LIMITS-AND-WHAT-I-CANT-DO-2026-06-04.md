# Rapport — ce que je ne peux pas faire seul, limites, et solutions

Trois parties : (A) ce qui requiert TOI (clés/deploy/budget/décisions),
(B) les limites techniques de ce qu'on a construit, (C) les solutions.

---

## A. Ce que je ne peux PAS faire moi-même

### A1. Credentials (le frein n°1 — tout est construit mais éteint sans ça)
| Clé | Débloque | Coût | Solution |
|---|---|---|---|
| `KASPR_API_KEY` | mobiles FR | payant (~0,30€/mobile) | tu crées le compte, je l'ai déjà câblé |
| `LUSHA_API_KEY` | mobiles/emails FR/CH | crédits | idem |
| `ZELIQ_API_KEY` + `ZELIQ_WEBHOOK_SECRET` | enrichissement async 40+ sources | crédits | idem (+ tunnel dev) |
| `FULLENRICH_API_KEY` | cascade enrichissement | crédits | adapter à écrire (1h) |
| `DEEPGRAM_API_KEY` | transcription live | ~$0.004/min | clé + déploiement serveur |
| `PAPPERS_API_KEY` | financials/levées FR | gratuit (100/mois) | compte gratuit |
| `COGNISM_*` | découverte CH | payant (abonnement) | décision d'achat |
| `ZEFIX_API_USER/PASSWORD` | vérif CH (UID/canton) | gratuit | compte gratuit |
| `RECALL_API_KEY` | capture visio | payant | clé |
| OAuth Gmail/Calendar | capture email/meeting | gratuit | TU connectes ton compte (OAuth réel) |
| Twilio (numéros +33/+41) | l'appel | ~1€/n°/mois + usage | provisionner |

Je ne peux ni créer des comptes en ton nom, ni saisir des moyens de paiement, ni faire un OAuth avec tes vrais identifiants.

### A2. Déploiement / infra
- **Serveur voice-stream** (transcription live) : process long-running joignable par Twilio en wss → un host (Railway/Fly/Render/un worker). Je ne déploie pas.
- **Inngest** : les crons (recompute fit, signal score) + workers post-call doivent tourner (dev server Inngest ou Inngest Cloud).
- **App déployée** (prod) : je code, je ne mets pas en prod.

### A3. Budget / dépense
- **Reveal emails/mobiles** : Apollo people-search trouve les décideurs (gratuit-ish) mais **révéler l'email/mobile coûte un crédit** par contact. Pour ~470 comptes × 2-3 contacts = ~1000-1400 reveals → dépasse 10€.
- **Sourcing/enrichissement payants** (Cognism, Kaspr, Lusha, Zeliq, FullEnrich) = ta décision d'achat.

### A4. Décisions produit (les tiennes)
- **Tenant** : tout est sur "E2E Test Workspace" → veux-tu un tenant Pilae dédié ?
- **Seuil/poids du fit** (cf. limite B1) : ré-équilibrer ou garder 0.5 ?
- **`industry` required** sur les 592 Apollo (précision 37%→ciblée) ?
- **Merger la branche** `feat/ch-fr-prospecting` (review + PR ; séparer ton commit landing).

---

## B. Limites de ce qu'on a construit (honnête)

**B1. Le fit scoring est "signal-lourd" → les comptes registre-propres plafonnent à ~0.42.**
Les 848 comptes SIRENE scorent maintenant (géo+taille+industrie) mais aucun n'atteint 0.5 "fit" : l'ICP pèse fort sur `technologies` (poids 3) + keywords/persona, que le registre n'a pas. Donc une base *propre et ciblée* paraît "non-fit".

**B2. Couverture FR d'Apollo ~47%.** Apollo ne connaît que ~la moitié des PME françaises du registre → 527 SIRENE sans domaine via Apollo.

**B3. Contacts = découverte gratuite, emails payants.** Apollo trouve les décideurs (~58% des domaines) mais sans email révélé ; et le mapping finder→insert n'est pas finalisé (0 inséré au test).

**B4. Providers async non vérifiés.** Zeliq + clients Kaspr/Lusha/FullEnrich : code défensif, mais le mapping exact des réponses n'est **pas validé contre une vraie clé**.

**B5. Pas de dédup-merge en pipeline.** L'identité canonique (SIREN/UID>domaine>nom) existe + un cleanup ponctuel, mais l'insertion ne dédup pas encore sur SIREN à la source (risque de re-doublons sur futurs sourcing croisés).

**B6. Vérification limitée par le sandbox.** Je n'ai pas pu vérifier les UI (lock profil Playwright) ni atteindre certains endpoints (eu.anthropic) ; SIRENE/Apollo/gouv marchent, pas tout.

**B7. ~1000/1215 chargés.** L'API gouv plafonne la pagination profonde ; les ~215 restants nécessitent un découpage par département.

**B8. Le flux est "construit mais à vide".** Capture non connectée + pas de vrais appels/deals → coaching RAG, flywheel signaux, deal intel tournent sans données réelles.

---

## C. Solutions proposées

- **B1 (fit signal-lourd)** → fit **à deux niveaux** : "identity-confirmed" (registre : secteur+géo+taille exacts = qualifié) vs "signal-confirmed" (+ tech/intent). Afficher les deux ; ne pas exiger les signaux pour qu'un compte registre soit "qualifié". OU pondérer le fit selon la donnée disponible (ne pas pénaliser l'absence de tech quand on n'a pas enrichi). **1/2 journée de code.**
- **B2/B3 (couverture + emails)** → cascade d'enrichissement **FR-first** : FullEnrich ou Zeliq (40+ sources) pour domaine+email+mobile sur les 527 misses + les contacts. Budget : ~0,06€/email, ~0,50€/mobile. Pour 1000 comptes × 1 email = ~60€ ; en cible serrée (les 473 prioritaires) = ~30€.
- **B3 (insert contacts)** → finaliser le mapping finder→contacts + un reveal-email gated par budget (cap configurable). **1-2h.**
- **B4 (providers non vérifiés)** → une passe de validation au 1er appel réel par clé (1 contact test) + ajuster le parser. **30 min/provider.**
- **B5 (dédup pipeline)** → ajouter la clé canonique à l'insert (SIREN/UID/domaine) + un job de merge périodique. **1/2 journée.**
- **B7 (1215)** → boucle par département dans source-icp-sirene. **30 min, gratuit.**
- **B8 (à vide)** → checklist go-live : connecter Gmail/Calendar OAuth → laisser tourner Inngest → faire 5 vrais appels → le flywheel démarre.

---

## Le chemin le plus court vers un flow qui tourne (priorité)
1. **Token Pappers (gratuit) + compte Zefix (gratuit)** → identité FR financials + vérif CH, sans budget.
2. **1 clé d'enrichissement FR** (FullEnrich ou Zeliq) → débloque emails+mobiles (B2/B3). ~30-60€ pour la cible.
3. **Fit à deux niveaux** (B1) → la base registre devient "qualifiée" sans signaux.
4. **Connecter Gmail/Calendar** → capture + flywheel.
5. **Deepgram + host voice-stream + numéros Twilio** → appel live complet.

Net : le **code** est à ~80%. Les 20% restants = surtout **clés + déploiement + budget + 2-3 décisions produit**, plus ~3-4 petits chantiers code (fit 2-niveaux, dédup pipeline, finalisation contacts, 1215).
