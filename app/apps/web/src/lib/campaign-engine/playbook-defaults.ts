import { db } from "@/db";
import { outreachPlaybooks } from "@/db/schema";
import type { StrategyType } from "./types";

const STRATEGY_TYPES: StrategyType[] = [
  "warm_intro",
  "trigger_based",
  "smykm",
  "displacement",
  "value_first",
  "social_first",
  "multi_thread",
  "re_engagement",
  "event_triggered",
  "long_game",
];

export async function seedDefaultPlaybooks(tenantId: string): Promise<void> {
  const rows = STRATEGY_TYPES.map((strategyType) => ({
    tenantId,
    strategyType,
    isActive: true,
  }));

  await db
    .insert(outreachPlaybooks)
    .values(rows)
    .onConflictDoNothing();
}
