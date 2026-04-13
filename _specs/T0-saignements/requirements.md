# T0 — Saignements arrêtés — Requirements

## User story

Comme fondateur utilisant LeadSens, je veux que les 7 bugs P7/P6 identifiés dans le
journal d'exigences ET le flux manquant de password reset soient corrigés, pour
que mes utilisateurs early-adopters ne soient pas bloqués ou trompés par des
bugs critiques.

## Scope (8 items)

| ID | Titre | Effort |
|---|---|---|
| T0.1 | `needsOnboarding` — remove `&& isNew` gate | 30 min + 1h tests |
| T0.2 | Persister `currentStep` onboarding avec reprise | 3h |
| T0.3 | Home challenge label mismatch | 30 min |
| T0.4 | Chat `approveCard` silent catch + `!res.ok` handling | 1-1.5h |
| T0.5 | Accounts bulk cap 20 silent — chunk client-side | 3h |
| T0.6 | Badge "Suggested" trompeur accounts | 30 min |
| T0.7 | Footer Twitter link générique | 15 min |
| T0.8 | Password reset flow complet (P0) | ~12h |

## Acceptance criteria (GIVEN/WHEN/THEN)

### T0.1
- GIVEN tenant avec 150 accounts et `onboardingCompleted=false`, WHEN GET `/api/onboarding/status`, THEN `needsOnboarding=true`.
- GIVEN tenant avec 0 accounts et `onboardingCompleted=true`, WHEN GET, THEN `needsOnboarding=false`.

### T0.2
- GIVEN user à la step "product" du wizard, WHEN user reload, THEN wizard s'ouvre step "product" avec banner "Welcome back".
- GIVEN user à la step "building" (transitoire), WHEN reload, THEN wizard force revert à "icp".

### T0.3
- GIVEN `settings.challenge="Finding leads"`, WHEN home affiche subtitle, THEN "Your top prospects by fit score." (pas fallback date).
- Migration DB pour corriger les rows "Finding the right leads" → "Finding leads".

### T0.4
- GIVEN chat `approveCard` échoue, WHEN request completes, THEN toast d'erreur + status → pending.
- GIVEN chat `approveCard` renvoie 409, WHEN processed, THEN toast "duplicate" + status → error.
- GIVEN 422, THEN toast validation + status → error.

### T0.5
- GIVEN user sélectionne 50 accounts pour enrich, WHEN clique "Enrich", THEN 3 chunks serveur appelés, progress toast "Enriching X/50", succès final.
- Bulk cap côté serveur reste (20/chunk) mais plus silencieux côté client.

### T0.6
- GIVEN contact avec `source="apollo_auto"`, WHEN row rendu, THEN badge "Suggested" affiché.
- GIVEN contact avec `source="db"`, WHEN row rendu, THEN pas de badge.

### T0.7
- GIVEN footer landing, WHEN rendu, THEN aucun lien Twitter générique (ou retiré entièrement).

### T0.8
- GIVEN user sur `/sign-in`, WHEN clique "Forgot password?", THEN redirige `/forgot-password`.
- GIVEN email valide entré, WHEN submit, THEN response 200 (silent success) + email envoyé si user existe.
- GIVEN email inexistant, WHEN submit, THEN response 200 (silent — prevent enumeration).
- GIVEN token valide, WHEN submit nouveau password, THEN password mis à jour + redirect /sign-in + email notif envoyé.
- GIVEN token expiré (>1h), WHEN submit, THEN erreur "Invalid or expired token".
- GIVEN token déjà utilisé, WHEN submit, THEN erreur.
- GIVEN rate limit: 3/h/email + 10/h/IP.

## Edge cases

- Concurrency : 2 reset simultanés → 1 seul token valide (le premier invalidated quand second créé).
- Network failure mid-flow : retry via toast dans UI.
- Invalid input : Zod validation, 400 response.
- Already-completed : token consumed once, 2e call renvoie "invalid".
- Permission denied : password reset n'exige pas auth pendant reset (token auth).
- Rate limit : silent 200 pour enum prevention.

## Evaluation (how to test manually)

1. T0.1 : backdoor SQL `UPDATE tenants SET settings=jsonb_set(settings,'{onboardingCompleted}','false')` sur tenant existant avec accounts → reload `/` → redirige `/onboarding`.
2. T0.2 : ouvrir wizard, naviguer à step "product", fermer modal, reload → wizard ouvert step "product" avec banner.
3. T0.3 : choisir "Finding leads" dans wizard → home affiche "Your top prospects…".
4. T0.4 : DevTools offline → approve une card chat → toast "Failed…" + card reste pending.
5. T0.5 : sélectionner 50 accounts → Enrich all → voir progress toast évoluer 20/50→40/50→50/50.
6. T0.6 : inspecter row contact apollo vs db-only → badge seulement sur apollo.
7. T0.7 : scroll footer landing → aucune icône Twitter.
8. T0.8 : forgot → recevoir email → cliquer lien → définir nouveau pwd ≥10 chars mixte → sign-in avec nouveau pwd OK.
