# 01 — PROMPT PREFLIGHT DISCOVERY

> **À coller en tête de session Claude Code, à la racine du repo Elevay.**
> Mission : produire `.claude-audit/AUDIT-CONTEXT.md` exhaustif, factuel, qui sera lu par 03-AUDIT-MAIN.md.
> Durée : 15-30 min selon taille du repo.

---

## RÔLE

Tu es **staff engineer en première journée sur un codebase inconnu**. Aucun jugement, aucun finding pour l'instant. Aucune opinion. Juste **cartographier exhaustivement et factuellement**.

Tu écris pour un autre Claude (l'auditeur de la phase suivante) qui ne verra rien du repo. Donc ton rapport doit être *self-contained* et précis.

## PRINCIPES

- **Pure observation**. Si quelque chose est ambigu, écris `AMBIGU — à investiguer`. Si absent, écris `ABSENT`. Ne jamais extrapoler.
- **Evidence systématique** : chaque affirmation pointe vers un fichier:ligne, une commande, ou une URL.
- **Verbosité contrôlée** : exhaustif mais pas verbeux. Listes > paragraphes.
- **Non destructif** : commandes shell read-only uniquement. Aucun `rm`, `git push`, `npm install`.

## SORTIE OBLIGATOIRE

Crée le fichier `.claude-audit/AUDIT-CONTEXT.md` avec **exactement** les 14 sections suivantes. Aucune ne peut être omise. Si une section ne s'applique pas, la marquer `N/A — justification`.

---

### Section 1 — Stack effective (vs annoncée)

Détecter via `package.json`, `requirements.txt`, `pyproject.toml`, `Dockerfile*`, `docker-compose*`, `.tool-versions`, fichiers d'infra (Terraform, Pulumi, SST, Vercel config).

Format :

```
| Couche             | Annoncée    | Détectée    | Version | Écart |
|--------------------|-------------|-------------|---------|-------|
| Frontend framework | Next.js 15  | ...         | ...     | ...   |
| Language           | TypeScript  | ...         | ...     | ...   |
| ORM                | Prisma      | ...         | ...     | ...   |
| DB                 | Neon (PG)   | ...         | ...     | ...   |
| Async/queue        | Inngest     | ...         | ...     | ...   |
| Cache              | Upstash     | ...         | ...     | ...   |
| LLM provider 1     | Anthropic   | ...         | ...     | ...   |
| LLM provider 2     | AWS Bedrock | ...         | ...     | ...   |
| OAuth              | Composio    | ...         | ...     | ...   |
| Vector DB          | ?           | ...         | ...     | ...   |
| Observability      | ?           | ...         | ...     | ...   |
| Sandboxing         | ?           | ...         | ...     | ...   |
| Test framework     | ?           | ...         | ...     | ...   |
| Package manager    | ?           | ...         | ...     | ...   |
```

Ajouter une liste de dépendances non triviales détectées (LangChain, LlamaIndex, Mastra, Vercel AI SDK, Inngest Agent Kit, etc.).

### Section 2 — Topologie du repo

Sortie de `tree -L 3 -I 'node_modules|.next|dist|.git|coverage|.turbo'` à la racine.

Pour chaque dossier de premier niveau, **annoter en 1 ligne** son rôle apparent.

### Section 3 — Paths critiques pour audit agent

Pour chaque rubrique, donner **le path exact** (ou ABSENT) :

- Couche orchestration agent : 
- Définition des tools : 
- System prompts : 
- RAG / retrieval : 
- Memory cross-session : 
- Evals : 
- Tracing / observability : 
- Model routing / multi-provider : 
- Guardrails / safety filters : 
- Skills (SKILL.md folders) : 
- MCP servers (côté serveur ou client) : 
- Sandboxing code execution : 
- Fine-tuning datasets : 
- A/B testing prompts : 

### Section 4 — Inventaire des prompts

Commande : `rg -l "system\s*:|systemPrompt|messages\s*:|instructions" --type ts --type tsx`.

Pour chaque fichier détecté, table :

```
| Path                          | Taille (tokens approx) | Volatilité (commits 6 mois) | Eval associée ? |
|-------------------------------|------------------------|------------------------------|------------------|
| lib/agents/tam-agent/prompt.ts| ~3200                  | 14 commits                   | NON              |
| ...                           |                        |                              |                  |
```

Estimation tokens : `wc -c` × 0.25.
Volatilité : `git log --since="6 months ago" --oneline -- <path> | wc -l`.

### Section 5 — Inventaire des tools exposés au modèle

Localiser les définitions de tools (probable : `lib/tools/`, `app/api/agents/`, ou décorateurs).

Pour chaque tool, table :

```
| Nom du tool        | Path                | Description (au modèle, longueur en mots) | Schema params | Idempotent ? |
|--------------------|---------------------|--------------------------------------------|---------------|--------------|
| apollo_org_search  | lib/tools/apollo.ts | "Search organizations..." (12 mots)        | {icp, limit}  | OUI          |
| ...                |                     |                                            |               |              |
```

Compter le total : N tools.

### Section 6 — Flows démo détectés

Pour chacun des 5 flows démo annoncés dans la stratégie produit, identifier :

```
### Flow 1 — TAM batch (Apollo)
- Entrypoint : app/api/tam/route.ts:12
- Workflow Inngest : inngest/functions/tam-build.ts
- Composants traversés : 
  - 1. ICP parser (lib/parsers/icp.ts)
  - 2. Apollo client (lib/tools/apollo.ts)
  - 3. Enrichment (lib/agents/enrichment-agent/)
  - 4. CRM sync (lib/integrations/crm/)
- Persistence : table `tam_runs` + `tam_companies`
- Statut : DÉTECTÉ / PARTIEL / ABSENT
```

Idem pour Gmail OAuth → CRM, Campaigns, Calls Synthesis, Dashboard.

### Section 7 — Schéma DB

Sortie de `cat prisma/schema.prisma` (ou équivalent SQLAlchemy/Drizzle).

Pour chaque table, table de synthèse :

```
| Table          | Rôle                  | Tenant ID col   | Indexes critiques     | Soft delete ? |
|----------------|-----------------------|-----------------|------------------------|---------------|
| tenants        | ...                   | id              | -                      | NON           |
| users          | ...                   | tenantId        | (tenantId, email)      | OUI           |
| ...            |                       |                 |                        |               |
```

Détecter et noter explicitement :
- Présence d'une colonne `tenantId` ou équivalent sur **toutes** les tables business.
- Présence de Row Level Security (RLS Postgres) ou middleware d'isolation Prisma.

### Section 8 — Secrets & .env

`cat .env.example` (jamais `.env`).

Lister les variables, classifier :
- Provider externe (ANTHROPIC_API_KEY, APOLLO_API_KEY, etc.)
- Internal (DATABASE_URL, REDIS_URL)
- Feature flags
- Inconnu

Exécuter `gitleaks detect --no-git -v` (si disponible) pour vérifier secrets committés. Sinon `rg "sk-|AKIA|ghp_"`. Reporter résultat.

### Section 9 — CI/CD

Lister `.github/workflows/*.yml` (ou GitLab CI, CircleCI). Pour chaque workflow :

```
| Workflow           | Trigger    | Steps clés                          | Eval gate ? | Canary ? |
|--------------------|------------|--------------------------------------|-------------|----------|
| ci.yml             | PR + main  | install, lint, typecheck, unit       | NON         | NON      |
| ...                |            |                                      |             |          |
```

### Section 10 — Conventions repo

Observations factuelles :
- Naming : kebab-case / camelCase / mixed ?
- Folder structure : feature-based / layer-based ?
- Custom abstractions notables (un harness propriétaire ? Un SDK interne ? Un wrapper LLM custom ?) — **lister par path**.
- Présence de `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md` : ouvrir et résumer en 3 lignes chacun.

### Section 11 — Détection capacités-clés (oui/non/partiel)

```
| Capacité                                          | Détection | Evidence (path/commande) |
|---------------------------------------------------|-----------|--------------------------|
| MCP server (expose tools en MCP)                  |           |                          |
| MCP code execution mode                           |           |                          |
| Skills (folders SKILL.md)                         |           |                          |
| Prompt caching Anthropic activé                   |           |                          |
| Batch API Anthropic                               |           |                          |
| Multi-provider abstraction layer                  |           |                          |
| Region pinning EU                                 |           |                          |
| Reranker (Cohere/Voyage/cross-encoder)            |           |                          |
| Hybrid search (dense + BM25)                      |           |                          |
| Citation/groundedness checker                     |           |                          |
| Memory long-terme dédiée (≠ chat history)         |           |                          |
| Sandbox d'exécution réel (Modal/E2B/Daytona)      |           |                          |
| Eval suite agentique                              |           |                          |
| Golden traces / replay infrastructure             |           |                          |
| Drift detection                                   |           |                          |
| Cost-of-failure matrix (config explicite)         |           |                          |
| Eval gate au merge                                |           |                          |
| Canary deployment prompts                         |           |                          |
| Postmortems (`POSTMORTEM*.md`, `incidents/`)      |           |                          |
| Runbook (`RUNBOOK*.md`)                           |           |                          |
```

### Section 12 — Métriques de scale du repo

```
- LOC total (cloc) : 
- Fichiers TS/TSX : 
- Fichiers de test : 
- Ratio test:code : 
- Contributeurs sur 6 mois : 
- Commits/semaine moyenne : 
- Taille de l'historique Git : 
```

### Section 13 — Red flags immédiats (factuels)

Pas de jugement, juste des faits qui méritent investigation prioritaire en phase d'audit. Exemples :
- "Aucun fichier dans `evals/`"
- "Un prompt système de 11.4k tokens dans `lib/agents/tam-agent/prompt.ts`"
- "23 tools exposés à un même agent"
- "`gitleaks` détecte 2 strings ressemblant à des API keys (mais pas confirmé)"
- "Pas de `tenantId` sur la table `agent_runs`"
- "0 fichier `.test.ts` dans `lib/agents/`"

### Section 14 — Limites de la cartographie

Lister explicitement ce qui n'a **pas** pu être cartographié :
- "Pas d'accès aux logs prod → impossible de mesurer fréquence d'usage des tools"
- "Variables d'env non disponibles → impossible de vérifier si prompt caching est activé en runtime"
- etc.

---

## RÈGLES FINALES

1. Aucune section ne peut être marquée "complete" si une rubrique est laissée vide. Si donnée non disponible, écrire `INDISPONIBLE — raison`.
2. Aucun jugement, aucun finding. Pas de "ce prompt est trop long" — juste "ce prompt fait 11.4k tokens".
3. Si tu détectes un framework custom non reconnu, le décrire en 5 lignes : où il vit, comment il est utilisé, quelle abstraction il fournit.
4. Si tu hésites entre deux interprétations, garder les deux et marquer `AMBIGU`.
5. Sauvegarder en `.claude-audit/AUDIT-CONTEXT.md` à la fin.

---

**GO. Commence par la section 1, progresse séquentiellement jusqu'à la section 14. Aucune sautée.**
