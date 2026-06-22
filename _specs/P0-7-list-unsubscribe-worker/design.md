# Design — P0-7 List-Unsubscribe (One-Click) sur le worker BullMQ

## Composants existants (read-only puis fix cible)

| Fichier | Role | Status |
|---|---|---|
| `app/apps/web/src/lib/emails/unsubscribe-token.ts:11-44` | HMAC token + `buildUnsubscribeUrl` (deterministe, SHA-256/`AUTH_SECRET`) | ✅ correct — **reutilise tel quel** |
| `app/apps/web/src/app/api/unsubscribe/route.ts:139-237` | GET + POST One-Click (RFC-8058), verif token, opt-out, pause enrollments | ✅ correct — **read-only** |
| `app/apps/web/src/inngest/email-send-worker.ts:464-467,788-791` | Reference : comment le header One-Click est emis cote Resend | ✅ correct — **read-only, modele a copier** |
| `app/apps/worker/src/services/emailengine.ts:71-100` | Client EmailEngine `sendEmail` ; ne supporte que In-Reply-To/References | a modifier (Fix 1) |
| `app/apps/worker/src/workers/send.worker.ts:85-92` | Path d'envoi BullMQ ; n'emet aucun header List-Unsubscribe | a modifier (Fix 2) |
| `app/apps/worker/src/db.ts:10` | Preuve que `@web/*` resout au runtime tsx (importe `@web/db/schema`) | ✅ pattern de reference |
| `app/apps/worker/tsconfig.json:11` | Alias `@web/* → ../web/src/*` | ✅ correct |
| `app/apps/worker/vitest.config.ts` | Pas d'alias `@web` → tests qui importent `@web` echoueront | a modifier (Fix 4) |

## Fixes cibles

### Fix 1 — `emailengine.ts` : accepter des headers arbitraires et les merger

Etendre le type du param `email` avec `headers?: Record<string, string>` et merger
APRES le bloc In-Reply-To/References (sans ecraser).

```ts
// app/apps/worker/src/services/emailengine.ts  (signature etendue)
export async function sendEmail(
  accountId: string,
  email: {
    from: { name: string; address: string };
    to: { address: string }[];
    subject: string;
    html: string;
    text?: string;
    inReplyTo?: string;
    references?: string;
    headers?: Record<string, string>;   // ← NOUVEAU
  }
): Promise<{ messageId: string; id: string; response: string }> {
  const body: Record<string, unknown> = {
    from: email.from, to: email.to, subject: email.subject, html: email.html,
  };
  if (email.text) body.text = email.text;

  // Merge: In-Reply-To/References d'abord, puis headers arbitraires.
  const headers: Record<string, string> = {};
  if (email.inReplyTo) {
    headers["In-Reply-To"] = email.inReplyTo;
    headers["References"] = email.references || email.inReplyTo;
  }
  if (email.headers) Object.assign(headers, email.headers);
  if (Object.keys(headers).length > 0) body.headers = headers;

  return eeFetch(`/v1/account/${accountId}/submit`, { method: "POST", body });
}
```

Invariant : si ni `inReplyTo` ni `headers` → `body.headers` absent (AC5, compat).

### Fix 2 — `send.worker.ts` : generer l'unsubUrl + injecter les 2 headers

Avant l'appel `sendEmail` (`:85`), construire `unsubUrl` puis passer `headers`.
On REUTILISE `buildUnsubscribeUrl` via un petit module worker (Fix 3) pour isoler
l'import `@web` et garder `send.worker` testable.

```ts
// app/apps/worker/src/workers/send.worker.ts  (diff conceptuel autour de :80-92)
import { buildUnsubscribeUrl } from "../services/unsubscribe.js"; // Fix 3

// ... dans le try, avant sendEmail :
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.elevay.com";
const unsubUrl = buildUnsubscribeUrl(appUrl, email.tenantId, email.toAddress);

const result = await sendEmail(mailbox.eeAccountId, {
  from: { name: mailbox.displayName || "", address: mailbox.emailAddress },
  to: [{ address: email.toAddress }],
  subject: email.subject,
  html: htmlWithFooter,                 // footer mailto conserve (R10)
  text: email.bodyText || undefined,
  inReplyTo: email.inReplyTo || undefined,
  headers: {                            // ← NOUVEAU (R1,R2)
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
});
```

### Fix 3 — `src/services/unsubscribe.ts` (worker) : re-export du builder web

Un seul point d'import `@web` cote worker → si tsx/vitest doit etre configure,
c'est localise ici, et `send.worker.ts` importe un chemin relatif testable.

```ts
// app/apps/worker/src/services/unsubscribe.ts  (NOUVEAU)
// Reutilise le builder web partage — pas de duplication HMAC (R11).
// tsx honore le paths tsconfig (@web/* -> ../web/src/*), idem db.ts:10.
export { buildUnsubscribeUrl } from "@web/lib/emails/unsubscribe-token";
```

### Fix 4 — `vitest.config.ts` (worker) : alias `@web` pour les tests

Sans ca, tout test important `@web/...` casse a la resolution.

```ts
// app/apps/worker/vitest.config.ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: { "@web": fileURLToPath(new URL("../web/src", import.meta.url)) },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"], globals: true },
});
```

## Data model

Aucun changement de schema. `outboundEmails.tenantId`
(`web/src/db/schema/outbound.ts:290`) et `outboundEmails.toAddress` (`:297`) sont
deja charges par `send.worker.ts:27-28`. `emailOptouts` (insertion One-Click) gere
par la route web. Aucune migration drizzle.

## Flux

1. Job `outbound:send` → `send.worker.ts` charge `email` (`:16-19`), gate
   status `queued` (`:20`).
2. Gate opt-out (`:22-39`) : si opt-out, status `skipped`, **return** — le header
   n'est jamais emis pour un opt-out.
3. Resolution mailbox + gates rate-limit/window (`:41-72`).
4. Status `sending` (`:75-78`), footer mailto (`:80-83`, conserve).
5. **NOUVEAU** : `appUrl` (env, R4) → `unsubUrl = buildUnsubscribeUrl(appUrl,
   email.tenantId, email.toAddress)` (R3, Fix 3).
6. `sendEmail(...)` avec `headers` One-Click (Fix 2) → `emailengine.sendEmail`
   merge les headers (Fix 1) → POST `/v1/account/{id}/submit`.
7. Status `sent` + compteurs + pipeline event (`:94-141`, inchange).
8. Cote destinataire : Gmail affiche le bouton "Se desabonner" → POST One-Click
   vers `/api/unsubscribe` (route.ts:155) → token verifie (`:199`) → opt-out
   `onConflictDoNothing` (`:226`) → futurs jobs skip au step 2.

## Failure handling / Security

- **Fail-closed sur la conformite (R8)** : `buildUnsubscribeUrl` →
  `generateUnsubscribeToken` throw si `AUTH_SECRET` absent
  (`unsubscribe-token.ts:13`). L'appel est dans le `try` (`send.worker.ts:74`) →
  l'email passe en `failed` (`:145-153`) plutot que d'etre envoye sans header
  conforme. Motivation : un mail non-conforme One-Click brule la reputation ;
  mieux vaut un `failed` retryable qu'un envoi qui degrade le domaine.
- **Tenant-scoping** : le token encode `tenantId:email` (`:15`) ; la route
  re-verifie le tenant (`route.ts:99-103`/`:207-211`) et scope l'opt-out par
  `tenantId` (`:117`). Un token d'un tenant ne desabonne pas chez un autre
  (teste : unsubscribe-token.test.ts:65-68).
- **Idempotence** : token deterministe (meme `(tenant,email)` → meme token) ;
  POST rejoue → opt-out `onConflictDoNothing`. Aucun nonce, replay benin
  (documente `:6-9`).
- **Coherence du secret** : `AUTH_SECRET` worker = `AUTH_SECRET` web (meme `.env`
  prod) sinon 403 a la verif. Verif env explicite en T6.
- **Pas d'injection d'en-tete** : `unsubUrl` est une URL signee, `email` encode
  (`:43`) ; aucune valeur utilisateur brute dans un nom/valeur de header.

## Open questions

- **tsx + vitest resolvent-ils `@web/lib/...`** au-dela de `@web/db/schema` ?
  db.ts:10 prouve le runtime ; le test cross-runtime (T5) + l'alias vitest (Fix 4)
  doivent confirmer. Si tsx echouait en prod, fallback = dupliquer un module
  token minimal cote worker (rejete par defaut, R11) — a n'activer que si T0
  montre que `@web` ne resout pas au runtime.
- **`AUTH_SECRET` est-il bien injecte dans le process worker** (Railway/Fly/host
  du worker) ? A confirmer cote infra (T6) — sinon R8 fera echouer tous les
  envois.
- **`workers.test.ts` pre-casse** (mock ioredis vitest 4) : on ne le repare pas
  dans P0-7, mais le nouvel alias `@web` (Fix 4) ne doit pas l'aggraver — verifier
  qu'il reste au meme etat (rouge pour cause ioredis, pas pour cause `@web`).
