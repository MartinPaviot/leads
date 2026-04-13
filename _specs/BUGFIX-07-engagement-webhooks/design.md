# Design — BUGFIX-07

## Composants à créer / vérifier

### A. `/api/track/open` (probablement à créer)
**Fichier :** `apps/web/src/app/api/track/open/route.ts`

```ts
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    // Update openedAt async (don't block response)
    db.update(outboundEmails)
      .set({ openedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(outboundEmails.id, id),
        isNull(outboundEmails.openedAt),  // first open only
      ))
      .catch((e) => logger.warn("track/open update failed", { id, error: e.message }));
    // PostHog (fire-and-forget)
    captureServerEvent("email_opened", { emailId: id });
  }
  return new Response(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
```

### B. `/api/track/click` (probablement à créer)
**Fichier :** `apps/web/src/app/api/track/click/route.ts`

```ts
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const target = url.searchParams.get("url");
  if (!target) return Response.redirect("/", 302);
  let decoded: string;
  try { decoded = decodeURIComponent(target); }
  catch { return Response.redirect("/", 302); }
  // Validate URL is http(s)
  try {
    const parsed = new URL(decoded);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return Response.redirect("/", 302);
  }
  if (id) {
    db.update(outboundEmails)
      .set({ clickedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(outboundEmails.id, id), isNull(outboundEmails.clickedAt)))
      .catch((e) => logger.warn("track/click update failed", { id, error: e.message }));
    captureServerEvent("email_clicked", { emailId: id, target: decoded });
  }
  return Response.redirect(decoded, 302);
}
```

### C. `/api/unsubscribe` (à vérifier / créer)
**Fichier :** `apps/web/src/app/api/unsubscribe/route.ts`

GET (page) + POST (one-click).

```ts
async function processUnsubscribe(email: string, tenantId: string) {
  const cleanEmail = email.trim().toLowerCase();
  // Insert opt-out (idempotent)
  await db.insert(emailOptouts).values({
    tenantId,
    emailAddress: cleanEmail,
    reason: "unsubscribe",
  }).onConflictDoNothing();
  // Pause all active enrollments for this contact across all sequences
  const contacts = await db.select({ id: contacts.id }).from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, cleanEmail)));
  for (const c of contacts) {
    await db.update(sequenceEnrollments)
      .set({ status: "paused" })
      .where(and(
        eq(sequenceEnrollments.contactId, c.id),
        eq(sequenceEnrollments.status, "active"),
      ));
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email") || "";
  const tenant = url.searchParams.get("tenant") || "";
  if (!email || !tenant) return new Response("Missing parameters", { status: 400 });
  await processUnsubscribe(email, tenant);
  return new Response(`<html><body><h1>Unsubscribed</h1>
    <p>You will no longer receive emails from this sender.</p></body></html>`, {
    headers: { "Content-Type": "text/html" },
  });
}

export async function POST(req: Request) { /* same logic, return 200 JSON */ }
```

### D. Signature Resend webhook
Resend utilise Svix. Headers :
- `svix-id`, `svix-timestamp`, `svix-signature`

Implem :
```ts
import { Webhook } from "svix";

const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET || "");

export async function POST(req: Request) {
  const body = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id"),
    "svix-timestamp": req.headers.get("svix-timestamp"),
    "svix-signature": req.headers.get("svix-signature"),
  };
  let payload;
  try {
    payload = wh.verify(body, headers as any);
  } catch (e) {
    logger.warn("Invalid Resend webhook signature");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  // ... rest of existing logic
}
```

## Data flow
1. **Open** : recipient ouvre email → image loadée → `/api/track/open?id=X` → DB update + GIF response
2. **Click** : recipient clique lien rewriten → `/api/track/click?id=X&url=encoded` → DB update + 302 redirect
3. **Unsubscribe** : recipient clique link → `/api/unsubscribe` → opt-out + pause enrollments + page confirm
4. **Resend webhook** : Resend POST `/api/webhooks/resend` → signature verify → switch sur event type → DB updates

## Failure handling
- Tracking pixel update fail → log mais répondre quand même le GIF (sinon image cassée chez le user)
- Unsubscribe DB fail → afficher message d'erreur "Sorry, please contact support"
- Webhook fail → 500 → Resend retry (Svix gère les retries)

## Security
- Signature webhook obligatoire en prod
- Track open/click : ID = UUID outbound email (192 bits) → impossible de deviner
- Unsubscribe : email + tenantId requis, pas de scoping cross-tenant
- Tracking pixel : `Cache-Control: no-store` pour éviter cache CDN qui mangerait les opens

## Open questions
- Vérifier si `app/api/track/open` et `track/click` existent déjà (T0)
- Vérifier si `app/api/unsubscribe` existe (T0)
- Confirmer que Resend utilise Svix (changement récent côté Resend)
