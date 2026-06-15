import type { DocStep } from "../types";

/**
 * Phase: Foundations (steps 1-3). The doctrine, the road to one million,
 * and the positioning and message work that happen before anyone is
 * contacted. Sources: the GTM research corpus, including the full
 * modern-GTM practitioner interview transcript (revenue equation,
 * demand-first diagnosis, founder time doctrine, origin-story messaging).
 */
export const foundationSteps: DocStep[] = [
  {
    slug: "operating-doctrine",
    step: 1,
    phase: "Foundations",
    title: "The operating doctrine",
    description:
      "Revenue is an equation. Demand is almost always the bottleneck. The founder's time goes to customers, the machine does everything else.",
    blocks: [
      {
        type: "p",
        text:
          "Every step in this method serves one equation: **revenue = opportunities x conversion rate x deal size**. When a number disappoints, the discipline is to name which variable is actually constrained before changing anything. Most founders get this diagnosis wrong, in the same direction.",
      },
      { type: "h2", text: "Demand first: the diagnosis founders miss" },
      {
        type: "p",
        text:
          "Roughly nine out of ten early-stage companies are bottlenecked on **demand**: not enough qualified opportunities in play. Yet nine out of ten founders diagnose a conversion problem instead, usually after a month where one deal pushed or went to a competitor. The real problem is not that the deal slipped; it is that there were not **five** deals in play, where one converting hits the number and two beats it.",
      },
      {
        type: "p",
        text:
          "The math explains the trap. Moving demo conversion from 10 to 15 percent sounds like \"5 percent better\" but is actually a **50 percent improvement**, one of the hardest things to engineer in sales: it can require new features, new pricing, new segments, or genuinely learning to sell. Doubling demos from 10 to 20 a month is usually far easier, and it doubles revenue at constant conversion. So the default allocation of effort is demand generation, and when a channel works, **double and triple down on it** until you have more qualified conversations than you can take.",
      },
      {
        type: "example",
        title: "Example: reading a missed month",
        lines: [
          "A founder using Elevay misses March. The instinct: \"the two lost demos hesitated on a missing integration, let's go build it.\"",
          "The funnel read: 6 opportunities were in play all month. At a normal 20 to 25 percent close rate, 6 opportunities was never going to produce more than 1 or 2 wins. Conversion was normal; demand was half of what the target required.",
          "The fix is in the top of the funnel: more tier A accounts worked, a second channel added, signals reacted to faster. Not a roadmap change inferred from two anecdotes.",
        ],
      },
      { type: "h2", text: "Founder time is the scarcest resource" },
      {
        type: "ul",
        items: [
          "**There is no one better in the world at acquiring the first handful of customers than the founder.** A founder who cannot land customer one and hires a salesperson to fix it has misdiagnosed: that is almost always a product-market-fit problem, and a third party will not solve it.",
          "**Automation exists to buy customer-facing time, not to replace it.** The machine should do everything that is fully online: list building, research, drafting, capture, follow-up bookkeeping. People still buy from people; the conversations, relationships and judgment are the founder's job, and the highest-ROI use of founder time after product-market fit is being customer-facing.",
          "**Show up in person when the deal warrants it.** Nobody flies across a continent for a small deal, but for a marquee account in reach, presence converts at rates no email ever will.",
        ],
      },
      { type: "h2", text: "The doctrines built into Elevay" },
      {
        type: "ul",
        items: [
          "**Founder as sender.** Early outreach originates from the founder: their mailbox, their name, their story. Recipients know they will be sold to when a rep writes; a founder writing about a problem they chose to solve gets structurally higher reply rates, and can say things no salesperson can.",
          "**Relevance, not personalization.** Every message exists because of one fact that benefits the recipient: the role they are hiring, the round they raised, the post they wrote. Trivia (their city, their team) is decoration that reads as automation and performs worse than no personalization at all.",
          "**Machine reveals, human acts.** Elevay prepares lists, priorities, drafts, briefs and notes, and shows its evidence. Nothing outbound leaves without approval by default. You stay the judge.",
          "**Zero manual data entry.** If the system depends on a human filling fields after every call, the data will not exist. Capture must be automatic, from real interactions, with sources.",
          "**Statistical honesty.** With a handful of closed deals, most patterns are noise. Below real sample sizes the product shows ranges and proposes experiments, never fake precision. A single weighted-pipeline number is a coin flip dressed up as a forecast.",
          "**Close the loop on outcomes.** What matters is the characteristics of companies that **close**, not companies that merely take meetings. Wins and losses must flow back into targeting, which is also why measuring activity (meetings booked) instead of outcomes (revenue) corrupts the whole machine.",
        ],
      },
      { type: "h2", text: "Before product-market fit: learning mode" },
      {
        type: "p",
        text:
          "Under roughly ten customers, the unit of progress is the conversation, not the sequence. Run 50 discovery conversations on one narrow wedge: one persona, one problem, one segment of 50 to 100 accounts. Sell hard for two weeks; if nothing bites, change the wedge, not the volume. Design partners are the exception to \"never work free\": a small group (10 to 15) can pay in commitment instead of cash, but the commitment must be real: they make you their system of record and build with you, because what you need from that phase is feedback, not revenue. Everyone after them pays.",
      },
      {
        type: "callout",
        title: "How to read this method",
        text:
          "This method is written for one journey: **zero to your first million of revenue, founder-led the whole way**. The steps are ordered: foundations, then building the machine (ICP, math, TAM, signals), then running outbound (cadence and one playbook per channel, plus the brand layer), then winning the deal (discovery to signature, with the objections of every stage), then learning loops. Each step states the practice, shows a worked example with Elevay as the example company, and ends with what Elevay automates for you. Step 2 maps the road and tells you which steps dominate at your stage.",
      },
    ],
  },
  {
    slug: "the-road-to-one-million",
    step: 2,
    phase: "Foundations",
    title: "The road to one million",
    description:
      "Zero to 1M is the validation phase: the customer math, the four stages, the ledger of everything that must be tested and proven before scaling, and what never changes.",
    blocks: [
      {
        type: "p",
        text:
          "One million in annual revenue is the milestone that proves a repeatable motion, and for a B2B product with real deal sizes it is reachable by **one founder plus the machine**, before any sales team exists. The classic failure on this road is hiring salespeople to escape selling: revenue that was never founder-proven does not transfer. This step maps the road so every later step can be read at the right intensity for where you are.",
      },
      {
        type: "p",
        text:
          "Hold one idea above all the others: **zero to one million is the validation phase, not a small version of the scale phase.** Going from one to one hundred million is multiplication: more people running the same motion, more budget on the same channels, more accounts in the same ICP. Multiplication amplifies whatever it is given, errors included. Scale an unvalidated ICP and you multiply churn; scale an unvalidated channel and you multiply cost per meeting; scale an unproven playbook and you multiply failed hires. So the job of this road is not just to reach a number; it is to leave the million with **every load-bearing assumption tested**, so the next two orders of magnitude are an execution problem instead of a discovery problem.",
      },
      { type: "h2", text: "The customer math: your deal size decides your motion" },
      {
        type: "p",
        text:
          "One million of annual recurring revenue is a customer count, and the count dictates how you sell:",
      },
      {
        type: "table",
        headers: ["Deal size (annual)", "Customers for 1M", "What that implies"],
        rows: [
          ["~5K", "~200", "Volume motion: outbound math is fragile (Step 1's failure mode), inbound and product must carry weight"],
          ["~12K", "~84", "The founder-led sweet spot: outbound + referrals + content, one closing conversation at a time"],
          ["~25K", "~40", "Fewer, deeper deals: multi-threading and discovery quality dominate"],
          ["~50K+", "~20", "Named accounts: every deal is a campaign"],
        ],
      },
      {
        type: "p",
        text:
          "Run your own number before anything else: it sets your weekly prospect volume (Step 5), your cadence depth (Step 8), and how much of this road you can travel on outbound alone.",
      },
      { type: "h2", text: "The four stages of the road" },
      {
        type: "table",
        headers: ["Stage", "Goal", "What you do", "What changes"],
        rows: [
          [
            "First customers (0 to ~10 customers)",
            "Proof someone pays",
            "Founder-to-founder conversations, not sequences: list ~200 in one wedge, contact ~50 a week, 20 discovery calls, close the few with the sharpest pain",
            "Founding-member pricing is fine (discounted, with direct access to you), free never is: paying is the commitment signal",
          ],
          [
            "Repeatability (to ~25 customers)",
            "A motion that works twice",
            "Signal-based outbound becomes systematic (Steps 7 to 10); the referral engine starts; content cadence begins (Step 11)",
            "You stop improvising: cadences, caps and the FAQ are written down as you go",
          ],
          [
            "The machine (to ~60 customers)",
            "Multiple sources at once",
            "Outbound, referrals, inbound and partnerships all feed the same TAM; pricing normalizes (founding discounts end); annual plans lock churn",
            "Your capacity cap (Step 5) binds: the first full-cycle hire onboards on the written method (Step 19)",
          ],
          [
            "Compounding (to 1M and past)",
            "Growth that does not need pushing",
            "Referrals and inbound overtake outbound for the first time; partnerships open portfolios; the founder keeps strategic deals and the brand layer (Step 12)",
            "The mix flips: cold outbound becomes the minority source it should be",
          ],
        ],
      },
      {
        type: "p",
        text:
          "Read the stage exits as **validation gates, not revenue numbers**. Revenue without the validation behind it is borrowed: it will be repaid with interest at scale.",
      },
      { type: "h2", text: "The validation ledger: what the million must have proven" },
      {
        type: "p",
        text:
          "This is the work of the phase: a list of load-bearing assumptions, each with the test it must pass before you are allowed to multiply it. Validated means the evidence would survive Step 17's bars (real sample sizes, one variable at a time), not that it happened once.",
      },
      {
        type: "table",
        headers: ["What you are validating", "The test it must pass", "If it fails"],
        rows: [
          [
            "The wedge and ICP",
            "A majority of discovery calls recognize the pain unprompted (out of 20 calls, well over half resonate)",
            "Pivot the wedge, never the volume. More outreach into a wrong wedge validates nothing.",
          ],
          [
            "Willingness to pay",
            "Customers pay a real price from day one; founding discounts are a launch tool with an end date, not the price",
            "If \"too expensive\" dominates the first conversations, fix pricing or wedge before any scaling thought.",
          ],
          [
            "The message",
            "Reply rates clear the signal-led bar on 250+ sends per variant, and the phrases that close keep reappearing in calls",
            "Change the angle, not the adjectives (Step 17). A message that needs explaining has failed the test.",
          ],
          [
            "The channel mix",
            "One or two channels produce predictable meetings at a known cost per meeting, for at least two consecutive months",
            "Double down only on what repeats. A channel that worked once is an anecdote, not a channel.",
          ],
          [
            "The funnel itself",
            "Your own stage rates are data-dominated where volume allows (a reply rate stabilizes near a thousand sends; a close rate needs a couple of hundred proposals and may still be settling at 1M)",
            "Keep planning with ranges where the data is thin (Step 5). Do not staff a plan built on a prior.",
          ],
          [
            "Time-to-value and retention",
            "A new customer sees first proof inside 30 days; early customers renew and expand; the early-warning signals stay quiet",
            "If customers sign but see nothing in 30 days, churn explodes and referrals never start. Fix onboarding before selling harder: you are not ready to scale.",
          ],
          [
            "The referral loop",
            "Happy customers actually produce introductions when asked at day 7 and after value",
            "Zero introductions is a value problem, not an asking problem. The product is not delivering visibly enough.",
          ],
          [
            "The playbook's transferability",
            "Someone who is not you closes with the written method (the two-AE test of Step 19)",
            "If only the founder can sell it, you have a founder, not a motion. Write down what is missing and retest.",
          ],
        ],
      },
      {
        type: "p",
        text:
          "Most of these cannot be validated in parallel from a standing start; the four stages exist to sequence them. First customers validates wedge and willingness to pay. Repeatability validates message and channel. The machine validates the funnel, retention and the referral loop. Compounding validates transferability. By the million, the ledger should be full, and everything in it written down (Step 19).",
      },
      { type: "h2", text: "The revenue mix shifts under you" },
      {
        type: "p",
        text:
          "At the start, outbound is close to 100 percent of new revenue because nothing else exists yet. By the million, a healthy mix looks like roughly **25 percent outbound, 30 percent referrals, 25 percent inbound, 20 percent partnerships**. That shift is not outbound failing; it is outbound succeeding: every closed customer becomes a referral source, every learning becomes content, every case study opens a partnership. If cold outbound is still most of your revenue at the million, the compounding loops were never built.",
      },
      { type: "h3", text: "The referral engine: the highest-converting source you control" },
      {
        type: "ul",
        items: [
          "**Ask early and in person.** A week after a close, on a call, never by email: \"who do you know in the same situation?\" Two or three introductions per happy customer is normal.",
          "**Warm introductions close at 30 to 40 percent.** Cold outbound closes well under 1 percent of contacts. One intro is worth roughly a hundred cold emails: budget your time accordingly.",
          "**Make it effortless.** Come with 2 or 3 names you already suspect they know (your TAM tells you), and draft the introduction email for them.",
          "**Referral wins stay out of ICP learning** (Step 18): they encode your network, not your market. They are revenue, not evidence.",
        ],
      },
      {
        type: "example",
        title: "Example: Elevay's own road, staged",
        lines: [
          "**Math:** at a ~12K annual deal, 1M means ~84 customers. Working backward (Step 5), that is a 1,700 to 2,500 account TAM worked over the journey, never all at once.",
          "**First customers:** 200 founders listed in one wedge (B2B founders hitting their first outbound push), 50 contacted a week founder-to-founder, 20 discovery calls, 5 founding members at a reduced but real price, each with direct access to the founder.",
          "**Repeatability:** the SDR-posting and fundraise signals (Step 7) run systematically; every new customer is asked for introductions at day 7; 2 to 5 posts a week about the problem, never the product.",
          "**The machine:** ~25 customers in, the founder's calendar saturates (Step 5's cap); the first full-cycle AE onboards by reading this method and listening to the 10 best captured calls; founding pricing ends; annual plans are proposed to the earliest customers.",
          "**Compounding:** referral pipeline overtakes cold outbound for the first time; the founder keeps founder-to-founder deals, the brand layer, and the insight loops.",
        ],
      },
      { type: "h2", text: "What never changes on this road" },
      {
        type: "ul",
        items: [
          "**The founder sells the entire way to the million.** Help arrives (Step 19), but origination, the key conversations and the judgment stay with you. Nobody buys the first hundred customers from a stranger.",
          "**Demand-first stays true at every stage** (Step 1): each stall on this road is, by default, a not-enough-in-play problem before it is a conversion problem.",
          "**Eat your own method.** Every step of this method applied to yourself is also your proof: the way you sell is the first demo of how you think.",
          "**Learning velocity is the early KPI.** Before ~10 customers, count conversations and validated hypotheses, not pipeline value. Revenue follows the learning curve, never the reverse.",
          "**Consistency beats intensity.** Fifty disciplined touches a week for six months beat a heroic month followed by silence: every loop in this method compounds only if it keeps turning.",
        ],
      },
      {
        type: "p",
        text:
          "In Elevay: the product is sized for exactly this road. The TAM, the daily list and the cadences carry one founder to the million without a sales team, and the same workspace then onboards the first hires on the method you already ran (Step 19).",
      },
    ],
  },
  {
    slug: "positioning-and-message",
    step: 3,
    phase: "Foundations",
    title: "Positioning and message",
    description:
      "Develop the angle before anyone is contacted: alternatives, differentiated value, the wedge, the category, and the origin story only a founder can tell.",
    blocks: [
      {
        type: "p",
        text:
          "Outbound amplifies positioning; it cannot create it. A mediocre message sent with discipline beats brilliant copy sent inconsistently, but no discipline rescues a message that answers a question nobody asked. Do this work once, in writing, before the first sequence runs.",
      },
      { type: "h2", text: "The five-step positioning process" },
      {
        type: "ol",
        items: [
          "**Name the real alternatives.** What would your customers do if your product did not exist? Rarely a direct competitor: doing nothing, a spreadsheet, an intern, three tools glued together. You are positioned against these, not against the logo on the comparison page.",
          "**List your differentiated capabilities.** What you have that the alternatives do not. Features and attributes only; no benefits yet.",
          "**Translate to differentiated value.** For each capability, answer \"so what?\" for the customer. The benefit those features enable.",
          "**Find the best-fit customer.** Who cares the **most** about that value? That answer is your wedge, and it should narrow your ICP (Step 4).",
          "**Name the category.** The context that makes your value obvious in one line. The frame changes everything about how the same product is understood.",
        ],
      },
      {
        type: "callout",
        title: "The 5-second test",
        text:
          "Show your value proposition to someone for five seconds. They should be able to say what it does, for whom, and why anyone cares. If they cannot, it is too complex to survive a cold inbox.",
      },
      {
        type: "example",
        title: "Example: Elevay through the five steps",
        lines: [
          "**Alternatives:** a founder doing it by hand: a spreadsheet of prospects, a sequencer bolted on, notes nowhere, follow-ups from memory. Or hiring an SDR a year too early.",
          "**Differentiated capabilities:** builds the target market itself, scores and prioritizes by live signals, drafts outreach from cited facts, captures every email, call and meeting without data entry.",
          "**Differentiated value:** the founder runs a full pipeline alone, spending their hours in conversations instead of in tooling.",
          "**Best-fit customer:** early-stage B2B founders doing founder-led sales, no sales team yet, deal sizes that justify outbound.",
          "**Category:** a revenue engine for founder-led sales. Not \"a CRM\": positioned against the labor and the glue, not against a database.",
        ],
      },
      { type: "h2", text: "The messaging hierarchy" },
      {
        type: "ul",
        items: [
          "**One positioning statement.** Internal, strategic, changes rarely.",
          "**One value proposition.** External, customer-facing, passes the 5-second test.",
          "**Three to five message pillars**, each with proof attached: a number, a named outcome, a peer story.",
          "**Variants by funnel stage.** Early touches educate about the problem, middle touches agitate the cost of it, late touches differentiate and de-risk.",
        ],
      },
      {
        type: "callout",
        title: "On naming, while you are here",
        text:
          "If the name is not settled yet: naming is not a social activity. Like naming a child, the founders decide and do not poll the room, because everyone has an opinion and committees converge on beige. Optimize for two things: the associations you want the brand to carry, and an ownable domain you can eventually get. A memorable word you can build stories around beats an accurate description of the product.",
      },
      { type: "h2", text: "The origin story: the founder-only asset" },
      {
        type: "p",
        text:
          "There is one message class a salesperson cannot send: why you personally started the company. \"I started this after years of watching [the person you sell to] lose [what the problem costs]\" carries credibility and relatability no template reaches, and it reframes the email from a pitch into founder-to-founder. Write the two-sentence version once, keep it honest, and use it where the founder-to-founder angle fits, not everywhere.",
      },
      {
        type: "example",
        title: "Example: an origin story line",
        lines: [
          "\"I am building Elevay because I watched too many technical founders sell a great product badly: evenings lost to spreadsheets and follow-ups, while the conversations that actually close got the leftovers. We made the machine do the machine's part.\"",
        ],
      },
      { type: "h2", text: "Keep the message alive" },
      {
        type: "p",
        text:
          "Positioning is drafted at a desk but finished on calls. Harvest the exact phrasings that make prospects react (Step 10 makes this a routine) and promote them into your pillars and your website. Test messaging one variable at a time with real sample sizes (Step 17). And expect to revisit this step every time the ICP shifts: positioning, ICP and message move together or not at all.",
      },
      {
        type: "p",
        text:
          "In Elevay: your product description, voice and message pillars live in the workspace knowledge and feed every generated draft, so the angle you chose here is the angle the machine writes with.",
      },
    ],
  },
];
