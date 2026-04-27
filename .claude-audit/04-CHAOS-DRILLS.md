# 04 — CHAOS DRILLS — Protocoles d'injection (OPT-IN, ENV ISOLÉ)

> ⚠️ **Ne jamais exécuter en production.** Uniquement sur staging isolé avec snapshot DB restaurable et services tiers en mode mock ou test account dédié.
> Sortie : `.claude-audit/CHAOS-RESULTS.md` qui s'agrège dans AUDIT-FINDINGS.md (Annexe E).
> Durée : 2-4h selon nombre de drills exécutés.

---

## RÔLE

Tu es **Site Reliability Engineer + Chaos Engineer**. Tu n'audites pas en lisant le code : tu **casses des choses** pour observer comment le système réagit. Pour chaque drill : prérequis, action, observation, métriques, rollback.

## PRÉREQUIS GLOBAUX

Avant de lancer un seul drill, vérifier :

- [ ] Environnement isolé identifié (staging, sandbox, ou local docker-compose).
- [ ] Snapshot DB restaurable disponible (pg_dump frais).
- [ ] Snapshot Redis restaurable.
- [ ] Comptes tiers en mode test (Apollo sandbox, Composio test, Anthropic key dédiée).
- [ ] Aucun email réel ne sortira (SMTP redirigé vers MailHog/Mailtrap, ou DNS blackhole).
- [ ] Tracing/logs activés et capturés (Langfuse, Datadog, ou tail -f basique).
- [ ] Confirmation explicite qu'aucun user prod ne sera impacté.

Si **un seul** des prérequis est KO → STOP et ne pas exécuter.

## FORMAT DE REPORTING

Pour chaque drill, format obligatoire :

```
### DRILL-N — <nom>

**Hypothèse testée** : <ce qu'on cherche à savoir>
**Mode opératoire** : <commande exacte ou modification de mock>
**Comportement attendu (par design)** : <ce que le système devrait faire>
**Comportement observé** : <ce qui s'est passé réellement>
**Métriques capturées** :
  - Time-to-recovery : <ms>
  - Runs perdus : <count>
  - Runs avec output incorrect : <count>
  - Logs / traces / alertes générés : <oui/non>
  - User-facing error : <claire / cryptique / silencieuse>
**Verdict** : PASS / FAIL / DEGRADED
**Finding associé** : FINDING-XXX (à créer dans AUDIT-FINDINGS.md si FAIL ou DEGRADED)
**Rollback effectué** : <oui/non, méthode>
```

---

## DRILL-1 — Apollo retourne 500 pendant 30 secondes

### Hypothèse testée
Le flow TAM gère gracieusement une indisponibilité courte d'Apollo (retry, fallback, dégradation).

### Mode opératoire
Option A (mock-based) : intercepter les appels Apollo via MSW ou un proxy local et forcer 500 pendant 30s.
Option B (network-level) : `iptables -A OUTPUT -d api.apollo.io -j REJECT` pendant 30s, puis flush.
Option C (env var) : injecter `APOLLO_BASE_URL=http://localhost:9999` (port qui ne répond pas).

Lancer un run TAM normal pendant l'incident, et un autre 10s après la fin de l'incident.

### Comportement attendu
- Retry exponential backoff avec jitter, max 3-5 tentatives.
- Après épuisement : erreur structurée propagée à l'utilisateur ("Apollo temporairement indisponible, réessayez dans quelques minutes").
- Pas d'hallucination de résultats Apollo.
- Trace claire dans observabilité.
- Le run post-incident démarre normalement (pas de circuit breaker ouvert résiduel).

### À mesurer
- Time-to-recovery
- Comportement intermédiaire : agent attend / abandonne / hallucine / continue avec données partielles
- User-facing error claire ou cryptique
- Métriques de retry visibles dans observability stack

### Rollback
Restaurer la config réseau / supprimer le mock.

---

## DRILL-2 — Bedrock retourne JSON malformé

### Hypothèse testée
Le parsing des outputs LLM est défensif. Une réponse malformée n'entraîne pas un crash propagé à l'utilisateur ni une corruption de DB.

### Mode opératoire
Option A : mock de l'AWS Bedrock SDK pour qu'un call sur 5 retourne un JSON invalide (`{"foo": ` tronqué) ou un texte hors schema (`Sure, here is the answer: ...`).
Option B : injecter via interception le payload corrompu directement dans la couche d'orchestration.

Lancer 20 runs sur le flow le plus critique (probablement Campaigns ou Calls Synthesis).

### Comportement attendu
- Détection du JSON malformé (try/catch, schema validation Zod/Yup).
- Soit : retry avec prompt clarifiant ("ton output précédent n'était pas un JSON valide, recommence").
- Soit : abandon propre avec erreur structurée, pas de DB write partielle.
- Aucun crash propagé.
- Aucune DB write corrompue.

### À mesurer
- Sur 20 runs, combien : succès / retry-success / clean-fail / dirty-fail (DB corrompue ou crash) ?
- Présence de validation de schéma sur outputs LLM.
- Idempotency : un run ré-exécuté donne le même état final ?

### Rollback
Désactiver le mock. Restaurer DB depuis snapshot si dirty-fail.

---

## DRILL-3 — Inngest worker killed mid-run

### Hypothèse testée
Le système reprend un run interrompu depuis le dernier checkpoint (pets vs cattle).

### Mode opératoire
Lancer un flow long (TAM batch sur 500 comptes ou Campaigns sur 50 destinataires).
Au milieu de l'exécution (vers 50% de progression), tuer le worker Inngest :
- `pkill -9 -f inngest` (local)
- ou via Inngest dashboard si instance dédiée
- ou stop du container `docker stop inngest-worker`

Observer le comportement.

### Comportement attendu
- Inngest détecte la perte du worker (heartbeat).
- Reprise automatique sur un autre worker (ou redémarrage).
- Le run reprend à partir du dernier step persistant, pas du début.
- Pas de double-exécution des steps déjà commités (idempotency).
- L'utilisateur voit "en cours" plutôt que "échec".

### À mesurer
- Time-to-resume (latence avant reprise effective).
- Step de reprise : exact dernier checkpoint ou rollback à un step antérieur ?
- Side effects double-exécutés (emails envoyés 2×, CRM updates dupliqués) ?
- Runs perdus vs runs repris.

### Rollback
Redémarrer worker. Restaurer DB si side-effects doublonnés.

---

## DRILL-4 — Redis cache stale de 48h

### Hypothèse testée
Le système distingue cache hit valide / cache hit périmé, et n'utilise pas des données obsolètes pour des décisions critiques.

### Mode opératoire
Option A : modifier les TTL stockés dans Upstash pour les forcer à un état "écrit il y a 48h".
Option B : remplacer Upstash par un Redis local pré-rempli avec des données obsolètes.

Vérifier surtout les caches RAG, les caches de TAM, les caches de signal scoring.

### Comportement attendu
- TTL respectés (24h SEO, 1h SERP selon convention Elevay).
- Si TTL dépassé : refetch upstream automatique, pas de réutilisation silencieuse.
- Pas de mélange de données récentes et stale dans une même réponse agent.

### À mesurer
- Sur N runs : combien utilisent stale data sans le signaler ?
- Présence de logs "cache hit (age: Xh)" pour audit.
- Stratégie : cache-aside, write-through, ou autre ?

### Rollback
Flush Redis, recharger TTL normaux.

---

## DRILL-5 — Tool retourne réponse 5× max context

### Hypothèse testée
Le système tronque ou résume gracieusement une réponse trop longue d'un tool sans crash ni hallucination.

### Mode opératoire
Mock un tool (par ex. `apollo_org_search` ou `crm_contact_list`) pour qu'il retourne 1M+ tokens (paragraphe lorem ipsum répété, ou liste de 50k entités).

Lancer un run qui appelle ce tool.

### Comportement attendu
- Détection de la taille avant injection en contexte.
- Soit : truncation explicite avec marker `[TRUNCATED — N tokens omis]`.
- Soit : résumé via un appel LLM secondaire avant injection.
- Soit : passage en mode code execution (le LLM filtre via code, cf. MCP Code Mode).
- Pas de propagation brute du payload géant.

### À mesurer
- Comportement effectif : truncation / résumé / code-mode / crash / context overflow.
- Tokens effectivement injectés vs tokens initiaux.
- Qualité du résultat final (l'agent peut-il quand même répondre correctement ?).
- Présence de la stratégie dans le code (`if response.length > X then ...`).

### Rollback
Désactiver le mock.

---

## DRILL-6 — Anthropic API down 5 minutes

### Hypothèse testée
Le système a une stratégie de fallback en cas d'outage du fournisseur LLM principal (cf. post-mortem Cursor mars 2026).

### Mode opératoire
Option A : injecter `ANTHROPIC_BASE_URL=http://localhost:9999` (port mort) pendant 5 min.
Option B : intercepter au niveau réseau (iptables ou proxy).
Option C : modifier la clé API pour qu'elle soit invalide → 401.

Lancer 10 runs distribués sur les 5 flows démo pendant l'incident.

### Comportement attendu (idéal)
- Détection rapide de l'outage (timeout court, ≤ 30s).
- Fallback automatique vers : Anthropic via Bedrock (autre endpoint), ou autre provider configuré.
- Dégradation gracieuse : flows critiques continuent (peut-être avec qualité réduite), flows non critiques mis en queue.
- Communication user : "performance dégradée temporairement", pas "erreur 500".

### Comportement attendu (minimum acceptable)
- Erreur structurée propagée à l'utilisateur sans crash applicatif.
- Logs/alertes générés pour ops.
- Aucun run perdu silencieusement (tous ont un état "en attente" ou "échec retry").
- Quand le provider revient : reprise automatique.

### À mesurer
- Time-to-detect outage.
- Présence d'un fallback réel (pas juste théorique).
- Time-to-failover (si fallback existant).
- Sur 10 runs : combien succès / dégradés / échec / perdus.
- Communication user.
- Reprise post-incident automatique ou manuelle ?

### Rollback
Restaurer config Anthropic normale.

---

## SYNTHÈSE GLOBALE

À la fin des 6 drills, produire dans `.claude-audit/CHAOS-RESULTS.md` :

```
## Synthèse chaos drills

| Drill | Verdict   | Finding ID | Sévérité |
|-------|-----------|------------|----------|
| 1     | PASS/FAIL | FINDING-XXX| P0/P1/P2 |
| 2     | ...       |            |          |
| ...   |           |            |          |

## Patterns transverses observés
- <ex: "aucun retry visible dans 4/6 drills">
- <ex: "observability silencieuse sur tous les drills sauf le 1">

## Recommandations transverses
- <ex: "introduire un wrapper LLM-call avec retry+fallback comme primitive transverse">
- <ex: "instrumenter les checkpoints Inngest pour reprise déterministe">
```

Cette synthèse s'agrège en Annexe E de AUDIT-FINDINGS.md.

---

## RÈGLES FINALES

1. Si un drill ne peut pas être exécuté (prérequis KO), le marquer `NOT EXECUTED — raison` et créer un finding `P1-AUDIT-GAP` correspondant.
2. Aucun drill ne doit générer de side-effect en prod (emails, CRM writes, paiements). Vérifier 3× avant chaque drill.
3. Restaurer l'environnement entre chaque drill (snapshot DB / Redis flush / config réseau).
4. Si un drill révèle une faille de sécurité critique (ex: cross-tenant leakage actif via DRILL-2), STOP les drills, créer un finding **P0 critique**, et notifier Martin avant de continuer.

---

**GO. Vérifier tous les prérequis, puis exécuter DRILL-1 → DRILL-6 séquentiellement.**
