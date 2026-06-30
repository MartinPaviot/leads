// Schema barrel — re-exports all domain schema files
// Split into domain files under schema/ for maintainability.
// All existing imports from "@/db/schema" or "@/db" continue to work.

export * from "./schema/enums";
export * from "./schema/auth";
export * from "./schema/core";
export * from "./schema/ledger";
export * from "./schema/gates";
export * from "./schema/agent-run";
export * from "./schema/canonical";
export * from "./schema/outbound";
export * from "./schema/copy-assets";
export * from "./schema/intelligence";
export * from "./schema/agent";
export * from "./schema/campaign";
export * from "./schema/coaching";
export * from "./schema/onboarding-and-visitors";
export * from "./schema/ai-observability";
export * from "./schema/cs";
export * from "./schema/voice-of-customer";
export * from "./schema/voice";
export * from "./schema/icp";
export * from "./schema/icp-versions";
export * from "./schema/proposals";
export * from "./schema/tam";
export * from "./schema/segments";
export * from "./schema/account-lists";
export * from "./schema/linkedin";
export * from "./schema/search-monitors";
