import type { DocStep } from "../types";

/**
 * Phase: Build the machine (steps 4-7). From ICP hypothesis to a scored,
 * signal-aware account universe. Sources: competitor methodology research,
 * reverse pipeline math (multi-million-send benchmark datasets), founder
 * capacity literature, signal decay research.
 */
export const buildSteps: DocStep[] = [
  {
    slug: "define-your-icp",
    step: 4,
    phase: "Build the machine",
    title: "Define your ICP",
    description:
      "The ICP is a hypothesis, not a setting: explicit criteria, a deliberate anti-persona, and a definition that deepens as customers accumulate.",
    blocks: [
      {
        type: "p",
        text:
          "Everything downstream (the TAM, the scores, the daily list, the drafts) is derived from the ICP, so the ICP must be **explicit**: written criteria a machine can evaluate and a human can argue with. \"SaaS founders who get it\" is a mood, not an ICP.",
      },
      { type: "h2", text: "Four kinds of criteria" },
      {
        type: "ul",
        items: [
          "**Firmographics.** Industry, headcount band, geography, business model. The boring filters do most of the work. Not every matching company is equal either: a headquarters city, an employee sweet spot, or sales-led versus product-led can change priority inside the ICP.",
          "**Context.** What must be true about how they operate: the team they run, the tools they depend on, the regulatory frame they live in.",
          "**Triggers.** The moment that makes them buyable: a fundraise, a key hire, a tool up for replacement. Fit without a moment is patience; a moment without fit is noise. Triggers become signals in Step 7.",
          "**Exclusions.** The anti-persona is as load-bearing as the persona: segments that look adjacent but churn, stall or cannot pay. Startups that never narrow their ICP pay for it later in churn.",
        ],
      },
      {
        type: "p",
        text:
          "Weight the criteria and mark the few that are non-negotiable. A criterion the data cannot evaluate must be surfaced, never silently ignored: a filter that quietly drops half the market is how good companies vanish from a TAM without anyone deciding it.",
      },
      { type: "h2", text: "The ICP is a hypothesis" },
      {
        type: "p",
        text:
          "Before product-market fit, start from a narrow beachhead: one persona, one problem, one segment of 50 to 100 accounts, and expect to revise after every 50 to 100 real conversations. The definition deepens with traction:",
      },
      {
        type: "table",
        headers: ["Stage", "ICP discipline"],
        rows: [
          ["Under 10 customers", "A simple 3-criteria hypothesis (industry, size, pain). No scoring. Learn fast."],
          ["10 to 50 customers", "Compare your best and worst 20 percent of customers. Extract the patterns. Light scoring."],
          ["50+ customers", "Formal weighted scoring and tiering, refreshed from closed outcomes (Step 18)."],
        ],
      },
      {
        type: "example",
        title: "Example: Elevay's ICP v1",
        lines: [
          "**Persona:** the founder personally running sales at an early-stage B2B startup.",
          "**Firmographics:** B2B software or services, roughly 2 to 20 people, pre-seed to Series A, Europe and North America.",
          "**Context:** deal sizes around $5K to $50K a year (big enough for outbound math to work), no sales hires yet, founder technical or product-heavy.",
          "**Triggers:** just raised, hiring their first sales or SDR role, founder publicly asking for tooling recommendations.",
          "**Anti-persona:** companies with an established sales team (they need admin and routing, not an engine), pure product-led motions with tiny deal sizes (outbound math is structurally negative under about $5K), agencies reselling to clients.",
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: you describe the ICP in plain language; it becomes structured, editable criteria with importance levels, and every account carries an explainable fit against them. When the hypothesis changes, the scores and the TAM follow.",
      },
    ],
  },
  {
    slug: "size-the-funnel",
    step: 5,
    phase: "Build the machine",
    title: "Size the funnel",
    description:
      "Reverse pipeline math: from the revenue you need to the accounts you must work, and the founder capacity cap nobody budgets for.",
    blocks: [
      {
        type: "p",
        text:
          "There are two things people call a TAM. The investor version is a dollar figure on a slide. The operational version is a **finite, named list of companies** that could plausibly buy from you in the next 12 to 24 months. This method is about the second one, and its size is not a preference: it falls out of arithmetic.",
      },
      { type: "h2", text: "The chain, with benchmark medians" },
      {
        type: "p",
        text:
          "Benchmark medians across very large outbound datasets (millions of sends and dials) give a working chain. Your own numbers replace these as data accumulates; until then they are honest priors:",
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
          "Multiplied through, median performance needs roughly **700 contacted prospects per closed deal**. Strong targeting, real relevance and a second channel can cut that 3 to 5 times; weak lists and generic messaging multiply it. Deal size moves the close step too: win rates run around 31 percent under $10K and fall toward 15 percent above $100K.",
      },
      {
        type: "example",
        title: "Example: sizing Elevay's own year",
        lines: [
          "Goal: 20 new customers this year through outbound.",
          "At the median chain: 20 deals x ~700 contacts = ~14,000 contacted prospects. At 2 to 3 contacts per account, that is 5,000 to 7,000 accounts: more than the real universe of in-ICP startups in reach. The median chain is not good enough; the plan cannot be \"send more\".",
          "At a signal-led chain (10 percent reply, the rest improving accordingly): roughly 200 to 250 contacts per deal, so ~5,000 contacts and **1,700 to 2,500 accounts**. That is a buildable TAM, and it sets the quality bar: this plan only works if Step 6 and Step 7 are done properly.",
          "Sanity check the other way: 20 deals at ~22 percent proposal close needs ~90 proposals, ~130 qualified opportunities, ~300 booked meetings of which ~240 are held: about 5 a week. Feasible for one founder, barely: which is the real constraint (below).",
        ],
      },
      { type: "h2", text: "The hidden cap: founder capacity" },
      {
        type: "p",
        text:
          "A founder selling part-time can genuinely hold roughly **12 to 16 active deals** and close on the order of 4 a month. Past that, extra top-of-funnel does not become revenue; it becomes no-shows, rushed discovery and stalled threads. Two consequences: pace TAM consumption to meeting capacity instead of blasting the list, and when the calendar is full, the highest-value hour goes to closing and multi-threading existing deals, not to prospecting new ones.",
      },
      { type: "h2", text: "Honest numbers or no numbers" },
      {
        type: "callout",
        title: "Calibration reality",
        text:
          "A reply rate stabilizes after roughly a thousand sends; a close rate only after a couple of hundred proposals, which for most founders means months of prior-dominated data. Until then, any single-number forecast is theater. Plan with ranges, and distrust any tool that tells you \"your close rate is 15 percent\" off five proposals.",
      },
      {
        type: "p",
        text:
          "In Elevay: the funnel numbers are real, not estimated, and the forecast engine turns them into a run-rate with a confidence range and a bottleneck read (demand vs conversion vs capacity) from your own counts, never a single flattering number. Surfacing that read in the product, and pacing the daily list to your meeting capacity, is the remaining step.",
      },
    ],
  },
  {
    slug: "build-your-tam",
    step: 6,
    phase: "Build the machine",
    title: "Build the TAM",
    description:
      "Source the companies, find the buyers, score fit and heat separately, tier the universe, and hold the quality bar before anything sends.",
    blocks: [
      {
        type: "p",
        text:
          "Historically, building the list was where outbound time went to die: scrolling profiles, exporting and re-filtering spreadsheets, checking careers pages one by one. The outreach was the easy part; finding the right companies and people was the labor. That entire layer is now machine work, near-instant, which changes the founder's job from doing it to **judging it**. A finite, named universe beats an infinite database for four reasons: focus (every account is in or out), measurable coverage (\"34 percent of tier A touched twice\" is a real sentence about progress), compounding learning (every call updates a shared map), and deliverability discipline (a bounded universe forces quality).",
      },
      { type: "h2", text: "Source the companies" },
      {
        type: "p",
        text:
          "Elevay searches live B2B data for companies matching your criteria, deduplicates by domain, enriches firmographics, and records where each account came from and when it was last refreshed. CSV imports and inbound interest (a website visit, a demo request) feed the same universe. For most early-stage B2B products the result should land between **500 and 5,000 accounts**: below roughly 200 the wedge is too narrow for outbound math; above roughly 10,000 you have not chosen who you sell to. Order your effort by warmth: network first, then warm prospects who already engaged with you or your content, then signal-triggered cold, and pure cold last.",
      },
      { type: "h2", text: "Find the buyers" },
      {
        type: "p",
        text:
          "An account without a reachable decision maker is a row, not a target. Aim for **2 to 3 contacts per account**: the economic decision maker plus the operational champion. Verified contact details are the highest-leverage data investment there is: verified emails reply at a multiple of unverified ones, and bad data quietly burns the sending domain. Treat \"no reachable buyer\" as a visible coverage gap, never a silent one.",
      },
      { type: "h2", text: "Score fit and heat separately" },
      {
        type: "ul",
        items: [
          "**Fit** measures how well the account matches your criteria, and it must be explainable: which criteria matched, which did not, which could not be evaluated. Missing data caps confidence; it never silently zeroes an account.",
          "**Heat** measures timing, from live signals (Step 6). A perfect-fit account with no signal is a tier, not a target for today. Blending fit and heat into one mystery number destroys both meanings.",
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
      {
        type: "example",
        title: "Example: one Elevay tier A account",
        lines: [
          "A 9-person developer-tools startup, Series A announced 3 weeks ago, posting for a \"Founding SDR\", founder active on social. Fit: matches every ICP criterion. Heat: two live signals stacked (fundraise + sales hiring).",
          "Buyers: the CEO (economic buyer, sender of the eventual contract) and the cofounder running go-to-market day to day (champion). Both with verified emails, one with a direct line.",
          "Treatment: tier A. The founder sends the first touch personally, built on the SDR job post: the posting itself makes the timing argument, so the message can ask about her hire instead of pitching our product (Step 9 shows that exact email).",
        ],
      },
      { type: "h2", text: "The quality bar before anything sends" },
      {
        type: "callout",
        title: "The 20-account sample",
        text:
          "Before activating sequences on a fresh build, sample 20 accounts at random and ask one question per account: would I genuinely not be wasting this person's time? Fewer than about 17 of 20 clearly in target: fix the ICP and rebuild. Sequencing a mediocre list does not produce mediocre results; it produces near-zero results plus a damaged domain.",
      },
      {
        type: "p",
        text:
          "In Elevay: the TAM builder streams accounts in as they are sourced and scored, shows the criteria behind every score, keeps provenance per account, and routes additions through an approval queue so the universe never mutates behind your back.",
      },
    ],
  },
  {
    slug: "overlay-signals",
    step: 7,
    phase: "Build the machine",
    title: "Overlay signals",
    description:
      "Fit says who could buy; signals say who might buy now. Types, shelf lives, stacking, and the relevance doctrine that makes signals work.",
    blocks: [
      {
        type: "p",
        text:
          "A TAM ranks who could buy. Signals decide **who is worked today**. They are the difference between outreach that lands as service (\"you are visibly dealing with this now, here is something useful\") and outreach that lands as interruption. They are also the strongest single lever on reply rates that exists.",
      },
      { type: "h2", text: "The signal table" },
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
        type: "ul",
        items: [
          "**Speed is the multiplier.** Response rates on trigger-led outreach fall by roughly 80 percent within five days of the event. A signal reacted to in hours is a different signal than the same fact a week later.",
          "**Signals stack.** One live signal lifts reply rates 2 to 4 times over pure cold; two or three together, 5 to 10 times.",
          "**Signals expire.** Citing a stale signal is worse than citing none: it proves the message is automated. Past its shelf life, a signal must stop scoring, stop appearing in drafts, and stop being said on calls.",
          "**Signals can point at a person.** A job post has a department; a blog post has an author. The signal should route the outreach to the human it concerns, not to the most senior title on file.",
        ],
      },
      { type: "h2", text: "The relevance doctrine" },
      {
        type: "p",
        text:
          "A signal works when acting on it **benefits the recipient**. \"You posted for an executive assistant; we automate what that role does. Want to try it for a week while your search runs?\" converts because the message does the prospect's math for them, with the receipt linked. The failure mode is personal trivia: \"saw you are from Kansas City, go Chiefs\" followed by a pitch performs worse than the pitch alone, because it spends the reader's attention proving you researched them without giving them anything.",
      },
      {
        type: "example",
        title: "Example: Elevay's own signal set",
        lines: [
          "**Hiring signal:** a target startup posts for an SDR or \"first sales hire\". That is the moment for Elevay: the post says they are about to spend $60K+ a year on the exact work the product automates. First line of the draft: the posting, linked.",
          "**Fundraise signal:** a pre-seed or seed announcement inside the ICP. New budget, new growth pressure, no sales infrastructure yet: the 180-day window where founder-led sales gets serious.",
          "**Public ask:** a founder posts \"what are people using for outbound / CRM?\". Useful life measured in hours; answered same day, in public or in DM, with substance first.",
          "**Custom signal:** \"companies whose careers page added a sales role in the last 30 days but whose team page shows no salesperson\": described in plain language, detected automatically across the whole TAM.",
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: signals are detected continuously across the TAM (fundraises, hiring, leadership and technology changes, website visits, plus custom signals you describe in plain language), each with its shelf life enforced, each carrying its source so any message that cites it can show the receipt. The daily list is fit times heat: the intersection of who could buy and who might buy now.",
      },
    ],
  },
];
