# FUSE-GAP-1 · requirements

## User story

> "En tant que founder qui prépare une campagne outbound ou qui vient d'avoir une meeting où un nom a été mentionné, je veux obtenir l'email corporate de cette personne en 1 clic (ou via le chat), avec un indicateur de confiance, sans quitter LeadSens ni devoir payer un outil d'enrichment à côté."

## Personas & jobs-to-be-done

1. **Fondateur en sales founder-led** — a 5-10 contacts/semaine à enrichir après meetings ou recommendations. Veut un flow rapide, pas un batch. Critique : latence < 10 s pour 1 contact.
2. **SDR d'une petite équipe** — veut enrichir 20-50 contacts après import LinkedIn ou recherche. Critique : batch + export CSV + résumé de match rate.
3. **Admin** — surveille la consommation de crédits et la qualité providers. Critique : dashboard par provider + alertes.

## GIVEN / WHEN / THEN (acceptance criteria)

### AC1 — Enrichment via fiche contact (single)

**GIVEN** un contact existant avec `firstName`, `lastName`, et soit `company.domain` soit `linkedinUrl`, et l'utilisateur sur sa fiche (`/contacts/:id`)
**WHEN** il clique sur "Find email" (bouton à côté du champ email vide)
**THEN** en ≤ 8 s, le champ email se remplit avec le résultat + un badge `Confidence: high|medium|low` et un tag `Source: dropcontact|hunter|inferred`
**AND** 1 credit par call effectivement facturé (20 crédits par match dans `usageEvents`)
**AND** si aucun provider ne trouve rien, le champ reste vide + une notice "No email found — try again later or add manually"

### AC2 — Enrichment via chat

**GIVEN** l'utilisateur dans le chat avec un message comme "Enrich l'email de Marie Dupont chez Qonto"
**WHEN** il envoie
**THEN** le chat appelle l'outil `enrichPersonEmail(firstName, lastName, companyName, companyDomain?)`, retourne l'email + confidence + source dans le chat, ET met à jour le contact correspondant si un match existe dans le CRM (sinon propose de le créer)
**AND** l'action est loggée dans `agentTraces` avec `toolName: "enrichPersonEmail"`

### AC3 — Batch enrichment (≤ 100)

**GIVEN** l'utilisateur sur une liste de contacts ou sur `/prospects/search` avec un résultat
**WHEN** il sélectionne ≤ 100 contacts et clique "Enrich emails (batch)"
**THEN** un job async est créé (Inngest), progression affichée en temps réel ("Enriching 42/87…"), résultats ajoutés au fur et à mesure
**AND** récap final : X trouvés / Y raté / Z déjà enrichis / coût total en crédits
**AND** bouton "Download CSV" pour exporter le résultat enrichi

### AC4 — Provider waterfall transparent

**GIVEN** la config waterfall [Dropcontact, Hunter] (order per-tenant configurable en Settings)
**WHEN** une recherche démarre
**THEN** Dropcontact est appelé en premier. Si match avec confidence ≥ medium → stop, retour
**AND** si fail ou confidence = low → Hunter est appelé. Si match → stop
**AND** si les deux failent → tentative Layer 2 (LLM pattern inference si `company.domain` présent) avec confidence = "guessed" et `source: inferred`
**AND** si même le fallback échoue → `{ email: null, reason: "no_match" }`

### AC5 — Caching + coûts maîtrisés

**GIVEN** un enrichment déjà effectué il y a < 90 jours pour le même (firstName, lastName, domain)
**WHEN** l'utilisateur reclique "Enrich"
**THEN** le résultat est servi depuis le cache (table `enrichment_cache` TTL 90 jours), 0 credit consommé
**AND** si cache miss et cap mensuel atteint, error message "Monthly enrichment cap reached. Upgrade or wait until [next_billing_date]"

### AC6 — RGPD compliance + audit

**GIVEN** un enrichment effectué
**WHEN** il complète
**THEN** entrée écrite dans `enrichment_audit_log` avec `{tenantId, userId, personFirstName, personLastName, companyDomain, provider, result, costCredits, timestamp}`
**AND** si Dropcontact retourne `optOut: true` sur le contact → on refuse l'enrichment, on affiche "Contact has opted out. Respect their choice."
**AND** admin peut exporter le log d'audit en CSV depuis `/settings/data-privacy`

### AC7 — Provider health monitoring (admin only)

**GIVEN** un admin tenant sur `/settings/enrichment`
**WHEN** il accède au dashboard
**THEN** il voit par provider sur les 30 derniers jours :
- Match rate (matches / total calls)
- Average latency
- Error rate (5xx + timeouts)
- Total credits spent
- Toggle "enable/disable" ce provider

### AC8 — Chat tool discoverable

**GIVEN** un utilisateur qui dit dans le chat "tu peux me trouver des emails ?" ou équivalent
**WHEN** le chat parse l'intent
**THEN** le system prompt expose `enrichPersonEmail` comme tool, et le chat répond "Oui, donne-moi nom prénom + company/domain et je trouve" + (si contact sélectionné) "ou je peux enrichir [Nom] directement, un clic ?"

## Edge cases (à tester)

| # | Cas | Comportement attendu |
|---|---|---|
| E1 | Person n'a pas de company → seulement nom + "Google" | On demande domain ; sinon tentative Hunter search by company name only |
| E2 | Domain est un email gratuit (@gmail.com, @yahoo.fr) | On refuse l'enrichment. Message "Only work emails supported. Contact their company." |
| E3 | Plusieurs matches pour `Jean Dupont` chez `BNP Paribas` | Retourner tous les candidats avec confidence. User choisit. |
| E4 | Provider timeout > 5s sur 1 contact | On passe au next provider sans bloquer. Log `providerTimeout` event. |
| E5 | Provider rate-limited (429) | Backoff exponentiel, retry 2×, puis next provider. Dashboard admin flag. |
| E6 | Même enrichment demandé 2× dans la même seconde (double-click user) | Debounce côté client. Une seule API call. |
| E7 | Contact déjà enrichi hier avec confidence "high" | UI n'affiche pas le bouton "Find email" si email déjà présent. Seulement "Refresh" (force cache bypass, consomme crédits). |
| E8 | Batch de 100 dont 80 % déjà en cache | On paye 20 % d'enrichments en crédits, pas 100. Un user Starter à 30 crédits/mois passe 100 batches gratuits si les contacts sont pré-cachés. |
| E9 | Tenant sur Free trial → quota limit | Soft cap : "Enrichment est payant au-delà de 20 lookups/mois sur Free trial. Tu en as utilisé 18/20. Upgrade ou attend." Hard lock à 20. |
| E10 | Dropcontact répond "consent: pending" (contact en cours d'opt-in) | Treat as no-match pour l'instant. Log. |

## Evaluation steps (Phase 6 hostile QA)

Pour chaque AC, un test Playwright qui :
1. Crée un contact de test avec nom connu (e.g. "Aaron Levie" chez "box.com" — a public email `aaron@box.com`)
2. Exécute le flow de enrichment
3. Vérifie : email retourné correspond à la vérité terrain, confidence ≥ medium, source logged, credits débités

Cas piège pour calibration :
- Un "contact" inventé (nom + company random) → must return `null` avec reason, pas d'hallucination
- Un contact avec multiple emails publics connus (Elon Musk chez Tesla) → must pick the most professional one

## Dependencies

- `_tools/check-email.js` (already N4-fixed) : utile pour tester en dev
- `app/apps/web/src/lib/apollo-client.ts` : pattern à suivre pour les autres providers
- `app/apps/web/src/inngest/sync-functions.ts` : pattern async job
- `app/apps/web/src/db/billing-schema.ts` : `usageEvents` table existante, étendre avec `event_type: 'enrichment_email'`
- Existing chat tool system `app/apps/web/src/lib/chat/tools/*` : ajouter dans `action.ts` ou créer `enrichment.ts`

## Out of scope (explicite)

- Phone enrichment (séparé → FUSE-GAP-2)
- Bulk > 100 (Enterprise feature → FUSE-ENT-1)
- Real-time SMTP verification post-lookup (deferred, cost/benefit faible)
- Multi-email profiling (trouver TOUS les emails d'une personne) — on retourne le principal
- Person-level autres data (title history, tenure, etc.) — couvert par Apollo Person Search dans un spec séparé

## Non-goals (on refuse explicitement)

- Scraper LinkedIn directement (ToS + RGPD)
- Deviner un email avec un LLM sans domain connu (hallucinations)
- Retourner des emails sans confidence score visible à l'user
