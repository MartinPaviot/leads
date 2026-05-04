# Architecture d'equipes d'agents IA — Recherche complete

_Date: 2026-05-01_

---

## TL;DR pour Martin

Tu peux monter une equipe de 5-6 agents IA autonomes qui travaillent 24/7 sur Elevay pour ~$300-500/mois. Le pattern qui marche en production: **fichiers de poste rigides (SOUL.md) + file d'attente partagee (TASKS.md) + heartbeat scheduling + memoire par fichiers**. Pas besoin de framework externe — Claude Code a deja tout nativement (subagents, routines, worktrees).

---

## 1. Le paysage des frameworks (mai 2026)

### Comparaison rapide

| Framework | Agent = | Communication | Force | Faiblesse |
|-----------|---------|---------------|-------|-----------|
| **CrewAI** | role + goal + backstory | Delegation | Simple, memoire RAG integree | Manager opaque, tokens eleves |
| **AutoGen/AG2** | system_message + description | GroupChat partage | Critique iterative | En maintenance, remplace par MS Agent FW |
| **LangGraph** | Node function + system prompt | Edges du graphe | Deterministe, checkpoints, prod-ready | Courbe d'apprentissage |
| **Agency Swarm** | name + instructions | send_message directionnel | Predictible, typed tools | Synchrone, lie a OpenAI |
| **OpenAI Agents SDK** | instructions + functions | Handoff par return | Ultra simple | Pas de memoire builtin |
| **Claude Code** | Markdown + YAML frontmatter | Mailbox + task list | Natif au dev workflow, worktrees | Teams experimental |

### Verdict: Claude Code est le bon choix pour Elevay

Pourquoi:
- Deja dans ton stack
- Git worktree isolation = pas de conflits de fichiers entre agents
- Routines (cloud-scheduled) = agents autonomes sans infra
- Subagents avec model routing = Haiku pour le cheap, Opus pour le complexe
- Pas de framework externe a maintenir

---

## 2. L'architecture qui marche en production

### Le pattern "24/7 Agent Team" (valide par plusieurs implementations reelles)

```
projet/
├── AGENTS.md              # Regles partagees par TOUS les agents
├── agents/
│   ├── research/
│   │   ├── SOUL.md        # Fiche de poste (40-60 lignes MAX)
│   │   └── memory/
│   │       ├── MEMORY.md  # Insights long-terme
│   │       └── 2026-05-01.md  # Log du jour
│   ├── engineer/
│   │   ├── SOUL.md
│   │   └── memory/
│   ├── qa/
│   │   ├── SOUL.md
│   │   └── memory/
│   ├── gtm/
│   │   ├── SOUL.md
│   │   └── memory/
│   └── ops/
│       ├── SOUL.md
│       └── memory/
├── TASKS.md               # File d'attente async avec priorites
├── HEARTBEAT.md           # Detection de staleness + auto-healing
└── intel/
    ├── DAILY-INTEL.md     # Rapport quotidien (un writer, many readers)
    └── data/
        └── 2026-05-01.json
```

### Pourquoi des fichiers et pas une API/DB

> "Files do not crash. Files do not have authentication issues."

Pour une equipe de <6 agents, le pattern **one-writer-many-readers** avec des fichiers Markdown est plus robuste que toute orchestration API. Git donne l'historique, les conflits sont rares car chaque agent ecrit dans son propre espace.

---

## 3. Comment ecrire une fiche de poste (SOUL.md)

### Structure validee en production

```markdown
# SOUL.md — [Nom de l'agent]

## Identite
- Nom: [Nom]
- Role: [Titre specifique — "Senior Data Researcher" pas "Researcher"]
- Scope: [Limites explicites de responsabilite]
- Exclusions: [Ce qui n'est PAS son job]

## Hard Stops (gardes-fous)
- Never [action interdite 1]
- Never [action interdite 2]  
- Si demande hors-scope → rediriger vers [agent appropriate]

## Outils autorises
- [tool_name]: Utiliser quand [scenario]. Jamais quand [anti-pattern].

## Format de sortie
- Resume: 2-3 phrases
- Findings: array de {fait, source, confiance}
- Recommandations: array de {action, priorite, rationale}

## Coordination
- Rapporte a: [agent superviseur ou canal]
- Check-in: [frequence]
- Handoff: [quel contexte transferer]
- Si bloque: [quoi faire]
```

### Regles critiques

1. **40-60 lignes MAX** — au-dela, l'agent ignore les sections tardives (context overflow)
2. **Identite avant instructions** — "Instructions sans identite produisent un agent qui suit les regles mecaniquement plutot que d'exercer du jugement"
3. **Exclusions explicites** — dire ce que l'agent ne fait PAS est aussi important que ce qu'il fait
4. **Pre-defined redirects** — quand on le pousse hors-scope, il a une reponse scriptee

---

## 4. Coordination entre agents

### Le pattern TASKS.md (file d'attente async)

```markdown
## P0 (critique)
- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
  - **Tags**: backend, auth
  - **Acceptance**: Refresh works, tests pass, regression test added
  - **Blocked by**: none

## P1 (important)
- [ ] Add rate limiting to public API
  - **ID**: rate-limit  
  - **Tags**: backend, security
  - **Acceptance**: 100 req/min per key, 429 response
  - **Blocked by**: auth-fix

## P2 (nice to have)
- [x] Update onboarding copy (@gtm-agent, done 2026-04-30)
```

**Lifecycle d'une tache:**
1. Find → agent scanne TASKS.md
2. Pick → prend la plus haute priorite non-bloquee
3. Claim → marque `(@agent-id)` 
4. Work → execute
5. Complete → retire de la liste (historique dans git log)
6. Loop

### Protocole de handoff structure

Quand un agent passe le relai a un autre:

```json
{
  "source_agent": "research",
  "destination_agent": "engineer", 
  "task_id": "feature-scoring",
  "handoff_reason": "research_complete",
  "context": {
    "findings_file": "_research/scoring-approaches.md",
    "recommendation": "Use gradient boosting, not rules engine",
    "constraints": ["must run in <200ms", "no external API calls"],
    "open_questions": ["training data source TBD"]
  }
}
```

### Les 4 patterns de handoff

| Pattern | Quand | Risque |
|---------|-------|--------|
| **Sequential** | Pipeline lineaire (research → spec → build) | Erreur cascade |
| **Hierarchique** | 60% des deployments prod. Un superviseur dirige | Single point of failure |
| **Parallel (fan-out)** | Analyse multi-perspective | Race conditions |
| **Event-driven** | Triggers (nouveau lead, PR merged) | Debug difficile |

---

## 5. Scheduling et fonctionnement 24/7

### Le pattern Heartbeat

Les agents sont **dormants par defaut**. Ils se reveillent a intervalles definis. Chaque reveil = un cycle complet et auto-contenu.

```
Research:  08:01, 16:01          (2x/jour)
Engineer:  10:01                 (1x/jour, pull tasks)
QA:        apres chaque merge   (event-driven)
GTM:       07:01, 13:01, 19:01  (3x/jour)
Ops:       toutes les 6h        (health check)
```

### Auto-healing

Un agent coordinateur (Ops) verifie que chaque agent a tourne dans sa fenetre de staleness (ex: 26h). Si non → force re-execution.

### Implementation avec Claude Code

```bash
# Routine cloud (Pro plan: 5/jour)
claude schedule create \
  --name "research-agent" \
  --cron "0 8,16 * * *" \
  --prompt "Load agents/research/SOUL.md. Check TASKS.md for research tasks. Execute. Write findings to intel/."

# Ou via /schedule dans la conversation
```

---

## 6. Memoire partagee

### Architecture hybride recommandee

| Couche | Contenu | Backend |
|--------|---------|---------|
| **Hot** | Messages recents + etat courant | Fichiers dans `agents/[name]/memory/` |
| **Warm** | Connaissances cross-session | Rippletide MCP (`remember`/`recall`) |
| **Cold** | Historique complet | Git log + fichiers archives |

### Scoping de la memoire

- **Memoire privee**: chaque agent dans `agents/[name]/memory/` — ses observations, son contexte
- **Memoire partagee**: `intel/` et `TASKS.md` — ce que tous les agents lisent
- **Memoire projet**: Rippletide — graphe de connaissances avec relations

### Regle d'or

> "Design your memory architecture BEFORE you write your first agent."

Les decisions de scoping prises tot deviennent tres difficiles a restructurer plus tard.

---

## 7. Chiffres cles et anti-patterns

### Statistiques de production

- **57% des echecs multi-agent** sont des echecs d'orchestration (pas de l'agent individuel)
- **36.9% des echecs** viennent de desalignement inter-agents (versions differentes de l'info)
- **Un seul agent egale les multi-agents dans 64% des benchmarks** (Princeton NLP) — multi-agent n'ajoute que +2.1% de precision pour 2x le cout
- **Solo founders**: $300-500/mois en agents vs $80-120K/mois en salaires humains
- **36.3% des nouvelles ventures en 2026** sont solo-founded
- **2 semaines par workflow d'agent** pour atteindre la fiabilite

### Anti-patterns a eviter

1. **Trop d'agents trop tot** — commencer simple, un agent bien fait > 5 agents bancals
2. **Prompts bloated (>2000 mots)** — l'agent ignore la fin, garder 40-60 lignes
3. **Pas de stopping conditions** — l'agent travaille indefiniment sans savoir quand s'arreter
4. **Memoire sans scoping** — tous les agents voient tout = pollution de contexte
5. **Always-on sans heartbeat** — cout explose, pas de detection de stall
6. **Directives contradictoires** — paralysie de l'agent
7. **Pas de metriques** — impossible de savoir si l'equipe fonctionne

### Metriques de sante d'equipe

| Metrique | Cible |
|----------|-------|
| First-attempt pass rate | 60-80% |
| Handoff latency (p95) | <500ms |
| Context retention rate | >95% |
| Task completion post-handoff | >95% |
| Agent drift (hors-scope actions) | <5% |

---

## 8. Standards emergents (2026)

### Google A2A (Agent-to-Agent Protocol)

Protocole ouvert donne a la Linux Foundation. 50+ partenaires (Atlassian, Salesforce, SAP). Les agents publient une "Agent Card" JSON qui annonce leurs capacites. Permet la communication cross-vendor.

### MCP (Model Context Protocol)

Standard pour l'integration d'outils. Supporte par LangGraph, MS Agent Framework, OpenAI Agents SDK, Claude Code. Separe l'interface outil de l'implementation.

### TASKS.md Specification

Standard emergent pour les files d'attente de taches agent. Format Markdown avec priorites, blocking, claiming.

---

## 9. Plan d'implementation pour Elevay

### Phase 1: Un seul agent bien fait (semaine 1)

Commencer par l'agent **Engineer** car c'est le plus directement utile:
- Ecrire sa SOUL.md (40 lignes)
- Lui donner acces a TASKS.md
- Le lancer en routine quotidienne
- Mesurer: taches completees, pass rate, drift

### Phase 2: Ajouter Research + QA (semaine 2-3)

- Research: veille concurrentielle + enrichissement
- QA: evaluation post-merge automatique
- Mettre en place HEARTBEAT.md

### Phase 3: GTM + Ops (semaine 4)

- GTM: sequences outbound, scoring
- Ops: health monitoring, budget tracking
- Tout le systeme tourne en autonome

### Phase 4: Optimiser (ongoing)

- Analyser les metriques
- Affiner les SOUL.md selon les echecs
- Ajouter des agents specialises si besoin

---

## 10. Exemples concrets de SOUL.md pour Elevay

### Agent Research

```markdown
# SOUL.md — Dwight (Research Agent)

## Identite
- Role: Senior Market Research Analyst
- Scope: Veille concurrentielle, enrichissement de donnees, signaux marche
- Exclusions: Ne code jamais. Ne modifie jamais le produit. Ne contacte jamais les leads.

## Hard Stops
- Never scrape sans respecter robots.txt
- Never depenser sans verifier le budget dans _reports/spending.md
- Si une info semble fausse → marquer confidence: low, ne pas utiliser

## Outils
- WebSearch: recherche large puis affiner
- WebFetch: pages specifiques, sauver en raw
- Rippletide remember/recall: persister les insights
- Fichiers: ecrire dans intel/ et _research/

## Output
- Chaque session produit un fichier dans intel/data/YYYY-MM-DD.json
- Resume dans intel/DAILY-INTEL.md (append, ne jamais ecraser)
- Screenshots dans _research/screenshots/ si pertinent

## Coordination
- Lit TASKS.md pour les taches tagguees "research"
- Handoff vers Engineer via note dans TASKS.md quand research → actionable
- Check-in: 2x/jour (8h, 16h)
```

### Agent Engineer

```markdown
# SOUL.md — Ross (Engineer Agent)

## Identite
- Role: Senior Full-Stack Engineer
- Scope: Implementation de features, bug fixes, tests, refactoring
- Exclusions: Ne fait pas de research. Ne fait pas de QA finale. Ne deploy pas.

## Hard Stops  
- Never push to main sans tests passing
- Never modifier l'auth/security sans flag dans TASKS.md
- Never ajouter de dependance sans justification en commit message
- Si bloque >30min → ecrire dans TASKS.md "blocked: [raison]" et passer a autre chose

## Standards
- TypeScript strict, Next.js 15, Tailwind
- Conventional commits: feat:, fix:, chore:
- Branches: feat/[task-id], fix/[task-id]
- Max 30 lignes par fonction
- Pas d'emoji dans le code ou l'UI

## Outils
- Read, Write, Edit, Bash, Grep, Glob
- Git (branch, commit, jamais force push)
- Context7 avant toute utilisation de lib

## Coordination
- Pull taches de TASKS.md tagguees "engineering"
- Quand feature done → ajouter tache "qa: [feature]" pour QA agent
- Check-in: 1x/jour (10h)
```

### Agent QA

```markdown
# SOUL.md — Monica (QA Agent)

## Identite
- Role: Senior QA Engineer / Hostile Tester
- Scope: Evaluation de features, regression testing, scoring qualite
- Exclusions: Ne corrige jamais les bugs elle-meme. Ne merge jamais.

## Hard Stops
- Never approve une feature sans l'avoir testee en live
- Never modifier le code source
- Si score <0.7 → FAIL automatique, pas de negotiation

## Methode
- Guilty until proven innocent
- Tester: happy path, edge cases, donnees reelles, regression
- Scoring 0.0-1.0 sur 5 dimensions (voir EVAL_RUBRIC.md)
- Chaque bug trouve → creer une tache regression test dans TASKS.md

## Output
- Rapport dans _reports/eval-[feature-id].md
- Screenshots avant/apres dans _reports/screenshots/
- Verdict: PASS (merge) ou FAIL (delete branch, retry)

## Coordination
- Declenchee apres chaque merge ou tache "qa:" dans TASKS.md
- Si FAIL → cree tache "fix: [description]" pour Engineer
- Si PASS → met a jour milestones.json
```

---

## Sources

- CrewAI Documentation (docs.crewai.com)
- AG2 / Microsoft Agent Framework 1.0
- LangGraph Multi-Agent (docs.langchain.com)
- Agency Swarm (github.com/VRSEN/agency-swarm)
- OpenAI Agents SDK (openai.github.io/openai-agents-python)
- Claude Code Subagents & Agent Teams (code.claude.com/docs)
- "The Solo Founder AI Agent Stack" (blog.mean.ceo)
- "3-Person Team + 50 AI Agents" (Medium/Bonsai Labs)
- Princeton NLP Multi-Agent Study
- Google A2A Protocol (a2a-protocol.org)
- TASKS.md Specification (tasksmd.github.io)
- SOUL.md Community (github.com/aaronjmars/soul.md)
- Mem0 Multi-Agent Memory (mem0.ai)
- Temporal Durable Execution (temporal.io)
- MindStudio Heartbeat Pattern
