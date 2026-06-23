// Versioned ICP store + NL-to-ICP (spec 11, _specs/11-icp-model-store-and-nl-to-icp).
export {
  saveIcpVersion,
  getActiveIcp,
  nextVersionNumber,
  InMemoryIcpVersionStore,
  type IcpVersionStore,
  type IcpVersionRecord,
  type IcpCriterionSnapshot,
  type IcpStatus,
} from "./version";
export { DbIcpVersionStore, dbIcpVersionStore } from "./db-store";
export {
  createIcpFromDescription,
  markOperability,
  type NlToIcpDeps,
  type NlToIcpOutcome,
  type DraftIcp,
  type IsOperable,
} from "../nl/nl-to-icp";
