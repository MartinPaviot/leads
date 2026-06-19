import type { DocStep } from "../types";

/**
 * Phase: Win the deal (steps 13-16). The end-to-end sales process once
 * outbound has earned the meeting: discovery, demo, proposal, closing,
 * with the most common objections handled at every stage. Sources: the
 * outbound framework research (analyses of hundreds of millions of sales
 * calls and emails, the no-decision research on 2.5M conversations,
 * negotiation practice), the scripts library, multi-meeting progression,
 * paid-pilot conversion data, and the verbal-yes-to-signature playbook.
 */
export const closeSteps: DocStep[] = [
  {
    slug: "the-discovery-call",
    step: 13,
    phase: "Win the deal",
    title: "The discovery call",
    description:
      "Diagnose before you sell: the question discipline, quantifying the gap, qualification routing, and the honest decision to advance, nurture or walk.",
    blocks: [
      {
        type: "p",
        text:
          "Everything after the meeting is decided mostly in discovery. Two thirds of lost deals trace back to weak qualification, not weak closing. The job of this call is not to pitch; it is to map the prospect's current state, put a number on the gap, and decide honestly whether this deal deserves to exist. Sell the meeting in Steps 9 and 10; sell nothing in the first half of this one.",
      },
      { type: "h2", text: "Open by removing the pitch posture" },
      {
        type: "p",
        text:
          "Set the frame before the first question: \"My goal is to understand whether what we do actually maps to what you are dealing with. Not to pitch you. If it does not map, I will tell you.\" Calls where the agenda is set upfront outperform by about a third. Then open the origin story: \"walk me back to where this started: what triggered it internally?\" An even stronger variant when you researched them: state what you believe their situation is and ask \"how close is that?\". Prospects who feel understood share about 40 percent more in the same call time.",
      },
      {
        type: "callout",
        title: "The 24-hour prep email",
        text:
          "The day before, send three lines: what you will focus on (their use case, not a product tour), the honest disqualifier (\"we are not the right fit if X, I would rather know upfront\"), and one prep question. It cuts no-shows 15 to 20 percent and measurably raises call quality.",
      },
      { type: "h2", text: "The question discipline" },
      {
        type: "ul",
        items: [
          "**11 to 14 targeted questions is the sweet spot.** Past 20 it becomes an interrogation, and interrogations lose deals. Under 7, you are guessing.",
          "**Map the current state in five layers:** how they do it today (environment), what breaks (problem), **what it costs** (impact, the question that separates won from lost), why it persists (root cause), and how it affects them personally (emotion, the question everyone skips and the one that moves deals).",
          "**Quantify or it did not happen.** \"From what you told me, this costs you roughly [X] a year. Our solution costs [Y]. That is the conversation.\" Sellers who uncover impact in numbers sell about 50 percent more.",
          "**Discovery is a process, not an event.** Spread it across every call: situation and pain in meeting one, deepened impact and the critical event in meeting two, the decision process validated by meeting three.",
          "**Ask about money and rivals early.** Price discussed on the first call correlates with higher win rates (best moment: past the half-hour mark, once the gap exists); competitors discussed early correlate with about half again higher close probability. Late-surfacing either one shrinks deals and win rates.",
        ],
      },
      { type: "h2", text: "Route by what the buyer knows" },
      {
        type: "table",
        headers: ["The buyer", "Your conversation"],
        rows: [
          ["Knows they have the problem", "Gap-led discovery: listen 80 percent, map current state, quantify the gap. The gap sells itself."],
          ["Does not know yet", "Teach first: \"most [role] believe [common view]; across 50 conversations we keep seeing [counter-pattern]\", one undeniable number, the personal implication, and only then discovery."],
          ["Knows but underestimates it", "Reframe the magnitude with their own numbers, then let them internalize it: \"you said this costs X; when you add [hidden cost], it is closer to Z. How does that land?\""],
        ],
      },
      { type: "h2", text: "Leave with three things, in the call" },
      {
        type: "ol",
        items: [
          "**The quantified gap**, in their words and their numbers.",
          "**The map of the decision:** who else is involved, what has to be true, what event drives the timing. A deal without a critical event (a renewal, an audit, a launch, a hire) stalls indefinitely; find it or create the deadline honestly.",
          "**The next meeting in the calendar, accepted, with the missing stakeholder invited.** Deals with a defined next step at every stage close at roughly 2.4x the rate of deals without. \"I will send some times\" is how momentum dies.",
        ],
      },
      { type: "h2", text: "Fewer meetings, the right people, deciders first" },
      {
        type: "ul",
        items: [
          "**Companies shoot themselves in the foot by inflating cycles**: two discovery calls, then a demo, then another demo, usually because the right people were never in the same room and every absence costs an extra meeting. Compress: enough of the right people around the table on fewer meetings beats a longer ritual.",
          "**Talk to deciders first**, then route to operational teams, not the reverse. Climbing up from the team to the budget owner adds weeks and a translation layer; descending from the decider adds an endorsement.",
          "**Respect what a bad meeting costs.** A held meeting consumes about two hours of seller time (preparation, the hour, the follow-up); booking unqualified prospects to feel productive is how calendars fill while pipelines starve. The discipline of this step is what makes Step 14 worth running.",
        ],
      },
      { type: "h2", text: "The qualification decision" },
      {
        type: "table",
        headers: ["Decision", "When", "What you do"],
        rows: [
          ["Advance", "Real problem quantified, decision maker identified, a timeline or critical event exists, and the gap justifies 3 to 5 times your price", "Book the demo in-call with the missing stakeholder invited"],
          ["Nurture", "Real problem, distant timing (6+ months), budget waiting on a cycle, reorg in flight", "One value touch per quarter plus signal monitoring; recycle on the trigger (Step 7)"],
          ["Disqualify", "No identifiable problem, contact with no authority who blocks access, vague pain with no measurable cost, the gap cannot justify the price, or 2+ behavioral red flags", "Say it kindly and leave the door open. A clear no beats a maybe; the keep-it-in-the-pipe reflex is the enemy"],
        ],
      },
      {
        type: "p",
        text:
          "Red flags worth the name: one-way communication (you talk 90 percent), replies that take days without explanation, \"this is exactly what we need\" with zero timeline, skipped meetings, reference requests that never get called.",
      },
      {
        type: "example",
        title: "Example: an Elevay discovery, quantified",
        lines: [
          "Frame set, then: \"walk me back: when did outbound become a topic?\" The founder describes evenings building lists and a cofounder pushing to hire an SDR.",
          "Current state in five layers: a spreadsheet plus a sending tool (environment); lists stale within weeks and follow-ups missed (problem); \"what does a missed warm reply cost you?\" leads to: roughly 10 founder hours a week, plus 2 to 3 interested replies a month that died in the inbox, at their deal size roughly 60K a year of leaked pipeline plus the looming 65K SDR salary (impact); nobody owns the process (root cause); \"honestly, I dread Mondays\" (emotion).",
          "Routing: they know the problem, so the gap leads. Decision map: cofounder must agree, trigger is a Q3 fundraise that needs pipeline proof. Exit: demo Thursday, cofounder invited from the call, invitation accepted live.",
        ],
      },
      { type: "h2", text: "Objections at the discovery stage" },
      {
        type: "table",
        headers: ["They say", "You say"],
        rows: [
          ["We are fine with how we do it today", "\"Most people we talk to are. Out of curiosity, what would have to be true for it to stop being fine: more volume, a hire, a target raise?\""],
          ["Just send me a price", "\"Happy to, and a price without scope would be a guess. Two questions so the number means something: [volume question], [team question]?\""],
          ["We have no budget for this", "\"Understood, and budget usually follows a cost worth removing. Can we spend ten minutes on what the current way costs? If the math is not obvious, I will say so.\""],
          ["I need to involve my cofounder", "\"You should, and rather than you replaying this conversation, let us book 30 minutes with both of you: I would rather they hear it raw and push back live.\""],
          ["How are you different from [alternative]?", "\"Fair question. [Alternative] is built for [its job]; we exist for [your job]. The real question is which problem you are solving: [the two, plainly]. Which one is yours?\""],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: the meeting is captured and the qualification facts (stakeholders, costs, critical event, next step) are extracted into the deal automatically, with provenance, so the map you built in the call exists outside your memory before you reach your desk.",
      },
    ],
  },
  {
    slug: "the-demo",
    step: 14,
    phase: "Win the deal",
    title: "The demo",
    description:
      "No discovery, no demo. Prove the gap closes: their problem, their words, three capabilities maximum, and a specific next step before anyone leaves.",
    blocks: [
      {
        type: "p",
        text:
          "A demo is not a product tour; it is **proof that the gap from Step 13 closes**. The rule is absolute: no discovery, no demo. A demo without a mapped pain is a feature lottery, and feature lotteries lose to \"we will think about it\" every time.",
      },
      { type: "h2", text: "Open on their agenda, not your flow" },
      {
        type: "p",
        text:
          "\"Before I show you anything: based on our last call, you raised three things: [pain 1], [pain 2], [the question you left open]. I will orient everything around those, and at the end I want your honest take, including if it does not solve them. Anything you would add?\" Demos anchored to pre-stated priorities convert to a next step 20 to 30 percent more often. Bonus: opening this way surfaces the new stakeholder's priorities while they are in the room.",
      },
      { type: "h2", text: "The structure: before and after, three things, theirs" },
      {
        type: "ul",
        items: [
          "**Reframe the problem in ten seconds, in their words.** The exact phrases from discovery: \"you said Mondays start with two hours of list cleaning.\"",
          "**Show the transformation, not the map.** Current state to future state, on their case: their market, their numbers, their language wherever the product allows. The aha must be theirs, not generic.",
          "**Three capabilities maximum**, each mapped to a named pain, each in four beats: orient (\"this is X\"), show (\"when you do X, Y happens\"), value (\"which is how [their stated problem] stops happening\"), conversation (\"how does that compare to how you do it today?\").",
          "**Let them drive when possible.** Interactivity is the win signal: the demos that close have more back-and-forth per minute, and in group demos the buyers talking to each other is the best sound there is.",
          "**Hold the last ten minutes for next steps.** Sellers who spend measurably more demo time on next steps close more. The demo that ends exactly at the hour with \"so, thoughts by email?\" just lost its momentum.",
        ],
      },
      { type: "h2", text: "Close the demo with a chosen next step" },
      {
        type: "p",
        text:
          "\"Based on what you saw, what is your reaction?\" Then silence; do not fill it. On a positive read, offer **specific options, never an open end**: a narrow-scope pilot with success criteria, a technical session with their engineer, or a commercial conversation with the decision maker. \"Which makes sense given where you are internally?\" Then the date, in the calendar, on the call. Demo-to-opportunity conversion runs 2 to 3 times higher when the specific next step is agreed before anyone leaves.",
      },
      {
        type: "callout",
        title: "The 24-hour rule",
        text:
          "Recap email within 2 hours (what was validated, in their words, plus the agreed step), and if the next step is a proposal, it lands within 24 hours. Proposals sent inside a day of the demo correlate with about a third faster closes; every silent day after that is deal decay (Step 17).",
      },
      {
        type: "example",
        title: "Example: an Elevay demo, scoped to the gap",
        lines: [
          "Attendees: the founder (champion) and the cofounder (new, skeptical). Opener replays the three pains and asks the cofounder what they would add: \"mostly, I do not want us paying for a toy\" goes on the agenda openly.",
          "Beat 1, the stale-list pain: their actual ICP described live, the TAM building itself on screen, with the scores explained. Beat 2, the lost-replies pain: the daily list and a drafted follow-up with its cited source. Beat 3, the toy concern: the capture pipeline writing the meeting they are in into the record, nothing typed.",
          "Ten minutes kept: \"reaction?\" Silence. The cofounder answers first (good sign). Options offered: 30-day paid pilot with success criteria, or a pricing conversation now. They pick the pilot; the kickoff date goes in the calendar before goodbye, and the recap email is out the same afternoon.",
        ],
      },
      { type: "h2", text: "Objections at the demo stage" },
      {
        type: "table",
        headers: ["They say", "You say"],
        rows: [
          ["Looks great, but it feels like a lot for us", "\"Agreed, and you would not turn it all on. Week one would be exactly two things: [the two mapped to their pains]. The rest stays off until you ask.\""],
          ["We would need [missing feature]", "\"Maybe. Before I promise anything: does [feature] change what the current way costs you, or is it a nice-to-have? If it is load-bearing, I will tell you honestly where it sits on the roadmap.\""],
          ["How do you compare to [competitor]?", "\"Glad you asked now rather than at the end. On [their ground], they are genuinely strong. The difference that matters for you is [the one axis tied to their pain]. Want me to show that piece side by side?\""],
          ["Can we get a free trial?", "\"We do something better: a 30-day pilot with success criteria we agree on first, paid, credited against the contract if you continue. Free pilots get evaluated by nobody; paid ones get decided. Fair?\""],
          ["We want to think about it", "\"Of course. So I do not chase you with noise: what specifically needs thinking, the price, the fit, or who else needs to see it? Each has a different answer and I would rather send you exactly that.\""],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: the demo meeting is captured like every other interaction, and the cofounder's concern and the agreed pilot become deal facts with sources. Turning that transcript into a ready-to-send recap draft is on the build path; today the recap is yours to write from the captured notes.",
      },
    ],
  },
  {
    slug: "the-proposal",
    step: 15,
    phase: "Win the deal",
    title: "The proposal",
    description:
      "Present it live, anchor the price, quantify the case with their numbers, and attach the mutual action plan that turns a yes into a date.",
    blocks: [
      {
        type: "p",
        text:
          "A proposal emailed cold is a decision delegated to your absence. The playbook: book the proposal conversation **at the demo**, present it live, send the document after (or during) the call. Two structural facts drive everything here: 40 to 60 percent of B2B deals die in no-decision rather than to a competitor, and quantified business cases swing win rates by roughly half. The proposal exists to defeat indecision with arithmetic and a calendar.",
      },
      { type: "h2", text: "The anatomy (one page, then appendix)" },
      {
        type: "ol",
        items: [
          "**The problem, in their words, with their cost.** \"[Exact phrase from discovery]. Cost today: roughly [X] a year (your numbers from our call).\" Never your marketing language.",
          "**The future state**, stated as outcomes tied to their critical event, not as features.",
          "**Scope, version one.** Exactly what turns on first and who does what in week one. Small honest scope beats impressive vague scope.",
          "**The price, anchored.** Present the premium option first, then the recommended one (the good-better-best pattern with the middle as the target). Precise numbers read as engineering: 9,700 lands better than \"about 10K\". ROI sits next to the price: \"it pays for itself at [one concrete outcome, e.g. one additional deal a quarter]\". Payback stated in months.",
          "**The mutual action plan.** Goal in their words, decision date, named decision makers, week-by-week steps with owners on both sides, ending at signature. The plan converts the vague into the specific, surfaces hidden stakeholders before they ambush the deal, and correlates with 25 to 35 percent faster closes.",
          "**Proof.** One peer story with numbers, one reference they can call.",
        ],
      },
      { type: "h2", text: "Pricing discipline" },
      {
        type: "ul",
        items: [
          "**Never discount; trade.** Every concession buys something: an annual commitment, a case study, two introductions, a signature date. Naked discounts lower win rates and raise churn, because they reprice your credibility.",
          "**Never free.** Free pilots convert under 10 percent; paid pilots with executive sponsorship and pre-agreed success criteria convert 60 to 90. Charge 10 to 30 percent of the annual contract, credit it on conversion, 30 to 60 days maximum, binary success criteria written before it starts, and the \"what happens if it succeeds\" answered in advance.",
          "**Annual locks churn.** Offer the annual with about two months off; it is the cheapest retention you will ever buy.",
          "**Keep the walk-away.** A price you will not defend is not a price; it is an opening bid against yourself.",
        ],
      },
      {
        type: "example",
        title: "Example: the Elevay one-pager",
        lines: [
          "**Problem (their words):** \"10 hours a week on lists and follow-ups, and warm replies dying in the inbox.\" Cost: ~60K a year of leaked pipeline plus the founder's evenings, before the 65K SDR hire under discussion.",
          "**Future state:** pipeline runs on a daily list and approved drafts; every interaction captured; the Q3 raise gets its pipeline proof.",
          "**Scope v1:** TAM build plus daily cadences for the founder, capture on from day one; the team features stay off until a second seat exists.",
          "**Price:** Scale option presented first, recommended plan at 999 a month or 9,990 annual (two months off); pays for itself at one additional closed deal per quarter; payback under 2 months on their numbers.",
          "**Plan:** week 1 onboarding and TAM validation, week 2 first cadences live, week 3 cofounder review with the pilot metrics, decision Friday week 4, signed by [date] so pipeline exists before the raise.",
        ],
      },
      { type: "h2", text: "Objections at the proposal stage" },
      {
        type: "table",
        headers: ["They say", "You say"],
        rows: [
          ["It is too expensive", "\"Compared to what it replaces, or to the budget you had in mind? The problem costs you [X] a quarter (your numbers). The solution is [Y] a year. If my math is wrong somewhere, show me which line and I will redo it with you.\""],
          ["[Competitor] is cheaper", "\"Probably, for what it does. The gap we priced is [the one they quantified]: does the cheaper option close it? If it genuinely does, take it, and I mean that.\""],
          ["Can you do something on the price?", "\"I will not drop it, and I can trade: annual commitment takes two months off, or this price holds with a case study and two introductions when it works. Which is more useful to you?\""],
          ["Let us start next quarter", "\"That is a real option, costing roughly [a quarter of the problem's annual cost] of known leakage. Alternative: start the pilot now on the narrow scope so next quarter begins with proof instead of a kickoff. Which feels right?\""],
          ["Legal and procurement need to review", "\"Expected. Two things that save weeks: I send the security pack today, and we put their review inside the plan with a named owner, starting now rather than after the yes. Who runs it on your side?\""],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: the proposal draws on what is already captured (the discovery numbers, the stakeholders, the critical event). Tracking the mutual action plan's dates as deal steps, so a slipped date becomes visible instead of ambient, is on the build path.",
      },
    ],
  },
  {
    slug: "closing",
    step: 16,
    phase: "Win the deal",
    title: "Closing",
    description:
      "Indecision is the killer, not the competitor: the no-decision playbook, champion enablement, the verbal-yes-to-signature cadence, and walking away with the door open.",
    blocks: [
      {
        type: "p",
        text:
          "The end of a deal is rarely a duel; it is a fade. More deals die to **no decision** than to any competitor, and once buying intent exists, pushing more product information makes it worse in five cases out of six: late-stage hesitation is fear of messing up, not lack of information. Closing is the discipline of removing reasons to stall, one by one, on a clock.",
      },
      { type: "h2", text: "The no-decision playbook" },
      {
        type: "ol",
        items: [
          "**Judge the hesitation.** \"What would make you hesitate even if the solution were perfect?\" Distinguishes fear of choosing wrong from fear of choosing at all; each has a different cure.",
          "**Offer one recommendation, not options.** \"Based on everything we covered, here is what I would do, and why.\" Menus feed paralysis at this stage; conviction relieves it.",
          "**Limit the information.** Stop sending decks. \"Rather than adding material, which specific point is blocking you?\"",
          "**Take the risk off the table.** The narrow paid pilot, the phased start, the exit clause, the guarantee. You are not lowering the price; you are lowering the cost of being wrong.",
        ],
      },
      { type: "h2", text: "Arm the champion (you are rarely in the final room)" },
      {
        type: "ul",
        items: [
          "**A one-pager per stakeholder**, each speaking to that role's actual concern: money for finance, risk for legal, workload for the team.",
          "**The ROI sheet with their numbers** from discovery, not template numbers.",
          "**The objection FAQ by role**: the five things each person will ask, with the answers that worked.",
          "**The rehearsal.** \"When you present this to [decision maker], what will they push on? Let us prepare it together.\" And always the offer to join the meeting.",
          "**Multi-thread to survive.** Deals with 4+ buyer-side contacts win at roughly double the rate of single-threaded ones, and a departing champion (it happens in 40 percent of stalled B2B deals) then costs you a contact instead of the deal: get the successor introduction inside 48 hours, send the one-page deal summary, and keep moving with the remaining stakeholders.",
        ],
      },
      { type: "h2", text: "Negotiate like an adult" },
      {
        type: "p",
        text:
          "Three moves cover most founder-stage negotiations: **label** the emotion you can hear (\"it sounds like the annual commitment is the uncomfortable part\") and then hold the silence; **ask calibrated questions** instead of defending (\"what would make this a no-brainer for you?\", \"how am I supposed to make that work at that price?\"); and **pre-empt with the accusation audit** (\"you are probably thinking this is rich for a company your size...\") because a named objection deflates before it is wielded. And the gap reflex from Step 13 never retires: every pricing objection returns to the cost of the problem.",
      },
      { type: "h2", text: "From verbal yes to signature" },
      {
        type: "p",
        text:
          "A verbal yes is the start of a leak, not the end of a deal. Prevention beats cure: ask in the first meetings \"if we agree this is a fit, what is the internal process to sign, who approves, how long does legal take?\", share a skeleton contract mid-process so legal starts before the yes, and anchor the signature date to their critical event. Then the post-yes cadence:",
      },
      {
        type: "table",
        headers: ["Day", "Move"],
        rows: [
          ["Day 0", "Confirm within minutes: recap the terms, send the agreement during the call if you can (\"I am sending it now, can you open it?\")"],
          ["Day 2-3", "Helpful nudge: \"anything I can help unblock on your side?\""],
          ["Day 5-7", "Real urgency, honestly stated: the onboarding slot, the price window, their critical event"],
          ["Day 10-14", "Name the blocker: \"this usually snags on [legal / a signer on holiday / budget line]. Which is it, and can I help directly?\""],
          ["Day 21", "Deal break-up: \"I am closing this on my side; if it revives, I am here.\" Loss aversion does the rest, or the deal was already gone"],
        ],
      },
      {
        type: "callout",
        title: "Two field signals worth knowing",
        text:
          "A contract opened three or more times without a signature means someone is stuck on a clause: call and ask which one. And late-stage deals decay fastest of all (half-lives of days, not weeks, Step 17): a quiet week in negotiation is an emergency, while a quiet week in early discovery is just a week.",
      },
      { type: "h2", text: "Walking away" },
      {
        type: "p",
        text:
          "Closed-lost is a decision you make, on criteria, not a status that happens to you: an explicit competitor choice, an explicit no, a champion gone with no successor, the budget killed, or 60 days of silence with no next step. Log the real reason (Step 18 learns from it), thank them like a future customer, and watch the triggers: a new leader at that account in the next year is a reopened door, and the first vendor back in the room wins disproportionately. The founder's clarity rule, one last time: a no is a good outcome; the only bad outcome is a maybe that eats your calendar.",
      },
      {
        type: "example",
        title: "Example: an Elevay close, unstuck",
        lines: [
          "The pilot hit its criteria; the founder said yes on Tuesday. By day 6: silence. The deal record shows the agreement opened four times, unsigned, and the cofounder absent since the demo.",
          "Judge: \"what would make you hesitate even if the pilot numbers hold?\" Answer: the cofounder fears another tool nobody runs. Offer one recommendation: start on the annual with the 60-day exit clause, founder as owner. Limit: no new material. Risk off: the exit clause in writing.",
          "Champion armed: a one-pager for the cofounder (their concern verbatim: cost of the toy scenario versus the pilot's measured numbers) plus the offer to walk them through it in 15 minutes. Signed day 9, two days before their board meeting: the critical event the plan had anchored all along.",
        ],
      },
      { type: "h2", text: "Objections at the closing stage" },
      {
        type: "table",
        headers: ["They say", "You say"],
        rows: [
          ["We went with [competitor]", "\"Congratulations, genuinely: deciding is the hard part. What tipped it? [Listen.] If anything changes in the first months, the door is open, and I will check in around [their critical event].\""],
          ["The CFO has not approved it yet", "\"Normal at this amount. Would a one-pager in CFO language help: payback, cash impact, exit clause? I can also do 15 minutes with them directly, whichever is faster for you.\""],
          ["Can we start smaller / on the free plan?", "\"We can start narrower: the pilot scope at [price], credited on the annual. What I will not do is free, because free gets evaluated by nobody and I want us actually deciding in 30 days.\""],
          ["Send the contract, I will sign this week", "[Day 5, by phone, not email] \"You said by Friday and I am not seeing it signed, which usually means something moved. Has something changed, or are we still on for [date]?\""],
          ["We need [feature] before we can sign", "\"If [feature] is truly load-bearing, let us write it into the agreement with a date and an exit if we miss it. If it is not, let us not let it cost you [the quantified gap] a quarter. Which is it, honestly?\""],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: the deal's stakeholders and open commitments live in the captured record, and the loss reason you log is retained. Surfacing a stall before it fades (a decay clock per stage) and feeding the winning and losing profiles back into targeting are on the build path; today an embryo of that loop exists (which signal types accompanied your wins), and Step 18 is where it grows.",
      },
    ],
  },
];
