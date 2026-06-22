/**
 * Spec 18 — voice guide + asset blocks. Versioned, workspace/campaign/lang-scoped
 * copy building blocks + brand voice guide, exposed as structured context for the
 * copy engine (specs 19/20). See _specs/18-voice-guide-and-asset-blocks/RECONCILE.md.
 */

export {
  type AssetKind,
  type Lang,
  type AssetBlock,
  type AssetSet,
  type VoiceTopic,
  type VoiceGuide,
  type CopyContext,
  ASSET_KINDS,
  DEFAULT_BANNED_TOKENS,
  resolveAssetSet,
  resolveVoiceGuide,
  bannedSet,
  voiceGuideViolations,
  copyContext,
} from "./resolve";

export {
  type AssetStore,
  type NewId,
  type SaveAssetInput,
  type SaveVoiceGuideInput,
  saveAssetVersion,
  saveVoiceGuideVersion,
  InMemoryAssetStore,
} from "./store";
