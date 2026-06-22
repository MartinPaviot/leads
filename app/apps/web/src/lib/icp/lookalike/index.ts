// Lookalike ICP (spec 12, _specs/12-lookalike-icp). Derives a draft ICP from a
// customer sample: deterministic attribute frequencies + evidence, the agent
// only weights causal attributes (never invents), written as a draft via spec-11.
export { deriveLookalike, type DraftIcp, type LookalikeCriterion, type DeriveDeps, type DeriveOutcome, type SampleInput } from "./derive";
export { computeFrequencies, DEFAULT_LOOKALIKE_FIELDS, type AttributeFrequency, type SampleAccount } from "./frequency";
