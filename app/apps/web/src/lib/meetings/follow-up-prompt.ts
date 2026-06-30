/**
 * Post-call follow-up prompt builder. Two registers:
 *  - SALES (default): a follow-up email to a prospect after a sales meeting
 *    (the original prompt, preserved verbatim so external behavior is
 *    unchanged);
 *  - INTERNAL: a recap NOTE for the team after a cofounder / all-internal
 *    meeting — decisions, owners, next steps, no pitch, no vendor tone.
 *
 * The split fixes the gap where every meeting — including an internal sync —
 * got a "follow-up after this sales meeting" draft. Pure + unit-tested.
 */

export interface FollowUpPromptInput {
  internal: boolean;
  /** activity.summary — the meeting title/header. */
  meetingTitle: string;
  date: string;
  /** Recipient/company block; empty for an internal meeting. */
  contactContext: string;
  /** notes.summary. */
  summary: string;
  keyPoints: string[];
  actionItems: Array<{ task: string; owner: string; deadline?: string | null }>;
  nextSteps: string[];
  decisions: string[];
}

function actionItemLines(items: FollowUpPromptInput["actionItems"]): string {
  return (
    items
      .map((a) => `- ${a.task} (owner: ${a.owner})${a.deadline ? ` — by ${a.deadline}` : ""}`)
      .join("\n") || "None"
  );
}

export function buildFollowUpPrompt(input: FollowUpPromptInput): string {
  if (input.internal) {
    return `Write a short INTERNAL recap note to share with the team after this internal meeting. It should read like a teammate's own notes — NOT a sales email. No greeting to a single prospect, no "thanks for your time", no pitch or vendor tone.

MEETING: ${input.meetingTitle}
DATE: ${input.date}

SUMMARY: ${input.summary}

DECISIONS MADE:
${input.decisions.map((d) => `- ${d}`).join("\n") || "None recorded"}

ACTION ITEMS:
${actionItemLines(input.actionItems)}

NEXT STEPS:
${input.nextSteps.map((s) => `- ${s}`).join("\n") || "None specified"}

RULES:
- Lead with the decisions, then who-owns-what (with any deadlines), then open next steps.
- Concise and scannable — a short internal note, not prose.
- No salutation to a single person, no sales or closing language.
- Output ONLY the note body.`;
  }

  return `Write a follow-up email after this sales meeting. The email should feel like it was written by someone who was in the meeting and paid close attention.

MEETING: ${input.meetingTitle}
DATE: ${input.date}
${input.contactContext}

MEETING SUMMARY: ${input.summary}

KEY POINTS DISCUSSED:
${input.keyPoints.map((p) => `- ${p}`).join("\n") || "None recorded"}

ACTION ITEMS:
${actionItemLines(input.actionItems)}

NEXT STEPS:
${input.nextSteps.join("\n- ") || "None specified"}

<example>
MEETING: Product demo with Sarah Chen (CTO, Meridian Labs)
KEY POINTS: Liked the reporting feature, concerned about SSO integration timeline, team of 12 developers
ACTION ITEMS: Send pricing by Friday (us), Share SOC 2 report (us), Internal review with CFO (them)

FOLLOW-UP EMAIL:
Hi Sarah,

Thanks for the deep-dive today — great questions from your team, especially around the reporting workflows.

Two things I'm following up on:
1. Pricing breakdown for 12 seats — I'll have this in your inbox by Friday
2. Our SOC 2 report — sending separately this afternoon

On your end, you mentioned running this by David before moving forward. Happy to jump on a quick call with him if that would help move things along.

Talk soon,
</example>

RULES:
- 3-4 short paragraphs, never more
- Reference 2-3 SPECIFIC discussion points from the meeting (not generic)
- List your action items with clear timelines
- Acknowledge their action items without being pushy
- Tone: professional, warm, like a colleague — not a vendor
- Start with "Hi [first name]," — use actual names
- End with a forward-looking close, never "let me know if you have questions"
- Output ONLY the email body — no subject line, no "Subject:" prefix`;
}
