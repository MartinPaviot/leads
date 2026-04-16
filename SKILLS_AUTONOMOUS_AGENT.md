# CLAUDE.md — Elevay Skills Autonomous Agent

## Mission

Tu es un agent autonome. Tu tournes pendant 3 heures sans intervention humaine.
Ta mission : analyser le repo goose-skills, auditer le codebase Elevay, et implémenter un système de skills GTM modulaire dans Elevay — skill par skill, testé, compilé, commité.

**Tu ne poses JAMAIS de question. Tu décides. Tu traces tes décisions dans le state file.**

---

## Boucle autonome

Tu opères en boucle continue. Chaque itération suit ce cycle :

```
ANALYZE → PLAN → BUILD → VALIDATE → COMMIT → NEXT
```

### Mécanisme de state

Au démarrage, vérifie si `.skills-agent/state.json` existe.
- S'il n'existe pas : commence à PHASE 0.
- S'il existe : lis le state, reprends là où tu en es.

```bash
mkdir -p .skills-agent
```

Structure du state file :

```json
{
  "current_phase": 0,
  "started_at": "ISO timestamp",
  "last_updated": "ISO timestamp",
  "phases_completed": [],
  "current_skill": null,
  "skills_queue": [],
  "skills_completed": [],
  "skills_failed": [],
  "audit_complete": false,
  "infra_complete": false,
  "total_skills_implemented": 0,
  "decisions_log": []
}
```

**Après chaque action significative**, mets à jour le state file. C'est ta mémoire persistante.

### Logging des décisions

Pour chaque décision non triviale, ajoute une entrée dans `decisions_log` :

```json
{
  "timestamp": "ISO",
  "phase": 1,
  "decision": "Choisi de wrapper apolloClient.ts existant plutôt que recréer un client",
  "reason": "Le client gère déjà rate limiting et cache Redis"
}
```

---

## PHASE 0 — Analyse profonde (30-45 min)

Cette phase est la plus importante. Ne la bâcle pas.

### 0.1 — Clone et analyse goose-skills

```bash
git clone https://github.com/gooseworks-ai/goose-skills.git /tmp/goose-skills
```

Lis **chaque** SKILL.md du repo. Pas un échantillon — tous.
Pour chaque skill, extrais dans `.skills-agent/goose-skills-catalog.md` :

```markdown
## <slug>
- **Type** : capability | composite | playbook
- **Ce que ça fait** : <1 ligne>
- **APIs utilisées** : <liste>
- **Pattern intéressant** : <ce qu'on peut apprendre de l'implémentation>
- **Pertinent pour Elevay** : oui/non/partiel — <pourquoi>
```

### 0.2 — Audit complet du codebase Elevay

Lis le codebase en entier. Cartographie dans `.skills-agent/elevay-audit.md` :

```markdown
## Fichiers clés
- Schema Prisma : <chemin> — <modèles principaux>
- Client Apollo : <chemin> — <méthodes disponibles>
- Client Composio : <chemin> — <intégrations configurées>
- Jobs Inngest : <chemin> — <jobs existants>
- Routes API : <chemins> — <endpoints>
- Utils/Helpers : <chemins> — <fonctions réutilisables>

## Fonctionnalités GTM existantes
Pour chaque feature, indiquer :
- Fichier(s) source
- Ce que ça fait exactement
- Ce qui manque pour en faire un "skill" complet
- Quel(s) skill(s) goose-skills ça couvre

## Schéma de base de données
Lister chaque modèle Prisma pertinent avec ses champs clés.

## Infra disponible
- Cache Redis : comment c'est utilisé, TTLs, patterns
- Inngest : fonctions existantes, patterns d'événements
- Auth/Tenancy : comment le multi-tenant est géré
```

### 0.3 — Matrice de mapping

Crée `.skills-agent/mapping-matrix.md` :

```markdown
| Skill goose-skills | Existe dans Elevay ? | Fichier(s) | Effort | Priorité |
|---|---|---|---|---|
| tam-builder | Partiel — apollo search existe, pas le scoring | src/lib/apollo.ts | Wrapper | P0 |
| signal-scanner | Non | — | Nouveau | P1 |
| ... | ... | ... | ... | ... |
```

Effort = `Wrapper` (< 1h, code existe) | `Adapt` (1-2h, code partiel) | `Nouveau` (2-3h, from scratch)

Priorité :
- **P0** : Core GTM flow (TAM, enrichment, scoring, outreach) — implémenter en premier
- **P1** : Competitive intel, SEO, monitoring — fort impact business
- **P2** : Nice-to-have, scraping additionnel

### 0.4 — Architecture decision

Basé sur l'audit, écris `.skills-agent/architecture-decision.md` :

- Structure de dossiers exacte (basée sur ce qui existe, pas théorique)
- Types partagés (basés sur les types Prisma réels du projet)
- Pattern runner/registry adapté à l'infra Inngest existante
- Comment le dry-run s'intègre avec la logique existante
- Comment les skills se connectent aux routes API existantes

**Règle** : l'architecture doit être la plus simple qui fonctionne. Pas d'over-engineering. Si le projet n'utilise pas de pattern registry, n'en impose pas un complexe. Adapte-toi au style du code existant.

### 0.5 — Générer la queue ordonnée

Basé sur la matrice, génère `skills_queue` dans le state file. Ordre :
1. Infra minimale (types + runner)
2. Skills P0 type `Wrapper` (quick wins)
3. Skills P0 type `Adapt`
4. Skills P0 type `Nouveau`
5. Skills P1 type `Wrapper`
6. etc.

Mets à jour le state : `audit_complete: true`.

---

## PHASE 1 — Infrastructure (30-45 min)

Crée l'infrastructure minimale pour supporter les skills.

### Règles

- Base-toi sur `.skills-agent/architecture-decision.md`
- Réutilise les types existants du projet au maximum
- Le runner doit gérer : dry-run, logging, coût tracking, error wrapping
- Le registry doit être simple : une Map ou un objet, pas une factory abstraite
- **Pas de dead code** — chaque ligne doit être utilisée par la Phase 2

### Validation

```bash
# Doit passer sans erreur
npx tsc --noEmit
# OU le build command du projet
npm run build
```

Si ça ne compile pas, fix immédiatement. Ne passe pas à la suite tant que ça ne compile pas.

### Commit

```bash
git add -A
git commit -m "feat(skills): infrastructure — types, runner, registry"
```

Mets à jour le state : `infra_complete: true`.

---

## PHASE 2+ — Implémentation skill par skill (boucle continue)

Pour chaque skill dans `skills_queue`, exécute ce cycle :

### STEP 1 — Préparer

```
Lis le SKILL.md goose-skills correspondant dans /tmp/goose-skills/
Identifie le code Elevay à wrapper/adapter (depuis elevay-audit.md)
Décide de l'approche exacte — log dans decisions_log
```

### STEP 2 — Coder

Crée le dossier du skill avec :
- `SKILL.md` — documentation complète, adaptée au contexte Elevay
- `schema.ts` — Zod schemas input/output (ou le pattern de validation du projet)
- `handler.ts` — logique métier, branchée sur le vrai code
- `index.ts` — export propre
- Test minimal — au moins dry-run

**Règles absolues :**
- Importe depuis les vrais fichiers du projet, pas des chemins inventés
- Utilise les vrais noms de modèles Prisma
- Utilise les vrais clients API
- Zéro `// TODO`, zéro `placeholder`, zéro `any`
- Le dry-run est le mode par défaut
- Documente les coûts réels

### STEP 3 — Valider

```bash
# 1. Compile ?
npx tsc --noEmit

# 2. Tests passent ?
npx jest --testPathPattern="<skill-slug>" --passWithNoTests
# OU le test runner du projet

# 3. Lint propre ?
npx eslint src/skills/<category>/<slug>/
```

### STEP 4 — Résultat

**Si tout passe :**
```bash
git add -A
git commit -m "feat(skills): <slug> — <description courte>"
```
→ Ajoute le slug à `skills_completed`, incrémente `total_skills_implemented`
→ Passe au skill suivant

**Si ça échoue :**
- Tente de fix (3 tentatives max)
- Si 3 échecs : log l'erreur dans `skills_failed`, passe au suivant
- Ne reste JAMAIS bloqué sur un skill plus de 20 minutes

### STEP 5 — Réévaluer

Tous les 3 skills implémentés, réévalue la queue :
- Un nouveau skill est devenu possible grâce à un upstream implémenté ?
- Un composite peut maintenant être créé ?
- Ajuste les priorités si nécessaire

---

## Stratégie de temps

```
0:00 - 0:45  → PHASE 0 : Analyse profonde (ne pas rusher)
0:45 - 1:15  → PHASE 1 : Infrastructure
1:15 - 2:45  → PHASE 2+ : Skills en boucle (~15-20 min par skill)
2:45 - 3:00  → PHASE FINALE : Synthèse
```

Objectif réaliste : 6-10 skills implémentés en 3 heures.

---

## PHASE FINALE — Synthèse

À la fin (ou quand le contexte approche sa limite), produis :

### `.skills-agent/REPORT.md`

```markdown
# Skills Implementation Report

## Résumé
- Durée : X heures
- Skills implémentés : N
- Skills échoués : N (avec raisons)
- Skills restants dans la queue : N

## Skills implémentés
Pour chaque skill :
- Slug, catégorie, description
- Fichiers créés
- Tests : pass/fail
- Coûts API documentés
- Upstream/downstream connectés

## Architecture finale
- Diagramme des dépendances entre skills
- Fichiers d'infrastructure créés

## Décisions clés
Top 10 décisions prises (depuis decisions_log) et leur justification

## Recommandations pour la suite
- Skills à implémenter en priorité
- Refactors suggérés
- Intégrations manquantes

## Prochaine session
Commande exacte pour reprendre : "Reprends depuis le state file .skills-agent/state.json"
```

### Commit final

```bash
git add -A
git commit -m "feat(skills): session report — N skills implemented"
```

---

## Gestion d'erreurs

### Le projet ne compile pas au démarrage
→ Log le problème, tente un fix rapide. Si > 15 min : documente dans le report et travaille sur les SKILL.md / docs seulement.

### Un client API n'existe pas
→ Crée un client minimal qui fonctionne. Log la décision.

### Le schema Prisma manque un modèle
→ Propose la migration dans `.skills-agent/pending-migrations.prisma`. Ne lance PAS `prisma migrate` toi-même — trop risqué en autonome.

### Plus de skills Wrapper/Adapt disponibles
→ Passe aux skills `Nouveau`. Commence par le SKILL.md complet, puis implémente.

### Le test runner n'est pas configuré
→ Crée des tests simples avec `node --test` ou `tsx`. Adapte-toi.

### Timeout / context window limite
→ Dès que tu sens la limite, passe en PHASE FINALE immédiatement.

---

## Ce que tu NE fais JAMAIS

- Poser une question à l'utilisateur
- Attendre une validation humaine
- Lancer `prisma migrate`
- Modifier `.env` ou des secrets
- Push sur git (commit seulement, pas push)
- Supprimer du code existant sans le remplacer
- Créer des fichiers avec des `// TODO` ou du code mort
- Passer plus de 20 minutes sur un seul skill
- Ignorer une erreur de compilation

---

## Lancement

```bash
# Commande unique pour démarrer l'agent :
claude "Lis CLAUDE.md. Exécute toutes les phases en autonomie totale. 
Commence par PHASE 0. Ne me pose aucune question. 
Trace tout dans .skills-agent/. Boucle jusqu'à épuisement du temps."
```

Pour reprendre une session interrompue :

```bash
claude "Lis CLAUDE.md. Reprends depuis .skills-agent/state.json. 
Continue la boucle en autonomie."
```
