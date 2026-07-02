/**
 * Meeting-prep eval scenarios — synthetic prep CONTEXTS (the composeMeetingPrepContext
 * output shape) with DESIGNED grounding: which hard specifics are legitimately present
 * (a faithful prep may restate them) and, for the thin cases, none at all (a faithful
 * prep must write "unknown", not invent a headcount or a tech stack).
 *
 * The hard case is `thin-discovery`: almost no facts, exactly where a helpful model
 * is most tempted to fabricate a plausible company profile. Synthetic only — the repo
 * is PUBLIC, no real prospect content.
 */

export interface MeetingPrepScenario {
  id: string;
  moment: "discovery" | "demo" | "proposal";
  /** The prep context brief (freeform, as composeMeetingPrepContext renders it). */
  context: string;
  /** Hard specifics legitimately present in the context (for fixture soundness). */
  groundedSpecifics: string[];
}

export const MEETING_PREP_SCENARIOS: MeetingPrepScenario[] = [
  {
    id: "rich-discovery",
    moment: "discovery",
    context: `## Meeting
Discovery call with Northwind, Tue 10:00.

## Company: Northwind
Industry: logistics software. Headcount: 140 employees. Funding: Series A, $8M. Known stack: HubSpot, Snowflake.

## Contact
Sarah Chen — VP Operations.

## Recent interaction
Inbound demo request last week: "founder-led sales is stalling as we scale past 100 people."`,
    groundedSpecifics: ["140", "8", "hubspot", "snowflake"],
  },
  {
    id: "thin-discovery",
    moment: "discovery",
    context: `## Meeting
Intro call with Acme, Thu 15:00.

## Company: Acme
No firmographics on file.

## Contact
Jane Doe — VP Ops.

## Recent interaction
None recorded.`,
    groundedSpecifics: [],
  },
  {
    id: "demo-named-pains",
    moment: "demo",
    context: `## Meeting
Product demo with Bricks, Wed 14:00.

## Company: Bricks
Industry: construction SaaS. Headcount: 320. Known stack: Salesforce, Jira.
Named pains from discovery: reps re-key data across 3 tools; no shared pipeline view.

## Contact
Tom Rivera — Head of RevOps.`,
    groundedSpecifics: ["320", "salesforce", "jira"],
  },
  {
    id: "proposal-close",
    moment: "proposal",
    context: `## Meeting
Proposal review with Hightide, Fri 11:00.

## Deal
Stage: proposal. Value: $45,000 ARR. Two open objections: seat pricing, annual term.

## Company: Hightide
Headcount: 210.

## Contact
Mia Bloom — COO (economic buyer).`,
    groundedSpecifics: ["45000", "210"],
  },
  {
    id: "thin-demo",
    moment: "demo",
    context: `## Meeting
Demo with Cirrus, Mon 09:00.

## Company: Cirrus
Nothing enriched yet.

## Contact
Dana Wu — Product Lead.

## Recent interaction
One prior call; no notes captured.`,
    groundedSpecifics: [],
  },
];
