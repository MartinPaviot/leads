// Campaign segmentation + TAM estimate (spec 13, _specs/13-segmentation-and-tam-
// estimate). Three archetypes (volume/micro/signal), a stored definition AST,
// signal admission, and a credit-free TAM count via the merged spec-05 sourcing.
export {
  buildSegment,
  admitsAccount,
  SegmentError,
  type Archetype,
  type Segment,
  type SegmentDefinition,
  type NarrowingDim,
  type BuildParams,
  type AccountSignals,
} from "./build";
export { estimateTam, type TamDeps } from "./tam";
