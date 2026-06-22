# P0-5 — Suppression-list au point d'enrollment (hard-bounce / complaint / opt-out)

## Note importante (verite du code au 2026-06-21)

Le grounding propose de « creer une table suppression-list (migration drizzle) » et « ajouter l'ecriture par-adresse au moment du hard-bounce ». **Le code contredit ces deux points : la table ET l'ecriture existent deja.** Ce qui manque est uniquement la **lecture au point d'enrollment**.

Etat reel verifie :

- **La table existe deja** : `emailOptouts` (`app/apps/web/src/db/schema/outbound.ts:352-364`), colonnes `tenantId`, `emailAddress`, `reason` (`unsubscribe | bounce_hard | manual`), `createdAt`, avec `uniqueIndex("optout_tenant_email_idx").on(tenantId, emailAddress)`. **Ne PAS creer de nouvelle table.**
- **L'ecriture sur hard-bounce existe deja**, en 3 endroits :
  - webhook Resend `email.bounced` permanent → insert `reason:"bounce_hard"` (`app/apps/web/src/app/api/webhooks/resend/route.ts:162-166`, **avec** `.toLowerCase()` ligne 164).
  - webhook Resend `email.complained` → insert `reason:"unsubscribe"` (`resend/route.ts:182-186`, avec `.toLowerCase()`). **Bug latent** : un complaint est journalise comme `unsubscribe`, pas comme une raison distincte `complaint`.
  - webhook EmailEngine hard-bounce → insert `reason:"bounce_hard"` (`app/apps/web/src/app/api/webhooks/emailengine/route.ts:165-172`, **sans** `.toLowerCase()` ligne 169). **Incoherence de casse** entre les deux webhooks.
  - reply.worker insere aussi un optout sur unsubscribe (`app/apps/worker/src/workers/reply.worker.ts:60`).
- **La lecture au SEND existe deja** : `send.worker` interroge `emailOptouts` par `(tenantId, toAddress)` avant d'envoyer et passe la ligne en `status:"skipped"` si match (`app/apps/worker/src/workers/send.worker.ts:22-39`). La route SMTP/single-email a la meme garde (`outbound-smtp.sending-gate.test.ts`, `sending-gate.test.ts`). Donc une adresse supprimee n'est jamais *envoyee* aujourd'hui.

**Le gap reel.** L'enrollment ne consulte jamais `emailOptouts`. `checkContactEligibility` (`app/apps/web/src/lib/sequences/enrollment-eligibility.ts:37-46`) verifie `deletedAt`, `email`, `companyExcludedReason` — **pas** la suppression-list (`ContactEligibilityInput:17-21` n'a pas de champ correspondant). Consequences :

1. Un contact hard-bounce/complaint **est re-enrolle** par les 5 consommateurs. Chaque cycle de step cree une ligne `outbound_emails` qui sera mise a `skipped` au send — du bruit, des compteurs fausses, et des enrollments « actifs » qui ne partiront jamais.
2. Le grounding cite « 3 consommateurs » (enroll + signal-to-sequence + autopilot). **Il y en a 5**, et deux d'entre eux n'appellent meme pas la fonction d'eligibilite :
   - `app/apps/web/src/app/api/sequences/[id]/enroll/route.ts:101` ✅ appelle `checkContactEligibility`.
   - `app/apps/web/src/app/api/sequences/[id]/autopilot/route.ts:92` ✅ appelle.
   - `app/apps/web/src/lib/chat/tools/action.ts:627` (outil `enrollContactsInSequence`) ✅ appelle.
   - `app/apps/web/src/lib/chat/tools/action.ts:731` (outil `runSequenceAutopilot`) ✅ appelle.
   - `app/apps/web/src/inngest/signal-to-sequence.ts:97,125` ❌ filtre seulement par `isCompanyEligible` (niveau company) + presence d'email — **jamais** `checkContactEligibility` par contact.
   - `app/apps/web/src/lib/agents/action-executors.ts:215-238` ❌ (executor de l'approbation differee) re-valide tenant + `deletedAt` mais **pas** la suppression. C'est le chemin qui enrolle reellement les actions `sequence-enrollment` differees par autopilot/signal.

## Scope

Ce qu'on construit :
- Etendre `ContactEligibilityInput` + `checkContactEligibility` avec une raison de suppression, evaluee **avant** `excluded_company`.
- Cabler la lecture de `emailOptouts` dans les **5** consommateurs d'enrollment + l'executor differe, en tenant-scope.
- Normaliser la casse a l'ecriture (emailengine + lookups) pour que le `uniqueIndex (tenantId, emailAddress)` et les lookups soient deterministes.
- Distinguer le complaint de l'unsubscribe dans la raison ecrite (fix du `resend/route.ts:185`).

Ce qu'on **ne** reconstruit **pas** :
- La table `emailOptouts` (existe, outbound.ts:352).
- L'ecriture sur hard-bounce/complaint (existe, 3 webhooks).
- La garde au SEND (existe, send.worker:22-39) — on ne la touche pas, elle reste le dernier filet.
- La pause-mailbox > 10% bounce (`rate-limiter.ts:50-53`) — orthogonale, hors scope.

## Exigences (EARS)

- **R1** — WHEN un contact a une ligne `emailOptouts` pour `(tenantId, email)`, THE SYSTEM SHALL le juger ineligible a l'enrollment avec une raison de suppression, et ce **avant** d'evaluer `excluded_company` (`enrollment-eligibility.ts:42`).
- **R2** — THE SYSTEM SHALL etendre `ContactEligibilityInput` (`enrollment-eligibility.ts:17-21`) avec `suppressedReason: "hard_bounce" | "complaint" | "opt_out" | null` et l'evaluer dans `checkContactEligibility` (`:37-46`) juste apres `no_email`.
- **R3** — THE SYSTEM SHALL etendre `EligibilityReason` (`:23-26`) avec `"suppressed"` (raison unique cote enum, le detail hard_bounce/complaint/opt_out etant porte par l'input).
- **R4** — WHEN la route `/api/sequences/[id]/enroll` charge un contact, THE SYSTEM SHALL joindre/charger sa presence dans `emailOptouts` (tenant-scope) et la passer a `checkContactEligibility` (`enroll/route.ts:75-105`).
- **R5** — WHEN la route `/api/sequences/[id]/autopilot` selectionne des candidats, THE SYSTEM SHALL exclure les adresses presentes dans `emailOptouts` du tenant avant d'enroller (`autopilot/route.ts:63-102`).
- **R6** — WHEN l'outil chat `enrollContactsInSequence` charge un contact, THE SYSTEM SHALL passer son `suppressedReason` a `checkContactEligibility` (`action.ts:609-635`).
- **R7** — WHEN l'outil chat `runSequenceAutopilot` selectionne des candidats, THE SYSTEM SHALL exclure les adresses supprimees (`action.ts:703-741`).
- **R8** — WHEN `signalAutoEnroll` a filtre les contacts avec email, THE SYSTEM SHALL exclure ceux presents dans `emailOptouts` du tenant avant l'enroll (`signal-to-sequence.ts:124-128`).
- **R9** — WHEN l'executor `action-executors.ts` traite une action `sequence-enrollment` differee, THE SYSTEM SHALL exclure du set `validIds` tout contact dont l'email est supprime (`action-executors.ts:215-219`), car c'est le seul chemin d'enroll reel pour les approbations autopilot/signal.
- **R10** — THE SYSTEM SHALL effectuer tout lookup `emailOptouts` en comparant `lower(email_address)` cote requete, pour absorber l'incoherence de casse historique (resend lowercase vs emailengine non).
- **R11** — WHEN le webhook EmailEngine insere un optout hard-bounce, THE SYSTEM SHALL ecrire `emailAddress` en minuscules (`emailengine/route.ts:169`), parite avec resend (`resend/route.ts:164`).
- **R12** — WHEN le webhook Resend insere un optout sur `email.complained`, THE SYSTEM SHALL ecrire `reason:"complaint"` (et non `"unsubscribe"`) (`resend/route.ts:185`), pour que l'enrollment puisse mapper la raison correctement.
- **R13** — IF le lookup `emailOptouts` echoue (DB error) pendant un enrollment de masse, THEN THE SYSTEM SHALL faire echouer cet enrollment (fail-closed) plutot que d'enroller a l'aveugle une adresse potentiellement supprimee, et propager l'erreur au handler existant (`enroll/route.ts:144`).
- **R14** — THE SYSTEM SHALL NOT modifier la garde au SEND (`send.worker.ts:22-39`) ni la table `emailOptouts`.
- **R15** — THE SYSTEM SHALL NOT introduire de nouvelle migration de table ; tout enrichissement de raison passe par la colonne `reason` text existante (valeurs `bounce_hard | complaint | unsubscribe | manual`).

## Criteres d'acceptation

- **AC1** — GIVEN un contact dont l'email est dans `emailOptouts` (reason `bounce_hard`) WHEN on appelle `checkContactEligibility({email, deletedAt:null, companyExcludedReason:null, suppressedReason:"hard_bounce"})` THEN le resultat est `{eligible:false, reason:"suppressed"}`.
- **AC2** — GIVEN un contact supprime ET dont la company est excluded WHEN on evalue l'eligibilite THEN la raison rendue est `"suppressed"` (la suppression prime sur `excluded_company`) AND ne prime PAS sur `deleted`/`no_email` (ordre : deleted > no_email > suppressed > excluded_company).
- **AC3** — GIVEN une adresse hard-bouncee WHEN la route `/enroll` recoit son `contactId` THEN `enrolled=0`, `skipped=1`, aucune ligne `sequenceEnrollments` creee (`enroll/route.ts:106-109`).
- **AC4** — GIVEN un tenant avec 3 contacts scores >=50 dont 1 complaint WHEN on POST `/autopilot` THEN seuls 2 contacts sont consideres `toEnroll` (`autopilot/route.ts:84-102`).
- **AC5** — GIVEN un signal sur une company eligible avec 2 contacts dont 1 opt-out WHEN `signalAutoEnroll` s'execute THEN un seul contact figure dans `toEnroll` / le payload differe (`signal-to-sequence.ts:212`).
- **AC6** — GIVEN une action `sequence-enrollment` differee dont le payload contient un contact supprime WHEN l'executor s'execute THEN ce contact n'est pas dans `validIds` et `skipped` l'inclut (`action-executors.ts:219-242`).
- **AC7** — GIVEN un optout ecrit en `JOHN@X.COM` par emailengine (casse mixte historique) WHEN on enrolle `john@x.com` THEN le lookup `lower()` matche et le contact est `suppressed` (R10).
- **AC8** — La garde au SEND reste verte : DEJA IMPLEMENTE dans `app/apps/worker/src/workers/send.worker.ts:22-39` ✅ (test de regression a conserver : `outbound-smtp.sending-gate.test.ts`).
- **AC9** — GIVEN le webhook resend `email.complained` WHEN traite THEN la ligne `emailOptouts` porte `reason:"complaint"` (`webhooks-resend-api.test.ts` mis a jour).
- **AC10** — Tous les tests existants `enrollment-eligibility.test.ts` (8 cas) restent verts apres ajout du champ optionnel (retro-compat : `suppressedReason` absent ⇒ comportement inchange).

## Edge cases

- `email = null` : pas de lookup possible → reste `no_email`, jamais `suppressed` (ordre garanti).
- `suppressedReason` absent/`undefined` dans l'input (appelants pas encore migres) : traite comme `null` → comportement legacy, aucun faux-positif. Champ **optionnel** pour retro-compat.
- Casse mixte historique (emailengine sans `.toLowerCase()`) : lookup en `lower()` des deux cotes (R10) ; le fix d'ecriture (R11) ne reecrit pas les lignes existantes → le `lower()` cote lecture est obligatoire, pas seulement le fix d'ecriture.
- Cross-tenant : la meme adresse supprimee chez le tenant A ne supprime PAS chez B (lookup toujours `eq(tenantId)`). Verifier sur autopilot/signal ou la requete est en masse.
- Concurrence : un hard-bounce arrive *pendant* un enroll de masse → la garde au SEND (send.worker) reste le filet final ; on ne vise pas une transaction atomique enroll+optout (acceptable : pire cas = 1 ligne outbound skipped).
- `onConflictDoNothing` sur l'insert optout (existant) : un meme bounce 2x ne double pas la ligne ; le `uniqueIndex` tient.
- Soft-delete : un contact supprime ET supprimee-liste → `deleted` prime (ordre), pas `suppressed` (coherent avec la hierarchie « le stop le plus dur gagne »).
- `reason` futur inconnu (ex `manual`) : mapper toute ligne `emailOptouts` presente vers `suppressedReason` non-null cote appelant (n'importe quel reason ⇒ supprime) ; ne pas filtrer par reason a la lecture, sinon un `manual` passerait au travers.
- Timeout/erreur DB du lookup en masse (autopilot/signal) : fail-closed sur l'enroll concerne (R13), ne pas avaler l'erreur.
- Idempotence executor : la garde de suppression s'ajoute AVANT le check `existing` enrollment, donc une re-execution ne re-enrolle pas un supprime.

## Hors scope

- Pause-mailbox >10% bounce (`rate-limiter.ts:50-53`) — orthogonal, deja en place.
- UI de gestion manuelle de la suppression-list (ajout/retrait manuel par le founder) — backlog separe.
- Re-ecriture/backfill des lignes `emailOptouts` historiques en casse mixte — couvert par le `lower()` a la lecture, pas de migration de donnees.
- Distinction fine `soft-bounce` (temporaire) → jamais supprimee-liste aujourd'hui (seul le permanent l'est), comportement conserve.
- P0-1 (autopilot anti-ICP + approval gate) — deja traite, on s'appuie dessus.
