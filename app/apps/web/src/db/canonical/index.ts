// Canonical data model — public surface (spec 00,
// _specs/00-canonical-data-model). The single entry point for reading/writing
// canonical accounts + contacts: identity-resolving upserts, provenance writes,
// precedence recompute, and the tenant-scoping guard.
export {
  upsertAccount,
  upsertContact,
  type UpsertAccountInput,
  type UpsertContactInput,
} from "./upsert";
export {
  writeFieldSource,
  recomputeCanonicalFields,
  type CanonicalEntityType,
  type WriteFieldSourceInput,
} from "./field-source";
export {
  accountIdentityKey,
  contactIdentityKey,
  accountMatchPlan,
  contactMatchPlan,
  bareDomain,
  type AccountIdentityInput,
  type ContactIdentityInput,
} from "./identity";
export {
  computeCanonicalFields,
  projectScalars,
  ACCOUNT_CANONICAL_FIELDS,
  CONTACT_CANONICAL_FIELDS,
  type CanonicalFields,
  type FieldSourceRow,
} from "./canonical-fields";
export {
  pickWinner,
  providerRank,
  PROVIDER_RANK,
  DEFAULT_RANK,
  type SourceRow,
} from "./precedence";
export {
  requireWorkspace,
  workspacePredicate,
  WorkspaceScopeError,
} from "./scoped";
