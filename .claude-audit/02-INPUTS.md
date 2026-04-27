# 02 — TEMPLATE INPUTS BUSINESS

> **À remplir par Martin/Ombeline AVANT de lancer 03-AUDIT-MAIN.md.**
> Sans ces inputs, l'audit économique et les tests demo-vs-prod sont théoriques.
> Sauvegarder en : `.claude-audit/AUDIT-INPUTS.md`
> Aucune section ne peut rester vide. Si donnée inconnue, écrire `INCONNU — à mesurer` plutôt qu'inventer.

---

## A. MODÈLE ÉCONOMIQUE

### A.1 Pricing tiers

| Tier        | ARPU mensuel cible (€) | Limite runs/mois | Limite tools | Limite tenants | SLA      |
|-------------|------------------------|------------------|--------------|----------------|----------|
| Free trial  |                        |                  |              | —              | —        |
| Starter     |                        |                  |              | 1              |          |
| Pro         |                        |                  |              | 1              |          |
| Enterprise  |                        |                  |              | N              |          |

### A.2 Volumes cibles

| Horizon        | Tenants total | DAU | Runs/user/jour (moyenne) |
|----------------|---------------|-----|---------------------------|
| 3 mois         |               |     |                           |
| 6 mois         |               |     |                           |
| 12 mois        |               |     |                           |
| 24 mois (a16z) |               |     |                           |

Distribution prévue par flow démo (% du volume total) :
- TAM : %
- Gmail OAuth : %
- Campaigns : %
- Calls Synthesis : %
- Dashboard : %
- Autres / non démo : %

### A.3 Marge brute IA-only cible

- Marge unitaire cible (% sur ARPU mensuel) : 
- Floor minimal acceptable (en dessous = unsustainable) : 
- Modèle de coût utilisé pour projection : 

### A.4 Hypothèses de coût LLM

- Modèle dominant prévu (Sonnet / Opus / Haiku ratios) : 
- Tokens moyens par run par flow (si mesuré) :
  - TAM : in __ / out __
  - Gmail : in __ / out __
  - Campaigns : in __ / out __
  - Calls : in __ / out __
  - Dashboard : in __ / out __
- Prompt caching activé ? OUI/NON
- Batch API utilisée pour async ? OUI/NON

---

## B. CLAIMS INVENTORY

### B.1 Capacités revendiquées (pitch deck / landing / sales decks)

Lister exhaustivement, format CLAIM-XXX. Source à indiquer (deck slide N, landing section, etc.).

```
- CLAIM-001 : "RAG agentique sur l'ensemble des données CRM client" (source: deck slide 7)
- CLAIM-002 : "..."
- CLAIM-003 : "..."
- ...
```

Minimum 15 claims attendus pour un pitch série A.

### B.2 Démos prévues en sessions techniques a16z

Lister exactement les flows qui seront démontrés :

```
1. <flow>, durée approx, environnement (prod / staging scripté)
2. ...
```

### B.3 Failure modes connus en démo

Sur les démos déjà jouées (investisseurs précédents, hackathons, prospects), qu'est-ce qui a déjà cassé ou risque de casser ?

```
- Risque connu 1 : ...
- Risque connu 2 : Gmail OAuth en conditions réelles
- Risque connu 3 : 500 error sur website analysis
- Risque connu 4 : TAM batch ne doit pas être présenté comme "real-time"
- Risque connu 5 : calendar sync pour calls flow
- ...
```

---

## C. FLOWS DÉMO — SPÉCIFICATION GROUND TRUTH

Pour **chaque** flow, remplir le template :

### C.1 Flow TAM

- Input typique : 
- Output attendu : 
- Latence acceptable (p95) : 
- Token budget par run : 
- Critères de succès observables : 
- Métriques de qualité (recall, precision, etc.) : 
- Edge cases qu'un user réel essaiera : 
  - 1. ICP qui produit 0 résultat
  - 2. ICP qui produit 100k+ résultats
  - 3. ICP malformé / contradictoire
  - 4. Apollo timeout
  - 5. Apollo retourne données incohérentes

### C.2 Flow Gmail OAuth → CRM

[idem template]

### C.3 Flow Campaigns

[idem template]

### C.4 Flow Calls Synthesis → CRM → Follow-up

[idem template]

### C.5 Flow Dashboard

[idem template]

---

## D. COMPLIANCE & CONTRAINTES

### D.1 GDPR (cible EU obligatoire)

- Region pinning EU enforced ? OUI / NON / ASPIRATIONNEL
- DPA signé avec Anthropic ? OUI / NON / EN COURS
- DPA signé avec AWS Bedrock ? OUI / NON / EN COURS
- Sub-processors documentés (Composio, Apollo, Inngest, Upstash, Neon) ? OUI / NON
- DPIA réalisée ? OUI / NON
- Politique de rétention documentée ? OUI / NON
- Procédure de droit à l'oubli implémentée ? OUI / NON

### D.2 SOC 2 / ISO 27001 / autres

- En cours ? Type 1 / Type 2 / N/A : 
- Échéance prévue : 
- Cabinet auditeur : 

### D.3 Politique de rétention données

- Logs applicatifs : 
- Conversations agent : 
- Données client (CRM imports) : 
- PII brutes (emails, noms) : 
- Embeddings dérivés : 
- Backups DB : 

### D.4 Régulations sectorielles

Selon les verticaux ciblés (HR, Sales, Marketing, Ops) :
- Restrictions données HR (lois locales sur le profilage) : 
- Restrictions cold email (CAN-SPAM, GDPR e-Privacy, CASL Canada) : 
- Restrictions enregistrement appels (consentement bilatéral selon État US) : 

---

## E. TOLÉRANCE AUX PANNES

Pour chaque flow :

| Flow       | Latence p95 max | Outage upstream max | Erreur silencieuse acceptable ? | Fallback existant ? |
|------------|-----------------|---------------------|----------------------------------|----------------------|
| TAM        |                 |                     |                                  |                      |
| Gmail      |                 |                     |                                  |                      |
| Campaigns  |                 |                     |                                  |                      |
| Calls      |                 |                     |                                  |                      |
| Dashboard  |                 |                     |                                  |                      |

---

## F. ANTI-PATTERNS / RISQUES CONNUS

Tout ce que tu sais déjà bancal et que tu veux que l'auditeur creuse en priorité :

```
- ...
- ...
- ...
```

(Honnêteté ici = qualité de l'audit. Si tu caches, l'auditeur perd du temps.)

---

## G. DONT-TOUCH ZONES

Code legacy, expérimental, ou sandbox interne qui ne doit **pas** être audité (et ne sera pas en prod) :

```
- /lib/legacy-leadsens/* : ancien code BYOT, désactivé
- /experiments/* : prototypes hackathon
- ...
```

---

## H. CONCURRENTS & BENCHMARK DÉFENSIVITÉ

Pour le test "switch-cost" et la défensivité :

### H.1 Concurrents directs (full-stack agentique GTM)
- Monaco.com
- ...

### H.2 Wrappers Claude équivalents (low-moat)
- ...

### H.3 Stack OSS reproduisable en N jours
Liste de ce qu'un concurrent bien financé pourrait recréer en assemblant Composio + Apollo + Anthropic + Postgres + Inngest :
- Quel sous-ensemble d'Elevay est reproductible en <30 jours ?
- Quel sous-ensemble nécessite >6 mois (le moat) ?

---

## I. CALENDRIER DD A16Z

- Date envoi data room : 
- Date sessions techniques avec partner : 
- Date sessions techniques avec engineering team a16z : 
- Date Q&A list reçue : 
- Date term sheet visée : 
- Date diligence period (post-term-sheet) : 
- Date closing visé : 

---

## J. ASSETS PROPRIÉTAIRES REVENDIQUÉS

Lister ce qui constitue le moat technique annoncé :

- Datasets propriétaires (taille, source, droits) : 
- Signal scoring weights (nature, entraînement, taille) : 
- Taxonomie ICP propriétaire (taille, granularité) : 
- Embeddings fine-tunés (modèle de base, dataset, gain mesuré) : 
- Golden eval set (taille, source des tâches) : 
- Skills propriétaires : 
- Workflows orchestrés non triviaux : 

---

## K. ÉQUIPE & PROCESS

- Nombre d'ingés full-time sur la couche agent : 
- Process de PR review prompts : décrit en 3 lignes
- Eval gate présent à chaque PR ? OUI/NON
- Canary deployment des prompts ? OUI/NON
- On-call rotation ? OUI/NON, qui ?
- Cadence postmortem post-incident : 
- Bus factor sur la couche agent : 

---

**Une fois rempli, sauvegarder en `.claude-audit/AUDIT-INPUTS.md`. Passer à l'étape 2 du runbook.**
