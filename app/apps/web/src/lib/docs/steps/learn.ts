import type { DocStep } from "../types";

/**
 * Phase: Learn and compound (steps 17-19). Reading the numbers honestly,
 * keeping the TAM alive, feeding outcomes back into targeting, and the
 * transition out of founder-led sales. Sources: diagnostic waterfall
 * research, signal decay research, insights-honesty doctrine (statistical
 * significance over anecdote-scale pattern matching), scaling playbooks.
 */
export const learnSteps: DocStep[] = [
  {
    slug: "measure-and-diagnose",
    step: 17,
    phase: "Learn and compound",
    title: "Measure and diagnose",
    description:
      "The waterfall that locates the broken layer, kill thresholds, honest A/B testing, and the insight bar that separates signal from noise.",
    blocks: [
      {
        type: "p",
        text:
          "Outbound produces numbers at every stage, which makes it easy to stare at the wrong one. The discipline is a waterfall read: start at the top, find the **first** layer below its healthy band, fix that layer only, and change one variable at a time.",
      },
      { type: "h2", text: "The waterfall" },
      {
        type: "table",
        headers: ["Per 1,000 sends", "Healthy", "If below, fix"],
        rows: [
          ["Delivered", "950+ (95%)", "Infrastructure: authentication, warm-up, volume per inbox"],
          ["Opened", "~380 (40%)", "Subject lines, sender reputation"],
          ["Replied", "35 to 50 (3.5 to 5%)", "Targeting or message: change the angle, not the adjectives"],
          ["Positive replies", "60 to 70% of replies", "Offer-audience fit"],
          ["Meetings", "5 to 10", "Response speed, scheduling friction"],
          ["Qualified opportunities", "2 to 4", "Discovery quality, wrong persona in the room"],
          ["Closed", "0.5 to 1", "Urgency, multi-threading, quantified case"],
        ],
      },
      {
        type: "example",
        title: "Example: reading an Elevay month",
        lines: [
          "1,200 sends, 96 percent delivered, 41 percent opened, 1.9 percent replied. Infrastructure and subjects are healthy; the break is at the reply layer.",
          "Wrong fix: rewrite the adjectives and add a follow-up. Right fix: the reply layer is targeting or angle. The list audit (Step 6's 20-account sample) finds 7 of 20 accounts marginal-fit. The ICP gets a tightening pass, tier C is paused, and the angle is rebuilt on the strongest signal instead of the generic pain.",
          "Three weeks later: 600 sends to the tightened list, 4.8 percent reply. Same product, same founder, one layer fixed.",
        ],
      },
      { type: "h2", text: "Kill thresholds" },
      {
        type: "ul",
        items: [
          "**Reply rate under 0.5 percent after 200+ sends:** kill that variant or channel and rework targeting before sending another email.",
          "**Volume past the inbox cap with declining opens:** stop sending and repair the domain. Continuing past this point causes damage that takes a new domain to escape.",
          "**Meetings booked beyond your real capacity:** stop prospecting and go close. Past the capacity cap, new top-of-funnel is negative ROI.",
          "**Stale pipeline majority:** when most open pipeline value sits in deals past 1.5 to 2 times the median time-in-stage, redirect effort from new prospects to reviving or closing what exists. Late-stage deals decay fastest: a stalled negotiation is existential, a slow discovery is tolerable.",
        ],
      },
      { type: "h2", text: "Before you blame the message" },
      {
        type: "p",
        text:
          "A bad month triggers self-flagellation (\"maybe the value proposition is wrong\") faster than it triggers measurement. Check two things first. **Activity**: results follow activity with a lag, and a quiet pipeline usually traces to two quiet weeks of inputs before it says anything about the offer. **The market's calendar**: budget seasons, fiscal year-ends, school holidays and summer move meeting rates in ways that have nothing to do with your message. Mature operators know their market's calendar to the millimeter (this month has two public holidays and most buyers are mid-budget-cycle); founders flying blind remake their positioning over what was actually August. Only after activity and calendar are ruled out does the waterfall verdict stand.",
      },
      { type: "h2", text: "Testing without fooling yourself" },
      {
        type: "p",
        text:
          "Test in order of leverage: subjects, then the first line, then the angle, then the call to action. One variable at a time, 250 to 500 sends per variant, 5 to 7 business days, and only adopt winners above roughly 15 to 30 percent relative lift. Track pipeline velocity weekly (qualified opportunities x average deal x win rate, divided by cycle length); when it declines, the waterfall says where to look.",
      },
      { type: "h2", text: "The insight bar" },
      {
        type: "p",
        text:
          "The most valuable patterns are cohort insights: \"this persona converts at a multiple of that one\", \"this region closes faster\". Real examples of this class of insight have redirected entire sales motions. But they were found at hundreds of deals of scale. At early-stage volume, cutting data every possible way mostly manufactures noise: with 30 deals, some segment will always look 4x better by pure chance.",
      },
      {
        type: "callout",
        title: "The honest rule",
        text:
          "An insight earns the name only with real sample sizes behind it; below that it is a hypothesis, and the right response is an experiment (\"next 20 first touches split between persona A and B\"), not a strategy change. A system that says \"not enough data yet\" is worth more than one that always has an answer.",
      },
      {
        type: "p",
        text:
          "In Elevay: the waterfall is measured from real events (sends, replies, meetings, dispositions), never self-reported activity. The cohort engine this step describes is built: it cuts closed deals by persona and industry, tests each segment against the rest with an exact test, corrects for testing many cuts, and refuses to call anything an insight on thin or no-effect data (a no-effect set yields zero insights, by design). Surfacing it in the reports view, and retiring the older untested recommendations there, is the remaining step.",
      },
    ],
  },
  {
    slug: "keep-the-tam-alive",
    step: 18,
    phase: "Learn and compound",
    title: "Keep the TAM alive",
    description:
      "Lists rot: roles change, signals expire, exclusions accumulate. The maintenance loop, and how closed outcomes reshape targeting.",
    blocks: [
      {
        type: "p",
        text:
          "A TAM is not a deliverable; it is a living asset with a decay rate. Roughly **20 to 30 percent of contacts change role every year**, companies merge, die and pivot, and the trigger that justified an account this quarter is stale the next. A list exported in January is materially wrong by June. Maintenance is not hygiene; it is where the compounding advantage lives.",
      },
      { type: "h2", text: "Accounts flow in and out" },
      {
        type: "ul",
        items: [
          "**In.** New companies that start matching your criteria, inbound interest, and lookalikes of your wins, arriving through an approval queue: a human reviews additions, so the universe never silently inflates.",
          "**Out.** Hard exclusions are durable: a company you exclude stays excluded even if a future rebuild rediscovers it. A hard no from a prospect removes the account, to be revisited only on a major trigger like new leadership or a fundraise.",
          "**Stale.** Accounts untouched beyond a freshness window get re-enriched on a budget, oldest first, so the data you act on is the data that is true.",
        ],
      },
      { type: "h2", text: "Role freshness: the silent killer" },
      {
        type: "p",
        text:
          "Provider data keeps saying \"current role\" long after people have left. Calling someone the director of a company they quit ten months ago does not just waste a dial; it tells everyone who hears about it that you do not do your homework. Treat sourced titles as claims with an age: past a freshness window the product should say \"role to confirm, sourced N months ago\" rather than asserting it, and a contact flagged as departed drops out of call lists and sequences immediately.",
      },
      {
        type: "example",
        title: "Example: a caught decay",
        lines: [
          "An Elevay tier B contact was sourced 8 months ago as \"Head of Operations\". The provider still says current; the freshness window has expired.",
          "The brief stops asserting the title and shows \"role to confirm, sourced 8 months ago\". On the next call the founder opens by checking; the contact left 2 months earlier. One click flags the departure: the contact exits all lists, and the account shows a coverage gap that triggers re-discovery of the new operations lead, who arrives with a built-in opener: new in seat, 90-day window (Step 7).",
        ],
      },
      { type: "h2", text: "Outcomes reshape the universe" },
      {
        type: "ul",
        items: [
          "**Score what closes, not what books.** The profile that matters is the characteristics of companies that **close**, applied back to targeting; companies that merely take meetings teach you about politeness, not about your market.",
          "**Signal lift.** Which signal types were live on the deals you won? Their weight in prioritization should reflect your outcomes, not a global default.",
          "**Winning profile.** Size band, geography, industry, persona of the champion, origin channel: extracted at every close, accumulated into the picture that retunes Step 4.",
          "**Referral quarantine.** Keep referral wins out of outbound learning. They encode your network, not your market, and they will overfit your ICP toward people who already liked you.",
        ],
      },
      {
        type: "callout",
        title: "Small numbers, honest conclusions",
        text:
          "Below roughly 10 to 30 closed deals, any pattern is a hypothesis. The right move is an experiment, never an automatic ICP rewrite. Elevay proposes; you decide.",
      },
      { type: "h2", text: "The review cadence" },
      {
        type: "table",
        headers: ["Rhythm", "What happens"],
        rows: [
          ["Weekly", "Work the signal queue while signals are alive. Approve or reject proposed additions. Check tier A coverage."],
          ["Monthly", "Review ICP criteria against the last 30 days of real conversations: which criterion predicted interest, which never discriminated."],
          ["Quarterly", "Deep revision: kill dead criteria, formalize new ones from won deals, re-tier the universe, prune the graveyard."],
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: refresh, expiry, proposals and exclusion memory run continuously; the decisions come to you. The judgment stays yours; the bookkeeping stops being your job.",
      },
    ],
  },
  {
    slug: "scale-beyond-yourself",
    step: 19,
    phase: "Learn and compound",
    title: "Scale beyond yourself",
    description:
      "When founder-led sales should end, what to hire first, and what must be written down before anyone else can sell your product.",
    blocks: [
      {
        type: "p",
        text:
          "Founder-led sales is a phase, not an identity, and on the road of Step 2 its boundary sits around the million: the first full-cycle help arrives in the machine stage (roughly 25 customers in, when your capacity cap binds), and sales leadership only after the million is closed. The transition ends well when the machine and the playbook outlive the founder's personal involvement, and badly when a hire is asked to replace judgment that was never written down. It is earned with evidence:",
      },
      {
        type: "table",
        headers: ["Signal", "Move"],
        rows: [
          ["10 to 20 customers closed by the founder", "Consider the first sales hire"],
          ["Over 20 percent of founder time on sales execution", "Delegate execution, keep the conversations that need a founder"],
          ["A repeatable process exists", "Write it down before hiring against it"],
          ["First hire", "Two full-cycle AEs, not one (you cannot learn from a sample of one), and not an SDR first"],
          ["Around $3M to $5M ARR", "First sales leadership; not before"],
        ],
      },
      { type: "h2", text: "Why two AEs and never an SDR first" },
      {
        type: "p",
        text:
          "One hire gives you no comparison: if they miss, you cannot tell whether the problem is the person, the playbook or the market. Two full-cycle AEs A/B test each other. An SDR-first org is the wrong shape at this stage: the founder does not need meetings booked, they need deals closed end to end, and the machine already does the SDR's mechanical work. Related discipline: pay against **revenue**, not meetings booked. Compensation oriented to activity recreates the misdiagnosis of Step 1 inside your own team.",
      },
      { type: "h2", text: "What must be written down" },
      {
        type: "ul",
        items: [
          "**The FAQ, word for word** (Step 10 built it call by call): every question ever heard, with the answer that worked.",
          "**The playbook by phase:** openers, peer-pain stories, the three exits, the objection table, in your customers' own words.",
          "**The ICP and anti-persona with reasons** (Step 4), plus the winning profile so far (Step 18).",
          "**The cadence and its rules** (Step 8): touches, channels, caps, response-time discipline.",
          "**And a date for its next revision.** A playbook is never static: every quarter brings a new feature, a new vertical, a sharper phrase from the field. Re-derive the scripts with the same method each time rather than letting one aging script stretch across audiences it was never written for.",
        ],
      },
      { type: "h2", text: "Keeping the first hires alive" },
      {
        type: "p",
        text:
          "Dialing and closing is emotionally hard work (Step 10), and your first hires will not have a founder's equity to carry them through the bad weeks. Three cheap disciplines hold a small team together: **celebrate loudly** (the bell on a closed deal exists because recognition drives sellers at least as hard as money); **reward personally** (a gift chosen for the person, worth a hundred, beats a generic bonus worth two: it proves you know them); and **make the best teach** (the rep booking the most meetings sharing exactly how, in the weekly best-and-worst-calls ritual, lifts the team and retains the star). And the hardest one: a toxic top performer poisons a small team faster than a missed quarter; part ways even when the number argues otherwise.",
      },
      {
        type: "example",
        title: "Example: the Elevay handover",
        lines: [
          "By the time Elevay hires its first two AEs, the method is not in anyone's head: the ICP and its criteria live in settings, the call playbook and FAQ live in the workspace knowledge, every past conversation is captured and searchable, and the cadence rules are enforced by the product.",
          "Week one for a new AE is reading the method (these pages), listening to the 10 best captured calls, and shadowing the daily list. The founder keeps tier A relationships and the deals where founder-to-founder is the difference; everything else transfers.",
        ],
      },
      { type: "h2", text: "What the founder keeps" },
      {
        type: "p",
        text:
          "Even with a team, two things never delegate well: the accounts where founder-to-founder trust is the difference (Step 1), and the creative brand work that compounds across every channel (Step 12). The founder's calendar should lose the mechanics and keep the moments.",
      },
      { type: "h2", text: "What the million hands to the next phase" },
      {
        type: "p",
        text:
          "Scaling from one to one hundred million is a different book: segmentation, territories, a leadership layer, marketing as a system. This method does not pretend to cover it. What it guarantees is the only thing that phase actually requires from this one: the **validation ledger of Step 2, full and written down**. A proven wedge, a priced offer, a message that replies, channels with known cost per meeting, a funnel measured on your own data, customers who renew and refer, and a playbook that closes without you. Companies that arrive at the million with that ledger full scale on rails; companies that arrive with revenue but an empty ledger spend the next two years rediscovering this phase with a payroll attached.",
      },
      {
        type: "p",
        text:
          "In Elevay: the same workspace serves the team that served the founder alone: shared TAM and knowledge, per-member mailboxes and ownership, collision warnings when two people work the same prospect, and the daily list sized per member. The method scales because it was never only in the founder's head.",
      },
    ],
  },
];
