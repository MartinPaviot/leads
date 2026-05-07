import type { WarmupSchedule } from "./types";

/**
 * Warmup schedule: gradual daily send increase over 4 weeks.
 * Conservative approach to protect domain reputation.
 */
const WARMUP_SCHEDULE: WarmupSchedule[] = [
  { day: 1, dailyTarget: 2 },
  { day: 2, dailyTarget: 3 },
  { day: 3, dailyTarget: 5 },
  { day: 4, dailyTarget: 7 },
  { day: 5, dailyTarget: 10 },
  { day: 6, dailyTarget: 10 },
  { day: 7, dailyTarget: 10 },
  { day: 8, dailyTarget: 15 },
  { day: 9, dailyTarget: 15 },
  { day: 10, dailyTarget: 20 },
  { day: 11, dailyTarget: 20 },
  { day: 12, dailyTarget: 25 },
  { day: 13, dailyTarget: 25 },
  { day: 14, dailyTarget: 30 },
  { day: 15, dailyTarget: 30 },
  { day: 16, dailyTarget: 35 },
  { day: 17, dailyTarget: 35 },
  { day: 18, dailyTarget: 40 },
  { day: 19, dailyTarget: 40 },
  { day: 20, dailyTarget: 45 },
  { day: 21, dailyTarget: 45 },
  { day: 22, dailyTarget: 50 },
  { day: 23, dailyTarget: 50 },
  { day: 24, dailyTarget: 50 },
  { day: 25, dailyTarget: 50 },
  { day: 26, dailyTarget: 50 },
  { day: 27, dailyTarget: 50 },
  { day: 28, dailyTarget: 50 },
];

export function getWarmupDailyTarget(warmupStartedAt: Date): number {
  const daysSinceStart = Math.floor((Date.now() - warmupStartedAt.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceStart < 0) return 0;
  if (daysSinceStart >= WARMUP_SCHEDULE.length) return 50; // fully warmed

  return WARMUP_SCHEDULE[daysSinceStart].dailyTarget;
}

export function isWarmupComplete(warmupStartedAt: Date): boolean {
  const daysSinceStart = Math.floor((Date.now() - warmupStartedAt.getTime()) / (1000 * 60 * 60 * 24));
  return daysSinceStart >= WARMUP_SCHEDULE.length;
}

export function getWarmupProgress(warmupStartedAt: Date): { day: number; total: number; percent: number } {
  const day = Math.floor((Date.now() - warmupStartedAt.getTime()) / (1000 * 60 * 60 * 24));
  const total = WARMUP_SCHEDULE.length;
  return { day: Math.min(day, total), total, percent: Math.min(100, Math.round((day / total) * 100)) };
}
