// Run-level identity resolution + dedup (spec 07, _specs/07-identity-resolution-
// and-dedup). The cross-provider collapse on top of spec-00's single-record
// identity: group by identity key, merge by precedence preserving provenance,
// dedup contacts by email/linkedin, flag ambiguous near-matches for review,
// idempotent. Pure engine; the DB re-point is the caller's, the precedence
// resolver is injected.
export { dedupeRun, type DedupDeps } from "./run";
export { groupByIdentity, findReviewCandidates } from "./group";
export { collapseGroup } from "./merge";
export { dedupeContacts } from "./contacts";
export { similarity, levenshtein } from "./similarity";
export type {
  DedupAccount,
  DedupContact,
  FieldSource,
  PickWinner,
  MergeReport,
  MergedGroup,
  ReviewGroup,
  ContactGroup,
  DedupOptions,
} from "./types";
