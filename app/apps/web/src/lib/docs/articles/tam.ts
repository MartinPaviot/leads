import type { DocArticle } from "../types";

/**
 * Category: TAM. What an operational TAM means for an early-stage startup,
 * how to build one, and how to keep it alive. Grounded in the research
 * corpus: reverse pipeline math (multi-million-send benchmark datasets),
 * founder capacity caps, signal decay, and outcome feedback discipline.
 */
export const tamArticles: DocArticle[] = [
  {
    slug: "tam-for-early-stage-startups",
    category: "TAM",
    title: "What a TAM means for an early-stage startup",
    description:
      "Not the market-size slide: the finite, named list of companies that could buy from you in the next 12 to 24 months, sized by reverse pipeline math.",
    blocks: [
      {
        type: "p",
        text:
          "There are two things people call a TAM. The investor version is a dollar figure on a slide: how big the market could be. The operational version is a **finite, named list of companies** that could plausibly buy from you in the next 12 to 24 months. Elevay is about the second one. It is the single most underused asset in early-stage sales.",
      },
      { type: "h2", text: "Why a finite list beats an infinite database" },
      {
        type: "ul",
        items: [
          "**Focus.** Every account is either in or out. You stop relitigating who to contact every Monday morning.",
          "**Measurable coverage.** \"We have touched 34 percent of tier A with at least two contacts each\" is a real sentence about progress. \"We sent more emails this week\" is not.",
          "**Compounding learning.** Every call and reply updates a shared map of the same finite territory, instead of evaporating into an endless lead list.",
          "**Deliverability discipline.** A bounded universe forces quality over volume, which is also what keeps your sending domain alive.",
        ],
      },
      { type: "h2", text: "The right size" },
      {
        type: "p",
        text:
          "For most early-stage B2B products, an operational TAM lands between **500 and 5,000 accounts**. Below roughly 200 accounts, outbound math gets fragile: one bad month exhausts your best targets. Above roughly 10,000, you have not actually chosen who you sell to, and your messaging will read like it.",
      },
      { type: "h2", text: "Reverse pipeline math: the only sizing that matters" },
      {
        type: "p",
        text:
          "Size the TAM from the revenue you need, not from how big a list you can export. Benchmark medians across very large outbound datasets (millions of sends and dials) give a working chain:",
      },
      {
        type: "table",
        headers: ["Funnel step", "Median rate"],
        rows: [
          ["Contacted to replied (cold email)", "~3.4% (top decile 10%+)"],
          ["Replied to meeting booked", "~62%"],
          ["Meeting booked to held", "~80%"],
          ["Held to qualified opportunity", "~55%"],
          ["Qualified to proposal", "~70%"],
          ["Proposal to closed won", "~22%"],
        ],
      },
      {
        type: "p",
        text:
          "Multiply the chain through and median performance needs roughly **700 contacted prospects per closed deal**. Strong targeting, real relevance and a second channel can cut that by 3 to 5 times; weak lists and generic messaging multiply it. Now run it backward: if the next milestone needs 10 new customers, that is on the order of 2,000 to 7,000 prospects to work, and at 2 or 3 contacts per account, roughly **1,000 to 3,000 accounts**. That number is your TAM requirement, and it tells you immediately whether your current ICP is too narrow, too broad, or about right.",
      },
      {
        type: "callout",
        title: "Honest numbers",
        text:
          "These are priors, not promises. Your own rates replace them as your data accumulates: a reply rate stabilizes after roughly a thousand sends, a close rate only after a couple of hundred proposals. Until then, treat any single-number forecast with suspicion and plan with ranges.",
      },
      { type: "h2", text: "The hidden cap: founder capacity" },
      {
        type: "p",
        text:
          "A founder selling part-time can genuinely hold roughly **12 to 16 active deals** and close on the order of 4 a month. Past that, extra top-of-funnel does not become revenue; it becomes no-shows, rushed discovery and stalled threads. Two consequences: pace TAM consumption to your meeting capacity instead of blasting it, and when your calendar is full, the highest-value hour is spent closing and multi-threading existing deals, not prospecting new ones.",
      },
      { type: "h2", text: "Your ICP is a hypothesis" },
      {
        type: "p",
        text:
          "Before product-market fit, the honest unit of progress is the conversation. Start from a narrow beachhead: one persona, one problem, one segment of 50 to 100 accounts, and expect to revise after every 50 to 100 real conversations. The ICP definition deepens with traction:",
      },
      {
        type: "table",
        headers: ["Stage", "ICP discipline"],
        rows: [
          ["Under 10 customers", "A simple 3-criteria hypothesis (industry, size, pain). No scoring. Learn fast."],
          ["10 to 50 customers", "Compare your best and worst 20 percent of customers. Extract the patterns. Light scoring."],
          ["50+ customers", "Formal weighted scoring and tiering, refreshed from closed outcomes."],
        ],
      },
      {
        type: "p",
        text:
          "Elevay encodes this: your ICP lives as explicit criteria you can edit any time, every account carries an explainable fit score against them, and the TAM rebuilds when the hypothesis changes. The next article covers how to build the list itself.",
      },
    ],
  },
  {
    slug: "building-your-tam",
    category: "TAM",
    title: "Building your TAM",
    description:
      "From ICP hypothesis to a scored, tiered, actionable account universe: criteria, sourcing, buyer coverage, explainable scoring and the quality bar before any sequence runs.",
    blocks: [
      {
        type: "p",
        text:
          "A TAM build is four steps: define the ICP as explicit criteria, source the companies, find the buyers inside them, then score and tier. The order matters, and so does a quality gate at the end.",
      },
      { type: "h2", text: "Step 1: define the ICP as criteria, not vibes" },
      {
        type: "ul",
        items: [
          "**Firmographics.** Industry, headcount band, geography, business model. The boring filters do most of the work.",
          "**Context.** What must be true about how they operate: the team they run, the tools they depend on, the regulatory frame they live in.",
          "**Triggers.** The moment that makes them buyable: a fundraise, a key hire, a tool up for replacement, an expansion. Fit without a moment is patience; a moment without fit is noise.",
          "**Exclusions.** The anti-persona is as load-bearing as the persona: segments that look adjacent but churn, stall or cannot pay. Startups that never narrow their ICP pay for it later in churn.",
        ],
      },
      {
        type: "p",
        text:
          "Make each criterion explicit and weighted, and mark the few that are non-negotiable. In Elevay you describe the ICP in plain language and it becomes structured criteria you can inspect and edit; a criterion the data cannot evaluate is surfaced instead of silently ignored.",
      },
      { type: "h2", text: "Step 2: source the companies" },
      {
        type: "p",
        text:
          "Elevay searches live B2B data for companies matching your criteria, deduplicates by domain, enriches firmographics, and records where each account came from and when it was last refreshed. You can also import a CSV you already trust, and inbound interest (a website visit, a demo request) feeds the same universe. Order your effort by warmth: your network first, then warm prospects who already engaged with you or your content, then signal-triggered cold accounts, and pure cold last.",
      },
      { type: "h2", text: "Step 3: find the buyers" },
      {
        type: "p",
        text:
          "An account without a reachable decision maker is not actionable; it is a row. Target **2 to 3 contacts per account**: the economic decision maker plus the operational champion. Verified contact details are the single highest-leverage data investment you can make: verified emails reply at a multiple of unverified ones, and bad data quietly burns your sending domain. Elevay maps titles to personas, enriches verified emails and phone numbers, and treats \"no reachable buyer\" as a visible coverage gap rather than a silent failure.",
      },
      { type: "h2", text: "Step 4: score and tier" },
      {
        type: "p",
        text:
          "Two separate dimensions, never blended into one mystery number:",
      },
      {
        type: "ul",
        items: [
          "**Fit** measures how well the account matches your criteria. It must be explainable: which criteria matched, which did not, and which could not be evaluated. Missing data should cap confidence, not silently zero the account.",
          "**Heat** measures timing, from live signals. A perfect-fit account with no signal is a tier, not a target for today.",
        ],
      },
      {
        type: "table",
        headers: ["Tier", "Definition", "Treatment", "Weekly volume"],
        rows: [
          ["A", "Strong fit + live signal", "Founder works them by hand: deepest research, personal outreach", "5 to 10"],
          ["B", "Strong fit, no timing signal", "Elevay drafts, you review and approve", "10 to 20"],
          ["C", "Moderate fit", "Light automated touches, or hold until a signal fires", "20 to 50"],
        ],
      },
      {
        type: "p",
        text:
          "These volumes are deliberate. At the founder stage, 10 to 15 well-researched prospects a week outperform 200 sprayed ones on every metric that matters, including total meetings.",
      },
      { type: "h2", text: "The quality bar before anything sends" },
      {
        type: "p",
        text:
          "Before activating sequences on a fresh build, sample 20 accounts at random and ask one question per account: would I genuinely not be wasting this person's time? If fewer than about 17 of 20 are clearly in the target, fix the ICP and rebuild. Sequencing a mediocre list does not produce mediocre results; it produces near-zero results plus a damaged domain, because relevance is what reply rates are made of.",
      },
      {
        type: "callout",
        title: "In Elevay",
        text:
          "The TAM builder streams accounts in as they are sourced and scored, shows the criteria behind every score, and keeps provenance per account. Additions beyond your initial build arrive as proposals you approve, so the universe never mutates behind your back.",
      },
    ],
  },
  {
    slug: "keeping-your-tam-alive",
    category: "TAM",
    title: "Keeping your TAM alive",
    description:
      "Lists rot: people change jobs, signals expire, exclusions accumulate. The maintenance loop that keeps a TAM trustworthy, and how outcomes reshape it.",
    blocks: [
      {
        type: "p",
        text:
          "A TAM is not a deliverable; it is a living asset with a decay rate. Roughly **20 to 30 percent of contacts change role every year**, companies merge, die and pivot, and the trigger that justified an account this quarter is stale the next. A list exported in January is materially wrong by June. Maintenance is not hygiene; it is where the compounding advantage lives.",
      },
      { type: "h2", text: "Signals expire" },
      {
        type: "p",
        text:
          "Every signal type has a shelf life. Citing a stale one is worse than citing none: it proves the message is automated.",
      },
      {
        type: "table",
        headers: ["Signal", "Useful life", "Reaction window"],
        rows: [
          ["Public ask for recommendations", "Days", "Under 4 hours"],
          ["Pricing or demo page visit", "Days", "Under 4 hours; minutes are worth multiples"],
          ["New executive in seat", "~120 days", "Under 24 hours; new leaders are far likelier to change tools in their first 90 days"],
          ["Fundraise announced", "~180 days", "Under 24 hours"],
          ["Hiring in your domain", "~30 days per posting", "Under 48 hours"],
          ["Technology change detected", "~90 days", "Under 48 hours"],
        ],
      },
      {
        type: "p",
        text:
          "Speed is the multiplier: response rates on trigger-led outreach fall by roughly 80 percent within five days of the event. And signals stack: one live signal lifts reply rates 2 to 4 times over pure cold; two or three together, 5 to 10 times. Elevay applies these lifetimes mechanically: an expired signal stops scoring, stops appearing in drafts, and stops being said on calls.",
      },
      { type: "h2", text: "Accounts flow in and out" },
      {
        type: "ul",
        items: [
          "**In.** New companies that start matching your criteria, inbound interest, and lookalikes of your wins. Additions arrive through an approval queue: a human reviews them, so the universe never silently inflates.",
          "**Out.** Hard exclusions are durable: a company you exclude stays excluded even if a future rebuild rediscovers it. A hard no from a prospect removes the account, to be revisited only on a major trigger like new leadership or a fundraise.",
          "**Stale.** Accounts untouched beyond a freshness window get re-enriched on a budget, oldest first, so the data you act on is the data that is true.",
        ],
      },
      { type: "h2", text: "Role freshness: the silent killer" },
      {
        type: "p",
        text:
          "Provider data keeps saying \"current role\" long after people have left. Calling someone the director of a company they quit ten months ago does not just waste a dial; it tells everyone who hears about it that you do not do your homework. Treat sourced titles as claims with an age: past a freshness window the product should say \"role to confirm, sourced N months ago\" rather than asserting it, and a contact flagged as departed must drop out of call lists and sequences immediately.",
      },
      { type: "h2", text: "Outcomes reshape the universe" },
      {
        type: "p",
        text:
          "Every closed deal, won or lost, is information about who to target next:",
      },
      {
        type: "ul",
        items: [
          "**Signal lift.** Which signal types were live on the deals you won? Their weight in prioritization should reflect your outcomes, not a global default.",
          "**Winning profile.** Size band, geography, industry, persona of the champion, origin channel. The point is the next quarter's targeting, not a retrospective.",
          "**Referral quarantine.** Keep referral wins out of outbound learning. They encode your network, not your market, and they will overfit your ICP toward people who already liked you.",
        ],
      },
      {
        type: "callout",
        title: "Small numbers, honest conclusions",
        text:
          "Below roughly 10 to 30 closed deals, any pattern is a hypothesis. The right move is an experiment (\"next 20 first touches split between persona A and B\"), never an automatic ICP rewrite. Elevay proposes; you decide.",
      },
      { type: "h2", text: "The review cadence" },
      {
        type: "table",
        headers: ["Rhythm", "What happens"],
        rows: [
          ["Weekly", "Work the signal queue while signals are alive. Approve or reject proposed additions. Check coverage of tier A."],
          ["Monthly", "Review ICP criteria against the last 30 days of real conversations: which criterion predicted interest, which never discriminated."],
          ["Quarterly", "Deep revision: kill dead criteria, formalize new ones from won deals, re-tier the universe, prune the graveyard."],
        ],
      },
      {
        type: "p",
        text:
          "Elevay runs the mechanical parts of this loop (refresh, expiry, proposals, exclusion memory) continuously, and brings you the decisions. The judgment stays yours; the bookkeeping stops being your job.",
      },
    ],
  },
];
