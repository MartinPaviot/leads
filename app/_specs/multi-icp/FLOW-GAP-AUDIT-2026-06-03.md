# Audit — ce qu'il manque pour un flow cold-call PARFAIT (2026-06-03)

Constat global : **la machinerie est largement construite ; elle est surtout
DARK** (sans clés/déploiement) et **la donnée ne circule pas encore de bout en
bout** (pas de contacts, capture non connectée, flywheel vide). Les manques se
rangent en 5 types : **[CODE]** (à écrire), **[CLÉ]** (credential), **[DEPLOY]**
(infra), **[DONNÉE]** (hygiène/volume), **[DÉCISION/ACHAT]** (toi).

---

## Étape 1 — Identification des cibles (sourcing)
Solide : SIRENE FR (1000 comptes, gratuit, autoritatif), Apollo (intl), ICP multi-critères.
Manque pour parfait :
- **Suisse non sourcée nativement** — ICP-1 Suisse romande + tout ICP-2 reposent sur la couche CH mince d'Apollo. Besoin : Cognism (découverte, **[ACHAT]**) ou Zefix (vérif seulement, **[CLÉ]** compte gratuit). **[CODE]** un client Cognism.
- **Les 215 derniers FR** (1215−1000) — l'API gouv plafonne la pagination ; découper par département. **[CODE]** mineur, gratuit.
- **Orchestration multi-source + UI** — aujourd'hui ce sont des scripts. Un job/bouton "Build TAM multi-source" (Apollo+SIRENE+Cognism) avec routing géo. **[CODE]**.
- **Pappers** (financials + levées FR) en complément de SIRENE. **[CLÉ]** token gratuit.

## Étape 2 — Enrichissement (LE gros manque)
Solide : Apollo domaine+firmo (~47% FR), cascade contact (Apollo→Kaspr→Lusha) + Zeliq + FullEnrich **construits**.
Manque pour parfait :
- **CONTACTS = le trou béant** — les 473 comptes enrichis ont un domaine mais **zéro décideur/email/mobile**. On appelle une *personne*, pas un domaine. Rien n'est encore sourcé côté contacts. **[CODE]** (people-search) + **[CLÉ/ACHAT]** (reveal email/mobile = coûteux).
- **Mobiles FR/CH** — Kaspr/Lusha/Zeliq/FullEnrich **non activés** (pas de clés). Apollo mobile FR faible. **[CLÉ/ACHAT]**.
- **527 SIRENE Apollo-misses** — besoin d'un enrichisseur FR pour le domaine. **[CLÉ/ACHAT]**.
- **Vérif email/tél** (email_status, DNC) — présent mais inutile sans contacts.

## Étape 3 — Priorisation (kairos)
Solide : priority_score = signal × fit × accessibilité ; recompute fit ; cron quotidien.
Manque :
- **Signaux pas peuplés** — funding window, hiring, intent : SIRENE/Apollo-firmo ne remplissent pas tous les signaux. **[DONNÉE]** (enrichissement signaux) + **[CLÉ]** (Crunchbase funding).
- **Flywheel vide** — `signal_outcomes` a besoin de vrais deals won/lost (zéro aujourd'hui). Se remplit avec l'usage. **[DONNÉE]** dans le temps.
- File d'appel inutile tant que contacts+téléphones absents (dépend de l'étape 2).

## Étape 4 — L'appel
Solide : Twilio + Call Mode (cockpit), consentement CH/FR, voicemail, DNC, quiet hours, usage cap. Serveur de transcription live **construit + script réparé**.
Manque :
- **Numéros Twilio** (+33/+41) à provisionner dans le pool. **[CLÉ/ACHAT]**.
- **Transcription live pas déployée** — besoin `DEEPGRAM_API_KEY` **[CLÉ]** + héberger le serveur wss joignable par Twilio **[DEPLOY]**.
- **Coaching live** (objections) — câblé, besoin LLM joignable + Phase 3. **[DEPLOY]**.

## Étape 5 — Capture (email/visio/tel → CRM)
Solide : les 3 chemins (email/meeting/call) → `activities` + file d'approbation human-in-the-loop. Graphe de contexte.
Manque :
- **OAuth Gmail/Calendar non connecté** par tenant — la capture email/meeting ne tourne pas sans ça. **[CLÉ]** (connexion OAuth de Martin).
- **Recall.ai (visio)** — besoin clé pour le bot d'enregistrement. **[CLÉ]**.
- Notes auto (résumés) — seulement dans activities.metadata, pas en `notes`. **[CODE]** mineur.

## Étape 6 — Réutilisation
Solide : coaching RAG, deal intel/risk, briefs, chat sur CRM avec citations, scoring santé.
Manque : tout dépend de **données réelles qui circulent** (capture connectée + vrais appels/meetings). Sans ça, ces moteurs tournent à vide. **[DONNÉE]**.

---

## Cross-cutting (les vrais bloquants)
- **[CLÉ] Credentials** — le plus gros frein. Tout est construit mais éteint sans : Kaspr, Lusha, Zeliq, FullEnrich, Deepgram, Pappers, Cognism, Zefix, Recall.ai, Gmail/Calendar OAuth, Twilio.
- **[DEPLOY] Infra** — serveur voice-stream (wss), Inngest qui tourne (crons fit/signaux + workers post-call), app déployée.
- **[DONNÉE] Hygiène** — job de dédup-merge (doublons détectés, pas fusionnés), exclusion des 109 fixtures E2E, filtre actif-only, et un **tenant Pilae propre** (vs E2E Test Workspace).
- **[CODE] UI manquantes** — accroche depuis signaux (générée + API, pas affichée dans Call Mode) ; bouton sourcing multi-source ; UI de la file d'approbation est faite.
- **[DÉCISION] Précision Apollo** — passer `industry` en required sur les 592 Apollo-TAM (37% on-target).
- **[CODE/PROCESS] Branche non mergée** — feat/ch-fr-prospecting (toute cette session) à reviewer + merger ; commit landing de Martin interleavé à séparer.

---

## Chemin critique vers "parfait" (priorisé)
1. **Contacts + mobiles** (étape 2) — sans décideurs joignables, pas de cold call. → clé FR (FullEnrich/Zeliq) + budget. **LE bloquant n°1.**
2. **Connecter la capture** (Gmail/Calendar OAuth + Recall) — pour que le flywheel se remplisse.
3. **Déployer voice-stream + Deepgram + numéros Twilio** — pour l'appel live complet.
4. **Suisse** (Cognism/Zefix) — couvrir la moitié CH des ICP.
5. **Hygiène** — fixtures, dédup-merge, tenant propre.
6. **Polish** — accroche en UI, industry-required, merge de la branche.

Net : ~80% du **code** est là. Les 20% restants sont surtout **des clés, du
déploiement et de la donnée qui circule** — pas du build. Le seul gros chantier
CODE restant = **la couche contacts** (people-search + reveal) et un **client
Cognism** pour la Suisse.
