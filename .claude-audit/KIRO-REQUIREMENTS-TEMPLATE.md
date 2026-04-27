# Template — KIRO requirements.md

> Sauvegarder en `.kiro/specs/FINDING-XXX/requirements.md`.
> Notation EARS (Easy Approach to Requirements Syntax) : WHEN / WHILE / IF...THEN / WHERE → THE SYSTEM SHALL.

```markdown
# Requirement: <nom court de la correction>

> Lié à : FINDING-XXX
> Pilier : <4.X — Nom>
> Sévérité originale : <P0|P1>

## User Story

As a <persona — ex: tenant Pro user, internal SRE, prospect en démo>,  
I want <capacité fonctionnelle observable>,  
so that <bénéfice business mesurable et lié au pricing/SLA d'AUDIT-INPUTS.md>.

## Contexte (1 paragraphe max)

<Pourquoi cette correction est nécessaire — référence au finding et à l'impact DD/prod. Ne pas répéter le finding intégral, juste l'angle "pourquoi maintenant".>

## Acceptance Criteria (notation EARS)

### Triggers et réponses (WHEN/SHALL)
1. **WHEN** <event/trigger précis>, **THE SYSTEM SHALL** <réponse mesurable avec valeur cible>.
   - Exemple : WHEN un tool retourne une erreur 5xx, THE SYSTEM SHALL retry jusqu'à 3 fois avec exponential backoff (base 1s, max 30s, jitter 20%).

### Comportements continus (WHILE/SHALL)
2. **WHILE** <state ou phase>, **THE SYSTEM SHALL** <comportement continu>.
   - Exemple : WHILE un agent run est actif, THE SYSTEM SHALL émettre un trace span toutes les 5s avec progress %.

### Conditions d'erreur (IF/THEN/SHALL)
3. **IF** <condition d'erreur ou edge case>, **THEN THE SYSTEM SHALL** <fallback déterministe>.
   - Exemple : IF Anthropic API retourne 429 pendant 30s, THEN THE SYSTEM SHALL basculer sur Bedrock claude-sonnet-4-7 et logger l'événement comme `provider_failover`.

### Conditions contextuelles (WHERE/SHALL)
4. **WHERE** <feature flag, tenant tier, region>, **THE SYSTEM SHALL** <comportement conditionnel>.
   - Exemple : WHERE `tenant.region === "EU"`, THE SYSTEM SHALL router toutes les inférences vers Bedrock eu-west-3 sans exception.

(Au moins 4 acceptance criteria. Maximum ~10 — au-delà, splitter en 2 specs.)

## Non-functional requirements

| Critère                          | Valeur cible                         | Méthode de mesure                     |
|----------------------------------|--------------------------------------|---------------------------------------|
| Latency p95 (sur le flow concerné) |                                    | trace span timing                     |
| Token cost per successful run    |                                      | sum(input × $/M_in + output × $/M_out)|
| Eval score sur golden set        | ≥ X                                  | suite eval `golden/FINDING-XXX/`     |
| Adversarial robustness           | 100% des payloads STRIDE-A bloqués   | suite `adversarial/FINDING-XXX/`     |
| Chaos drill DRILL-N              | PASS                                 | exécution 04-CHAOS-DRILLS.md         |
| Backward compatibility           | OUI / breaking justifié              | regression suite                      |

## Out of scope

<Lister explicitement ce qui ne sera pas adressé par cette spec, pour cadrer.>

## Dependencies

- Sur d'autres FINDING-YYY ?
- Sur des changements infra (ex: provisionner gVisor sandbox) ?
- Sur des contrats externes (ex: signer DPA avec Bedrock) ?

## Acceptance gate

Le finding ne peut être marqué `RESOLVED` que si :
- [ ] Tous les Acceptance Criteria passent
- [ ] Tous les non-functional sont mesurés et conformes
- [ ] Au moins 1 eval golden + 1 eval adversarial ajoutés et passent
- [ ] Aucun régression sur les goldens existants
- [ ] PR review par ≥1 personne autre que l'auteur
- [ ] Déployé en canary ≥48h sans incident
```

## Bonnes pratiques EARS

- WHEN = événement instantané (event-driven).
- WHILE = condition continue (state-based).
- IF/THEN = condition exceptionnelle (error handling).
- WHERE = condition de configuration (feature flag, tier, region).
- SHALL = obligation contractuelle. Pas "should", pas "may".
- Toujours mesurable. "Rapidement" ❌ → "p95 < 500ms" ✅.
- Une seule responsabilité par AC. Si "WHEN X, SHALL Y AND Z", splitter en 2.
