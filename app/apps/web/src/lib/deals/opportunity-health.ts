/**
 * Pure scoring + stage-transition logic for opportunities. Extracted
 * from the route handlers so tests can exercise them without the
 * `@/auth` graph (which drags in next-auth and can't be resolved by
 * vitest's module loader).
 */

export interface HealthInput {
  replies: number;
  meetings: number;
  daysSinceLastTouch: number;
  hasCloseDate: boolean;
  hasValue: boolean;
  hasContact: boolean;
}

export interface HealthScore {
  total: number;
  band: "strong" | "ok" | "at-risk" | "stalled";
  components: {
    engagement: { score: number; rationale: string };
    freshness: { score: number; rationale: string };
    completeness: { score: number; rationale: string };
  };
}

/** Weights: engagement 40 + freshness 40 + completeness 20 = 100. */
export function computeHealthScore(input: HealthInput): HealthScore {
  let engagement = 0;
  if (input.replies > 0) engagement += 20;
  if (input.replies >= 3) engagement += 5;
  if (input.meetings > 0) engagement += 10;
  if (input.meetings >= 2) engagement += 5;
  engagement = Math.min(40, engagement);

  let freshness = 40;
  if (!Number.isFinite(input.daysSinceLastTouch)) {
    freshness = 0;
  } else if (input.daysSinceLastTouch > 7) {
    freshness = Math.max(0, 40 - (input.daysSinceLastTouch - 7) * 2);
  }

  let completeness = 0;
  if (input.hasCloseDate) completeness += 8;
  if (input.hasValue) completeness += 7;
  if (input.hasContact) completeness += 5;

  const total = engagement + freshness + completeness;
  const band: HealthScore["band"] =
    total >= 75 ? "strong" : total >= 50 ? "ok" : total >= 25 ? "at-risk" : "stalled";

  return {
    total,
    band,
    components: {
      engagement: {
        score: engagement,
        rationale: `${input.replies} replies / ${input.meetings} meetings in 30d`,
      },
      freshness: {
        score: freshness,
        rationale: Number.isFinite(input.daysSinceLastTouch)
          ? `${input.daysSinceLastTouch}d since last touchpoint`
          : "No activity recorded",
      },
      completeness: {
        score: completeness,
        rationale:
          [
            input.hasCloseDate ? "close date" : null,
            input.hasValue ? "value" : null,
            input.hasContact ? "contact" : null,
          ]
            .filter(Boolean)
            .join(", ") || "missing deal details",
      },
    },
  };
}

export interface NarrativeActivity {
  type: string | null;
  direction: string | null;
  sentiment: string | null;
  occurredAt: Date | null;
}

export function buildNarrative(acts: NarrativeActivity[]): string[] {
  if (acts.length === 0)
    return ["No activity yet. Reach out to kick off the conversation."];
  const bullets: string[] = [];
  const now = Date.now();
  const lastEmail = acts.find(
    (a) => a.type === "email_sent" || a.type === "email_received"
  );
  const lastReply = acts.find((a) => a.type === "email_replied");
  const lastMeeting = acts.find(
    (a) => a.type === "meeting_completed" || a.type === "meeting_scheduled"
  );

  if (lastEmail?.occurredAt) {
    const days = Math.max(
      0,
      Math.round((now - lastEmail.occurredAt.getTime()) / 86400000)
    );
    const dir = lastEmail.direction === "inbound" ? "received" : "sent";
    bullets.push(`Last email ${dir} ${days} day${days === 1 ? "" : "s"} ago.`);
  }
  if (lastReply?.occurredAt) {
    const days = Math.max(
      0,
      Math.round((now - lastReply.occurredAt.getTime()) / 86400000)
    );
    const tone =
      lastReply.sentiment === "positive"
        ? "warm"
        : lastReply.sentiment === "negative"
          ? "cold"
          : "neutral";
    bullets.push(
      `Last reply was ${tone} (${days} day${days === 1 ? "" : "s"} ago).`
    );
  } else if (lastEmail) {
    bullets.push("No reply yet to your outreach.");
  }
  if (lastMeeting?.occurredAt) {
    const days = Math.max(
      0,
      Math.round((now - lastMeeting.occurredAt.getTime()) / 86400000)
    );
    const label = lastMeeting.type === "meeting_scheduled" ? "scheduled" : "completed";
    bullets.push(
      `Meeting ${label} ${days} day${days === 1 ? "" : "s"} ago.`
    );
  }

  const stalled =
    !lastEmail?.occurredAt ||
    (now - lastEmail.occurredAt.getTime()) / 86400000 > 14;
  if (stalled) {
    bullets.push("Stalled: no touchpoint in over 2 weeks — consider a follow-up.");
  }

  return bullets;
}

export interface RecentStageActivity {
  type: string | null;
  direction: string | null;
  occurredAt: Date | null;
  summary: string | null;
}

export interface StageSuggestion {
  next: string;
  reason: string;
  confidence: "low" | "medium" | "high";
}

export function suggestNextStage(
  stage: string,
  recent: RecentStageActivity[]
): StageSuggestion | null {
  const has = (pred: (r: RecentStageActivity) => boolean) => recent.some(pred);
  const count = (pred: (r: RecentStageActivity) => boolean) =>
    recent.filter(pred).length;
  const withinDays = (days: number, r: RecentStageActivity): boolean =>
    r.occurredAt !== null &&
    Date.now() - r.occurredAt.getTime() < days * 86400000;

  switch (stage) {
    case "lead":
      if (has((r) => r.type === "email_replied" && r.direction === "inbound")) {
        return {
          next: "qualification",
          reason: "Contact replied to outreach",
          confidence: "high",
        };
      }
      return null;

    case "qualification":
      if (has((r) => r.type === "meeting_scheduled")) {
        return {
          next: "demo",
          reason: "Discovery / demo meeting is on the calendar",
          confidence: "high",
        };
      }
      return null;

    case "demo":
      if (
        has((r) => r.type === "meeting_completed") &&
        has((r) => r.type === "email_sent" && withinDays(7, r))
      ) {
        return {
          next: "trial",
          reason: "Demo completed + follow-up email sent within 7 days",
          confidence: "medium",
        };
      }
      return null;

    case "trial":
      if (
        has((r) => {
          const s = r.summary?.toLowerCase() ?? "";
          return s.includes("proposal") || s.includes("contract");
        })
      ) {
        return {
          next: "proposal",
          reason: "Proposal or contract mentioned in an activity",
          confidence: "medium",
        };
      }
      return null;

    case "proposal":
      if (
        count((r) => r.type === "email_replied" && r.direction === "inbound") >= 2
      ) {
        return {
          next: "negotiation",
          reason: "Multiple replies after proposal signals negotiation",
          confidence: "medium",
        };
      }
      return null;

    default:
      return null;
  }
}
