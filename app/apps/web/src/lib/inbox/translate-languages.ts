/**
 * Translate target languages (INBOX-C08) — the client-safe data for the composer
 * menu, split out of translate.ts. Importing the language list into a client
 * component must NOT drag translate.ts's server-only AI/db stack (traced-ai → db
 * → postgres, which needs Node's fs/perf_hooks) into the browser bundle. This
 * file has zero runtime imports; translate.ts re-exports it for server callers.
 */

/** Target languages offered in the composer menu. */
export const TRANSLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
];
