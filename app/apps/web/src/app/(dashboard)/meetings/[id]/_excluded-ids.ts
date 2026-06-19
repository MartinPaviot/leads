/**
 * CLE-14 — meeting-detail action IDs we INTENTIONALLY do NOT register: the agent
 * cannot grant mic permission, capture audio, or pick a file off the user's disk
 * (README §2 — "l'agent prépare et navigue, l'humain exécute"). A boundary test
 * asserts the registered id set is disjoint from this.
 *
 * Kept in this `_`-prefixed (router-ignored) module, not page.tsx: a Next.js
 * page.tsx may only export the default component + route config, so a named export
 * there fails `next build`'s page-type check.
 */
export const MEETINGS_EXCLUDED_IDS = [
  "meetings.record", "meetings.startRecording", "meetings.stopRecording",
  "meetings.uploadTranscript", "meetings.submitTranscript",
] as const;
