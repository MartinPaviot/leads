# Tasks — P0-5 (Suppression-list au point d'enrollment)

Estimation totale : **~1,5 jour** (8 taches). Le gros du risque est dans la verification des 6 call-sites, pas dans la logique (pure fn triviale).

## T0. Audit lecture (read-only)

- **Action** : confirmer les 6 sites d'`insert(sequenceEnrollments)` et que `emailOptouts` n'est lu nulle part par valeur de `reason` ailleurs qu'au send.
- **Verify** : `Grep "insert(sequenceEnrollments)"` → exactement enroll/route, autopilot/route, action.ts x2, signal-to-sequence, action-executors. `Grep "emailOptouts.reason"` → 0 lecture par valeur.
- **Test** : N/A.

## T1. Etendre la fonction d'eligibilite (pure)  [coeur]

- **Action** : modifier `app/apps/web/src/lib/sequences/enrollment-eligibility.ts` — ajouter `suppressedReason?` a `ContactEligibilityInput`, `"suppressed"` a `EligibilityReason`, et la regle avant `excluded_company` (Fix 1).
- **Verify** : `pnpm tsc` vert depuis `app/` ; les 8 cas existants de `enrollment-eligibility.test.ts` passent sans modif (retro-compat : champ optionnel).
- **Test** : etendre `app/apps/web/src/__tests__/enrollment-eligibility.test.ts` — ajouter : `suppressed` quand `suppressedReason` non-null ; ordre `deleted > no_email > suppressed > excluded_company` (suppressed prime sur excluded_company mais pas sur deleted/no_email) ; `suppressedReason` absent ⇒ comportement legacy.

## T2. Helper de lookup partage

- **Action** : creer `app/apps/web/src/lib/sequences/suppression.ts` avec `loadSuppressedEmails(tenantId, emails)` et `isEmailSuppressed(tenantId, email)` (lookup `lower()`, tenant-scope, set borne).
- **Verify** : `pnpm tsc` vert ; import depuis un site de test sans cycle d'import (la fn pure reste sans dependance DB).
- **Test** : creer `app/apps/web/src/__tests__/suppression-lookup.test.ts` — db mockee : matche en casse mixte (`JOHN@X.COM` ecrit, `john@x.com` query) ; ne matche pas cross-tenant ; emails null/vides filtres ; retourne set vide si liste vide (pas de requete).

## T3. Cabler `/enroll` route (Fix 2)

- **Action** : dans `app/apps/web/src/app/api/sequences/[id]/enroll/route.ts:101`, resoudre `isEmailSuppressed` et passer `suppressedReason`.
- **Verify** : lancer un enroll local d'un contact dont l'email est insere dans `emailOptouts` → reponse `{enrolled:0, skipped:1}`, 0 ligne `sequenceEnrollments`.
- **Test** : `app/apps/web/src/__tests__/enroll-api.suppression.test.ts` (db mockee, calque `enroll` existant) — contact supprimee-liste ⇒ skipped ; contact propre ⇒ enrolled ; erreur lookup ⇒ 500 (fail-closed, R13).

## T4. Cabler autopilot route + outils chat (Fix 3, 4a, 4b)

- **Action** : `autopilot/route.ts:84-102`, `action.ts:608-635` (`enrollContactsInSequence`), `action.ts:723-741` (`runSequenceAutopilot`) — charger `loadSuppressedEmails` avant la boucle, filtrer.
- **Verify** : POST `/autopilot` local avec 1 candidat complaint parmi 3 → `skipped` inclut le supprime, `toEnroll.length` = 2.
- **Test** : `app/apps/web/src/__tests__/autopilot-api.suppression.test.ts` + etendre les tests d'outils chat existants — 1 sur 3 supprime ⇒ exclu de `toEnroll` ; tenant B non affecte par optout de A.

## T5. Cabler `signalAutoEnroll` (Fix 5)

- **Action** : `app/apps/web/src/inngest/signal-to-sequence.ts:124-128` — `step.run("filter-suppressed")` apres `enrollableContacts`, filtrer le set supprime du tenant.
- **Verify** : invoquer la fn (test unit Inngest) avec 2 contacts dont 1 opt-out → `toEnroll`/payload differe contient 1 contact.
- **Test** : `app/apps/web/src/__tests__/signal-to-sequence.suppression.test.ts` — company eligible, 1 contact supprime ⇒ exclu ; tous supprimes ⇒ `{skipped:true, reason:"No contacts..."}` ou equivalent.

## T6. Cabler l'executor differe (Fix 6)

- **Action** : `app/apps/web/src/lib/agents/action-executors.ts:215-219` — exclure les supprimes de `validIds`.
- **Verify** : executer une action `sequence-enrollment` differee dont le payload contient 1 contact supprime → `enrolled` ne le compte pas, `skipped` l'inclut.
- **Test** : `app/apps/web/src/__tests__/action-executors.suppression.test.ts` — payload 2 contacts, 1 supprime ⇒ 1 enrolled / 1 skipped ; idempotence (re-exec) ⇒ 0 nouvel enroll.

## T7. Fix ecriture webhooks (Fix 7, 8)

- **Action** : `resend/route.ts:185` `reason:"unsubscribe"` → `"complaint"` ; `emailengine/route.ts:169` ajouter `.toLowerCase()`.
- **Verify** : rejouer un payload `email.complained` (test webhook) → ligne `emailOptouts.reason === "complaint"` ; payload emailengine hard-bounce en casse mixte → `emailAddress` minuscule.
- **Test** : etendre `app/apps/web/src/__tests__/webhooks-resend-api.test.ts` (assertion `reason:"complaint"`) et `webhooks-emailengine-api.test.ts` (assertion email lowercase).

## T8. Regression garde-au-send + suite complete

- **Action** : ne rien changer a `send.worker.ts` ; verifier que la garde au send reste verte.
- **Verify** : `pnpm test` depuis `app/apps/web` (Vitest) tout vert ; `pnpm lint` ; `pnpm tsc`.
- **Test** : aucun nouveau ; faire passer `outbound-smtp.sending-gate.test.ts`, `sending-gate.test.ts`, `send-single-email.sending-gate.test.ts` comme regression (AC8).

## Ordre d'execution

- T0 (audit) → T1 (pure fn, debloque tout) → T2 (helper, debloque les call-sites).
- T3, T4, T5, T6 sont independants entre eux une fois T1+T2 faits (paralisables).
- T7 est independant (webhooks) — peut se faire en parallele de T3-T6, mais les tests T4/T5 supposent `lower()` au lookup (T2), pas le fix d'ecriture T7, donc pas de dependance bloquante.
- T8 en dernier (regression globale + lint/tsc).

## Estimation effort

| Tache | Effort |
|---|---|
| T0 audit | 0,5 h |
| T1 pure fn + tests | 1,5 h |
| T2 helper + tests | 1,5 h |
| T3 enroll | 1 h |
| T4 autopilot + 2 outils chat | 2 h |
| T5 signal | 1 h |
| T6 executor | 1 h |
| T7 webhooks | 1 h |
| T8 regression/lint/tsc | 1,5 h |
| **Total** | **~1,5 j** |

Note migrations (MEMORY) : **aucune migration de schema requise** (table existante). Si l'index `lower(email_address)` devient necessaire (open question), passer par `db:push` / `db:migrate:apply` — le runner casse a 0012, ne pas utiliser `db:migrate`.
