# Design — P0-5 (Suppression-list au point d'enrollment)

## Composants existants (read-only puis fix cible)

| Fichier | Role | Status |
|---|---|---|
| `app/apps/web/src/db/schema/outbound.ts:352-364` | Table `emailOptouts` (`tenantId`,`emailAddress`,`reason`,`createdAt`, unique `(tenantId,emailAddress)`) | ✅ existe — read-only, ne pas migrer |
| `app/apps/web/src/lib/sequences/enrollment-eligibility.ts:17-46` | `ContactEligibilityInput` + `checkContactEligibility` (pure fn, source unique d'eligibilite) | a modifier (Fix 1) |
| `app/apps/web/src/app/api/sequences/[id]/enroll/route.ts:75-109` | Enroll manuel, charge contact + appelle `checkContactEligibility` | a modifier (Fix 2) |
| `app/apps/web/src/app/api/sequences/[id]/autopilot/route.ts:63-102` | Autopilot route, selection de candidats scores | a modifier (Fix 3) |
| `app/apps/web/src/lib/chat/tools/action.ts:609-635` | Outil chat `enrollContactsInSequence` | a modifier (Fix 4a) |
| `app/apps/web/src/lib/chat/tools/action.ts:703-741` | Outil chat `runSequenceAutopilot` | a modifier (Fix 4b) |
| `app/apps/web/src/inngest/signal-to-sequence.ts:106-128` | Auto-enroll sur signal, filtre `isCompanyEligible` + email seulement | a modifier (Fix 5) |
| `app/apps/web/src/lib/agents/action-executors.ts:215-238` | Executor des `sequence-enrollment` differees (chemin d'enroll reel autopilot/signal) | a modifier (Fix 6) |
| `app/apps/web/src/app/api/webhooks/resend/route.ts:162-186` | Ecrit optout sur bounce/complaint | a modifier (Fix 7 : reason complaint) |
| `app/apps/web/src/app/api/webhooks/emailengine/route.ts:165-172` | Ecrit optout hard-bounce sans lowercase | a modifier (Fix 8 : lowercase) |
| `app/apps/worker/src/workers/send.worker.ts:22-39` | Garde au SEND (lookup optout → skipped) | ✅ correct — ne pas toucher (filet final) |

## Fixes cibles

### Fix 1 — Etendre la fonction d'eligibilite (pure)

`enrollment-eligibility.ts` — champ optionnel pour retro-compat, evalue apres `no_email`, avant `excluded_company` :

```ts
export type ContactEligibilityInput = {
  email: string | null;
  deletedAt: Date | null;
  companyExcludedReason: string | null;
  // P0-5 : presence dans email_optouts du tenant. null/undefined = non supprime.
  // N'importe quel reason (bounce_hard | complaint | unsubscribe | manual) ⇒ supprime.
  suppressedReason?: "hard_bounce" | "complaint" | "opt_out" | null;
};

export type EligibilityReason =
  | "deleted"
  | "no_email"
  | "suppressed"      // P0-5
  | "excluded_company";

export function checkContactEligibility(
  input: ContactEligibilityInput,
): EligibilityResult {
  if (input.deletedAt) return { eligible: false, reason: "deleted" };
  if (!input.email) return { eligible: false, reason: "no_email" };
  if (input.suppressedReason) return { eligible: false, reason: "suppressed" }; // P0-5
  if (input.companyExcludedReason) {
    return { eligible: false, reason: "excluded_company" };
  }
  return { eligible: true };
}
```

Ordre justifie : `deleted` (stop le plus dur) > `no_email` (rien a verifier sans email) > `suppressed` (deliverability — prime sur l'ICP : on a deja brule cette adresse) > `excluded_company`.

### Helper de lookup (nouveau, partage)

Pour eviter 6 requetes ad hoc divergentes, ajouter dans `enrollment-eligibility.ts` une **signature pure** de mapping et un helper DB cote `lib/sequences/` :

```ts
// lib/sequences/suppression.ts (NOUVEAU)
import { db } from "@/db";
import { emailOptouts } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

/** Sous-ensemble des emails (lower-case) supprimes pour ce tenant. */
export async function loadSuppressedEmails(
  tenantId: string,
  emails: (string | null)[],
): Promise<Set<string>> {
  const lowered = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  if (lowered.length === 0) return new Set();
  const rows = await db
    .select({ email: emailOptouts.emailAddress })
    .from(emailOptouts)
    .where(and(
      eq(emailOptouts.tenantId, tenantId),
      inArray(sql`lower(${emailOptouts.emailAddress})`, lowered),
    ));
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

/** True si cette adresse est dans la suppression-list du tenant. */
export async function isEmailSuppressed(tenantId: string, email: string | null): Promise<boolean> {
  if (!email) return false;
  return (await loadSuppressedEmails(tenantId, [email])).size > 0;
}
```

Note `inArray(sql\`lower(...)\`, ...)` : lookup insensible a la casse (R10), absorbe l'historique emailengine.

### Fix 2 — `/enroll` route

Apres avoir charge `contact` (`enroll/route.ts:75-94`), resoudre la suppression et la passer :

```ts
const suppressed = await isEmailSuppressed(authCtx.tenantId, contact.email);
const eligibility = checkContactEligibility({
  email: contact.email,
  deletedAt: contact.deletedAt,
  companyExcludedReason: contact.companyExcludedReason,
  suppressedReason: suppressed ? "hard_bounce" : null, // reason generique cote enrollment
});
```

(La distinction fine hard_bounce/complaint/opt_out n'affecte que l'audit ; `"hard_bounce"` est un proxy acceptable cote enroll car la fn ne route que sur la presence.)

### Fix 3 / Fix 4b / Fix 5 — chemins de masse (autopilot, runSequenceAutopilot, signal)

Charger l'ensemble supprime **une fois** avant la boucle, filtrer dedans :

```ts
const suppressedSet = await loadSuppressedEmails(
  tenantId,
  candidates.map((c) => c.email),
);
// dans la boucle :
if (contact.email && suppressedSet.has(contact.email.toLowerCase())) {
  skippedCount++;
  continue;
}
```

Pour `signal-to-sequence.ts` (Fix 5), inserer apres le filtre `enrollableContacts` (`:124-128`), dans un `step.run("filter-suppressed", ...)` pour rester idempotent cote Inngest.

### Fix 6 — executor differe

`action-executors.ts:215-219` — restreindre `validIds` en excluant les supprimes :

```ts
const validContacts = await db
  .select({ id: contacts.id, email: contacts.email })
  .from(contacts)
  .where(and(inArray(contacts.id, target.contactIds), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
const suppressedSet = await loadSuppressedEmails(tenantId, validContacts.map((c) => c.email));
const validIds = new Set(
  validContacts.filter((c) => !(c.email && suppressedSet.has(c.email.toLowerCase()))).map((c) => c.id),
);
```

### Fix 7 — resend complaint reason

`resend/route.ts:185` : `reason: "unsubscribe"` → `reason: "complaint"`.

### Fix 8 — emailengine lowercase

`emailengine/route.ts:169` : `emailAddress: outbound.toAddress` → `emailAddress: outbound.toAddress.toLowerCase()`.

## Data model

**Aucun changement de schema.** `emailOptouts` (outbound.ts:352) couvre tout :
- raison portee par la colonne `reason` text existante (ajout de la valeur `"complaint"` cote ecriture, pas de contrainte enum a migrer) ;
- pas de nouvel index requis : le lookup `lower()` n'est pas couvert par `optout_tenant_email_idx` (qui est sur la casse brute). **Open question** : si les volumes l'exigent, ajouter `index("optout_tenant_lower_email_idx").on(tenantId, sql\`lower(email_address)\`)` via `db:push` (le runner casse a 0012, cf MEMORY). Decision par defaut : pas d'index tant que le lookup est sur des sets `inArray` bornes (<=100 emails/enroll).

## Flux (gardes/gates)

1. **Enroll manuel** : auth → capability `sequences:write` → load contact (tenant+deletedAt) → `isEmailSuppressed` → `checkContactEligibility` → check `existing` → insert.
2. **Autopilot route / runSequenceAutopilot** : auth → `sequences:execute` → select candidats scores → `loadSuppressedEmails` (1 requete) → boucle filtre (suppressed+enrolled+eligibility) → `enforceAgentApprovalMode` (defere toujours, CLE-10) → `recordAgentAction`.
3. **signalAutoEnroll** : check deal ouvert → `isCompanyEligible` → find contacts → filtre email → **filtre suppressed (NOUVEAU)** → find sequence → check enrolled → approval gate → defere ou enroll.
4. **Executor differe (le seul write reel pour 2 et 3)** : re-valide tenant+deletedAt → **filtre suppressed (NOUVEAU)** → idempotence `existing` → insert.
5. **SEND (inchange)** : lookup `emailOptouts` → `skipped` si match (filet final, send.worker:22-39).

La suppression est ainsi appliquee a **chaque** porte d'entree d'enroll + au write differe + au send.

## Failure handling / Security

- **Fail-closed** sur le lookup en masse (R13) : si `loadSuppressedEmails`/`isEmailSuppressed` jette, l'erreur remonte au `try/catch` existant des routes (`enroll/route.ts:144`, `autopilot:182`) → 500, pas d'enroll a l'aveugle. Motivation : un enroll rate est recuperable, un envoi a une adresse brulee ne l'est pas.
- **Tenant-scoping** : tout lookup `eq(emailOptouts.tenantId, tenantId)`. Pas de fuite cross-tenant. L'executor differe re-derive le tenant du contexte appelant, pas du payload (deja le cas action-executors.ts).
- **Idempotence** : helper sans effet de bord ; `onConflictDoNothing` cote ecriture (existant) ; filtre suppressed avant `existing` enrollment cote executor.
- **Casse** : lookups `lower()` des deux cotes ; fix d'ecriture (R11) limite la dette future mais le `lower()` lecture est la garantie sur l'historique.

## Open questions

1. Volume `emailOptouts` par tenant : faut-il l'index `lower(email_address)` ? (defaut : non, sets bornes). A confirmer sur la DB dev avant prod.
2. `reason:"complaint"` : un consommateur downstream lit-il `reason` en attendant strictement `unsubscribe` ? Grep `reason` sur `emailOptouts` montre des lectures uniquement sur la *presence* (send.worker), pas sur la valeur → safe. A re-verifier (`deliverability/route.ts` lit `bounceType`, pas `emailOptouts.reason`).
3. La route SMTP/single-email a deja la garde au send (`sending-gate.test.ts`) — confirmer qu'aucun chemin d'enroll alternatif n'existe hors des 6 sites listes (grep `insert(sequenceEnrollments)` : enroll, autopilot, action.ts x2, signal, executor — soit exactement les sites couverts).
