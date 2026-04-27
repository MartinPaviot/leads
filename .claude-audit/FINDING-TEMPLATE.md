# Template — FINDING

> Copier-remplir pour chaque finding dans AUDIT-FINDINGS.md.

```
### [P0|P1|P2] FINDING-XXX — <titre court (≤80 caractères)>

**Pilier** : <1 des 18 piliers, format "4.X — Nom">
**Sub-phase de détection** : <Phase 0 | 1 | 2 | 3 | 4 | 5 | 6>
**CLAIM remis en cause** : CLAIM-XXX (depuis AUDIT-INPUTS.md §B.1) — ou "N/A" si finding non lié à un claim externe

**Capacité revendiquée** :
> <citation directe du claim ou de la doc Elevay, en 1-2 phrases>

**Réalité observée** :
<description factuelle de ce que le code/comportement fait, en 2-5 phrases. Pas d'opinion, juste les faits.>

**Evidence** (au moins 2 pointeurs) :
- `<file:line>` — <quote ou observation>
- `<commande exécutée>` → `<résultat observé>`
- `<métrique mesurée>` : <valeur>
- (chaos drill DRILL-N résultat) — <référence>

**Impact DD a16z** :
<pourquoi un partner a16z classera ça en rouge — wrapper risk, scalabilité, sécurité, économie, dissonance pitch/code, etc. 2-4 phrases.>

**Sévérité justifiée** :
- P0 si : bloquant pour la DD (un partner refuserait de signer en l'état)
- P1 si : sera challengé en Q&A et demande une réponse préparée
- P2 si : à fixer post-closing sans urgence
Justification du choix de sévérité ici, en 1 phrase.

**Effort de correction** : S (<2 jours) | M (<2 semaines) | L (<6 semaines) | XL (>6 semaines)

**Risque résiduel si non corrigé** :
<le pire scénario réaliste — soit en DD (humiliation pitch), soit en prod (incident customer)>

**Spec Kiro** : `.kiro/specs/FINDING-XXX/` (présent si P0 ou P1)

**Owner suggéré** : <Martin | Ombeline | nouveau hire | externe>
**Date cible** : <YYYY-MM-DD>
```

## Bonnes pratiques

- Numérotation : FINDING-001 à FINDING-NNN, séquentiel par ordre de découverte.
- Titre : commencer par le composant, suivi de la nature du problème.
  - ✅ "RAG retrieval — Aucun reranker, recall@5 mesuré à 0.34"
  - ❌ "Problème dans le RAG"
- Evidence : si une affirmation n'a pas d'evidence concrète, ne pas l'écrire.
- Sévérité : être strict. Trop de P0 dilue le signal. Si tout est P0, rien n'est P0.
- Réviser : avant de finaliser AUDIT-FINDINGS.md, relire chaque P0 et se demander : *"un partner a16z me poserait-il vraiment ça en Q&A ?"* Si non → P1.
