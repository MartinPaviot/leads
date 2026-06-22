// Re-export the shared web unsubscribe-URL builder so the BullMQ send path
// emits the exact same HMAC-signed One-Click URL as the Inngest path — no
// duplicated crypto, one source of truth for the token. The worker tsconfig
// maps `@web/*` -> `../web/src/*` (proven at runtime by db.ts importing
// `@web/db/schema`); vitest.config.ts mirrors that alias for tests.
export { buildUnsubscribeUrl } from "@web/lib/emails/unsubscribe-token";
