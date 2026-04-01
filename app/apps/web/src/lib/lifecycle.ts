export const LIFECYCLE_STAGES = [
  "New",
  "Prospecting",
  "Opportunity",
  "Customer",
  "Disqualified",
  "Inbound",
  "Nurture",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_COLORS: Record<LifecycleStage, string> = {
  New: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  Prospecting: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Opportunity: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Customer: "bg-green-500/20 text-green-400 border-green-500/30",
  Disqualified: "bg-red-500/20 text-red-400 border-red-500/30",
  Inbound: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Nurture: "bg-teal-500/20 text-teal-400 border-teal-500/30",
};
