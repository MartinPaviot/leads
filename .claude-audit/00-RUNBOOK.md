# 00 — RUNBOOK MAÎTRE — Audit Blanc DD a16z Elevay

> **Comment exécuter le kit de bout en bout.**
> Temps total estimé : 6-12h selon taille du repo et profondeur.
> Pré-requis : Claude Code installé, accès lecture/exécution au repo Elevay, accès staging isolé pour chaos drills.

---

## Vue d'ensemble du kit

```
.claude-audit/
├── 00-RUNBOOK.md           # Ce fichier
├── 01-PREFLIGHT.md         # Prompt de découverte (à exécuter en 1er)
├── 02-INPUTS.md            # Template à remplir par Martin/Ombeline
├── 03-AUDIT-MAIN.md        # Prompt d'audit principal
├── 04-CHAOS-DRILLS.md      # Protocoles d'injection chaos (opt-in)
└── 05-templates/
    ├── FINDING-TEMPLATE.md
    ├── KIRO-REQUIREMENTS-TEMPLATE.md
    ├── KIRO-DESIGN-TEMPLATE.md
    └── KIRO-TASKS-TEMPLATE.md
```

**Outputs produits par l'audit :**
```
.claude-audit/
├── AUDIT-CONTEXT.md        # Auto-généré par 01-PREFLIGHT
├── AUDIT-INPUTS.md         # Rempli manuellement (copie de 02-INPUTS)
├── AUDIT-FINDINGS.md       # Auto-généré par 03-AUDIT-MAIN
├── AUDIT-STATE.md          # Auto-généré (checkpoint inter-phase)
└── CHAOS-RESULTS.md        # Auto-généré par 04-CHAOS-DRILLS

.kiro/specs/
├── FINDING-001/            # Auto-généré par 03-AUDIT-MAIN
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
└── ...
```

---

## Ordre d'exécution séquentiel

### ÉTAPE 1 — Inputs business (Martin + Ombeline, 30-60 min, hors Claude)

1. Copier `02-INPUTS.md` vers `.claude-audit/AUDIT-INPUTS.md`.
2. Remplir **toutes** les sections A à I. Aucune ne peut rester vide.
3. Sections critiques sans lesquelles l'audit économique tombe : **A.1, A.2, A.3, B.1, C.1-C.5**.
4. Si une donnée manque, écrire `INCONNU — à mesurer` plutôt que d'inventer.

**Gate de passage à l'étape 2** : AUDIT-INPUTS.md complet et committé sur une branche `audit/dd-a16z`.

---

### ÉTAPE 2 — Preflight discovery (Claude Code, 15-30 min)

1. Ouvrir une session Claude Code à la racine du repo Elevay.
2. Coller le contenu intégral de `01-PREFLIGHT.md` comme premier message.
3. Autoriser : lecture du repo, exécution de commandes shell read-only (`tree`, `rg`, `cat`, `git log`).
4. Laisser Claude Code produire `.claude-audit/AUDIT-CONTEXT.md`.

**Gate de passage à l'étape 3** : AUDIT-CONTEXT.md généré, vérification humaine (étape 3).

---

### ÉTAPE 3 — Validation humaine du context (Martin, 10 min)

Ouvrir AUDIT-CONTEXT.md et vérifier :
- [ ] Stack effective détectée correspond à la stack réelle.
- [ ] Paths agents/tools/prompts/RAG/memory pointent vers les bons dossiers.
- [ ] Les 5 flows démo sont détectés (ou marqués ABSENT explicitement).
- [ ] Pas de fausse détection (un fichier `agents/` legacy mistakenly marqué prod, etc.).
- [ ] Conventions repo correctement décrites.

Si KO sur ≥1 point : annoter manuellement les corrections dans AUDIT-CONTEXT.md, puis passer à l'étape 4.

**Gate de passage à l'étape 4** : AUDIT-CONTEXT.md validé.

---

### ÉTAPE 4 — Audit principal (Claude Code, 4-8h)

1. **Nouvelle session Claude Code** (contexte propre, pas de continuation de l'étape 2).
2. Coller le contenu intégral de `03-AUDIT-MAIN.md`.
3. Le prompt va lire AUDIT-CONTEXT.md et AUDIT-INPUTS.md automatiquement.
4. Autoriser : lecture, exécution tests, instrumentation locale, accès staging read-only, accès logs prod 7 jours glissants.
5. **Ne pas autoriser** : modifications du repo (l'audit est read-only par principe), accès prod write.

**Stratégie de session** :
- Repo < 50k LOC : 1 session continue.
- Repo 50-100k LOC : 2 sessions. Session 1 = Phases 0-3. Sauvegarder `AUDIT-STATE.md`. Session 2 = Phases 4-6 en relisant STATE + CONTEXT + INPUTS + FINDINGS partiels.
- Repo > 100k LOC : 3 sessions (0-2, 3-4, 5-6).

**Gate de passage à l'étape 5** : AUDIT-FINDINGS.md généré + arborescence `.kiro/specs/` peuplée pour tous les P0 et P1.

---

### ÉTAPE 5 — Chaos drills (optionnel mais recommandé, env isolé, 2-4h)

⚠️ **Ne jamais exécuter en prod.** Uniquement sur staging isolé avec snapshot DB restaurable.

1. Provisionner ou identifier env staging dédié.
2. Snapshot DB et services tiers en mode mock si possible.
3. Coller `04-CHAOS-DRILLS.md` dans une nouvelle session Claude Code.
4. Suivre les 6 protocoles séquentiellement.
5. CHAOS-RESULTS.md s'agrège dans AUDIT-FINDINGS.md (section dédiée).

---

### ÉTAPE 6 — Synthèse & arbitrages (Martin + Ombeline, 2h, hors Claude)

1. Lire AUDIT-FINDINGS.md en entier (commencer par la synthèse exécutive d'1 page).
2. Pour chaque P0 : assigner owner + deadline (semaine 1).
3. Pour chaque P1 : assigner owner + sprint (sprint suivant).
4. Identifier les 3 angles à pré-empter en pitch a16z (slide dédié dans le deck).
5. Identifier les 2-3 forces à mettre en avant (avec evidence du repo).

---

## Contre-mesures et recovery

### Si Claude Code dérive en cours d'audit
Symptômes : findings génériques, pas de fichier:ligne, répétitions, perte de fil.
Action :
1. Stopper la session.
2. Sauvegarder l'état partiel dans `AUDIT-STATE.md`.
3. Nouvelle session avec : 03-AUDIT-MAIN.md + AUDIT-CONTEXT.md + AUDIT-INPUTS.md + AUDIT-STATE.md + instruction *"reprends à la sub-phase X, en t'appuyant sur les findings déjà produits"*.

### Si une sub-phase échoue (ex: pas d'accès aux logs prod)
Action : marquer la sub-phase comme `EXECUTED-WITH-LIMITATIONS` dans AUDIT-FINDINGS.md, lister explicitement ce qui n'a pas pu être audité, classer ces zones en `P1-AUDIT-GAP`.

### Si trop de findings P0 (>15)
Symptômes : noyade.
Action : prioriser les P0 par *impact-DD × effort-correction*. Top 5 P0 = critique avant DD. Le reste devient P1.

### Si zéro finding P0
Suspect. Re-challenger. Souvent : le prompt est trop indulgent, ou le repo a été nettoyé pour l'audit (cosmetic prep). Investiguer les *adjacent flows* (§5/Phase 3 du prompt principal).

---

## Critères de succès du kit

À la fin de l'étape 6, tu dois pouvoir répondre par OUI à chacune :
- [ ] Je connais les 5 plus gros risques techniques de mon stack vus par un partner a16z.
- [ ] Pour chaque P0, j'ai un plan d'attaque actionnable cette semaine.
- [ ] Mon unit economics IA-only à 1k tenants tient (marge brute ≥ seuil défini en A.3).
- [ ] Je sais lesquels de mes claims marketing sont défendables sans transformation.
- [ ] J'ai 3 angles offensifs à pré-empter en pitch (anticiper > subir).
- [ ] Je sais ce qui distingue Elevay d'un wrapper Claude + Apollo + Composio.

Si NON sur ≥2 : l'audit n'est pas terminé, recommencer la sub-phase concernée.

---

**Lance l'étape 1 maintenant. Ne saute aucune étape.**
