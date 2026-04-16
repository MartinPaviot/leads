# FUSE-GAP-1 · office hours
_Before writing requirements/design. Phase 3 per CLAUDE.md._

## Problem statement (one sentence)

LeadSens ne sait pas trouver l'email corporate d'une personne à partir de son nom + company (ou LinkedIn URL), ce qui casse les Campaigns sortantes et empêche le chat d'enrichir un prospect évoqué en meeting.

## Premise challenge

**Faut-il vraiment construire ça ?** Trois arguments pour le refuser :

1. *"Nos users capturent leurs contacts via inbox/meetings, pas via cold prospecting. Pas besoin d'email finder."* → réfuté : les Campaigns existent déjà (`/engage/sequences`), elles attendent une liste de leads. Si on n'enrichit pas, l'utilisateur importe son CSV Apollo ou quitte. Sans person-level enrichment, on est **dépendant d'un outil externe** pour alimenter nos propres séquences.
2. *"Apollo enrichit déjà."* → Apollo fait de l'**account-level** dans notre implémentation actuelle (`app/apps/web/src/lib/apollo-client.ts`) : domaine → industrie, taille, funding. La feature People Search d'Apollo est *bloquée sur le plan Basic trial* qu'on a actuellement (cf. `_credentials/accounts.json` : "People Search/Match/Org Search blocked on trial"). Pour unlock il faudrait un plan payant Apollo + on est verrouillés sur un seul provider.
3. *"FuseAI a 20+ providers. On ne rattrapera jamais."* → réfuté : 20 providers dans un waterfall = redondance coûteuse. 2-3 providers bien choisis couvrent 90 % des cas à 1/10 du coût.

**Conclusion premise** : feature nécessaire, priorité 1 des gaps. ROI = débloque Campaigns comme produit utilisable autonome.

## Alternatives explorées (≥2)

### A. Single provider (Hunter OU Dropcontact)

- **Pour** : intégration 1 jour, coût prévisible (~€0.03–0.05/email validé).
- **Contre** : taux de match ~65-75 % sur un seul provider. Les 25-35 % ratés forcent l'user à quitter l'app pour chercher ailleurs. Le provider a du downtime, on a zéro fallback.
- **Verdict** : insuffisant. Fuse a 20+ providers et leur argument "100 % accuracy guarantee" est leur wedge marketing. Un seul provider ne peut pas répondre.

### B. Waterfall 2 providers (Dropcontact + Hunter) ⭐ recommandé

- **Pour** : Dropcontact = leader français, RGPD-first, filtrage opt-out natif, latence faible, ~€0.05/contact. Hunter = leader US, large coverage US/UK, ~€0.03/contact. Couverture combinée ≈ 88-92 %. Positionnement **EU-first** distinctif vs Fuse US-first.
- **Contre** : 2 contrats au lieu d'1, un peu plus de complexité. Mais c'est gérable.
- **Verdict** : sweet spot. Bon rapport qualité/coût/differentiation/complexité.

### C. Waterfall 3-4 providers (Dropcontact + Hunter + Findymail + Kaspr)

- **Pour** : couvre 95-97 %, matche le marketing de Fuse.
- **Contre** : 3-4 contrats, plus de dev initial (1 semaine de plus), coût marginal ~50 % plus élevé pour 5-7 points de couverture additionnels. Pour notre ICP (fondateurs, 50-500 enrichments/mois), la différence est faible en absolu (2 emails ratés/jour sur 50).
- **Verdict** : à considérer en v2 si données montrent que le 10 % raté est douloureux. Pas v1.

### D. Construire notre propre crawler/inférence

- **Pour** : aucun coût provider, contrôle total.
- **Contre** : legally grey (LinkedIn ToS, données opt-in obligatoires RGPD), fragile (LI changent leurs protections), et on réinvente une roue qui a 5 ans d'avance chez les spécialistes.
- **Verdict** : non.

### E. Ne rien faire, dépendre d'import CSV

- **Pour** : zero dev.
- **Contre** : nos users doivent payer ailleurs (Apollo seat $49/mo minimum en complément de LeadSens) ou abandonner nos Campaigns. Friction énorme. Perte de fidélité.
- **Verdict** : option dangereuse pour notre rétention.

**Recommandation : B** (Waterfall Dropcontact + Hunter). Plan de migration vers C si data de match rate < 85 % sur 3 mois.

## Layer check (Three layers of knowledge)

- **Layer 1 — tried-and-true** : waterfall enrichment = pattern standard depuis 5+ ans dans la prospection B2B (Clay, RocketReach, Cognism l'utilisent). **Réutiliser**, ne pas réinventer.
- **Layer 2 — new and popular** : Claude/LLM-based inference pour deviner emails à partir de patterns connus (e.g. `firstname.lastname@company.com`). Utile en fallback mais jamais en source primaire (hallucinations).
- **Layer 3 — first principles** : aucun besoin ici.

**Décision** : Layer 1 dominant, Layer 2 en fallback (zéro crédit consommé, latence nulle, pas de risque : on propose le pattern avec confidence "guessed" et l'user valide).

## Completeness target

**Score cible : 9/10** — implémentation complète + cas limites + monitoring.

Qu'est-ce qui mettrait la note à 10 ?
- Provider health dashboard en temps réel (admin-only)
- A/B testing automatique des ordres de waterfall par segment (e.g. .fr domains → Dropcontact first, .com → Hunter first)
- Machine learning pour prédire quel provider a la meilleure chance par profil

→ À 10/10 = overkill pour v1. Target 9 = pragmatique.

## Ce qu'on ne fait PAS dans cette v1

- **Pas d'enrichment phone/téléphone** : scope séparé (coût 5× supérieur, ICP différent). Un spec `FUSE-GAP-2-person-phone-waterfall` viendra si on pivote vers cold-calling.
- **Pas de bulk enrichment > 100 contacts** : v1 = enrichment à la demande + batches ≤ 100. Le bulk 10K-100K est une feature Enterprise distincte.
- **Pas d'email verification** en aval (validation SMTP temps réel) : les providers retournent déjà un `confidence` / `status` (valid/catch-all/invalid). On ne re-valide pas une 2ᵉ fois.

## Risques à surveiller

| Risque | Mitigation |
|---|---|
| Dropcontact ou Hunter cassent leur API | Abstraction `EnrichmentProvider` — on swap un provider sans toucher au reste |
| Dépenses provider explosent si user abuse | Hard cap par tenant/mois (via `usageEvents` billing-schema déjà en place) |
| Un user enrichit des contacts non-opt-in → plainte RGPD | Dropcontact a nativement le filtre opt-out. On ajoute un disclaimer onboarding + un log d'audit par enrichment (qui, quand, quelle personne) |
| Emails retournés sont des catch-all → bounce | Tagging `status: catch-all` exposé dans UI, user décide. Pas de send automatique sur catch-all. |

## Approbation

- Auteur : Martin (à valider)
- Date proposée : 2026-04-15
- Date visée lancement v1 : 2026-05-15 (~1 mois calendaire)

Go/No-Go pour continuer en Phase 4 (requirements.md) : **attendre signal Martin**.
