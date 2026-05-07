import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getWarmupDailyTarget, isWarmupComplete } from "./warmup";
import type { MailboxSelection } from "./types";

interface SelectionContext {
  tenantId: string;
  recipientDomain?: string;
  preferredMailboxId?: string;
}

export async function selectBestMailbox(context: SelectionContext): Promise<MailboxSelection | null> {
  const mailboxes = await db
    .select()
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.tenantId, context.tenantId),
        // Only active or warming_up mailboxes
      )
    );

  const eligible = mailboxes.filter((m) => {
    if (m.status !== "active" && m.status !== "warming_up") return false;
    if ((m.healthScore || 100) < 50) return false;

    // Check daily capacity
    const capacity = getEffectiveCapacity(m);
    if (m.sentToday >= capacity) return false;

    return true;
  });

  if (eligible.length === 0) return null;

  // Strategy 1: Domain match (same TLD family as recipient)
  if (context.recipientDomain) {
    const domainMatch = eligible.find((m) =>
      m.domain && tldFamilyMatch(m.domain, context.recipientDomain!)
    );
    if (domainMatch) {
      return {
        mailboxId: domainMatch.id,
        domain: domainMatch.domain || "",
        emailAddress: domainMatch.emailAddress,
        reason: "domain_match",
      };
    }
  }

  // Strategy 2: Preferred mailbox (if specified and eligible)
  if (context.preferredMailboxId) {
    const preferred = eligible.find((m) => m.id === context.preferredMailboxId);
    if (preferred) {
      return {
        mailboxId: preferred.id,
        domain: preferred.domain || "",
        emailAddress: preferred.emailAddress,
        reason: "preferred",
      };
    }
  }

  // Strategy 3: Least-used ratio (most capacity remaining)
  const sorted = eligible.sort((a, b) => {
    const aRatio = a.sentToday / getEffectiveCapacity(a);
    const bRatio = b.sentToday / getEffectiveCapacity(b);
    return aRatio - bRatio;
  });

  const best = sorted[0];
  return {
    mailboxId: best.id,
    domain: best.domain || "",
    emailAddress: best.emailAddress,
    reason: "least_used",
  };
}

function getEffectiveCapacity(mailbox: typeof connectedMailboxes.$inferSelect): number {
  if (mailbox.status === "warming_up" && mailbox.warmupStartedAt) {
    return getWarmupDailyTarget(mailbox.warmupStartedAt);
  }

  // Active: use configured daily limit, capped at 50 per mailbox
  return Math.min(mailbox.dailyLimit || 50, 50);
}

function tldFamilyMatch(senderDomain: string, recipientDomain: string): boolean {
  const senderTld = senderDomain.split(".").pop() || "";
  const recipientTld = recipientDomain.split(".").pop() || "";

  // .com → .com, .io → .io, .fr → .fr
  if (senderTld === recipientTld) return true;

  // Treat .com/.io/.co as same family (tech domains)
  const techTlds = new Set(["com", "io", "co", "dev", "app"]);
  if (techTlds.has(senderTld) && techTlds.has(recipientTld)) return true;

  return false;
}

export async function getTenantSendingCapacity(tenantId: string): Promise<{
  totalCapacity: number;
  usedToday: number;
  availableToday: number;
  mailboxCount: number;
  healthyMailboxes: number;
}> {
  const mailboxes = await db
    .select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.tenantId, tenantId));

  const active = mailboxes.filter((m) => m.status === "active" || m.status === "warming_up");
  const healthy = active.filter((m) => (m.healthScore || 100) >= 50);

  let totalCapacity = 0;
  let usedToday = 0;

  for (const m of healthy) {
    totalCapacity += getEffectiveCapacity(m);
    usedToday += m.sentToday;
  }

  return {
    totalCapacity,
    usedToday,
    availableToday: Math.max(0, totalCapacity - usedToday),
    mailboxCount: active.length,
    healthyMailboxes: healthy.length,
  };
}
