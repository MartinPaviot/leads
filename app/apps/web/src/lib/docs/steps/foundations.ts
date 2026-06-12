import type { DocStep } from "../types";

/**
 * Phase: Foundations (steps 1-2). The doctrine the whole method hangs on,
 * then positioning and message work that happens before anyone is
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
          "The steps are ordered: foundations, then building the machine (ICP, math, TAM, signals), then running outbound (cadence and one playbook per channel, plus the brand layer), then learning loops. Each step states the practice, shows a worked example with Elevay as the example company, and ends with what Elevay automates for you.",
      },
    ],
  },
  {
    slug: "positioning-and-message",
    step: 2,
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
          "**Find the best-fit customer.** Who cares the **most** about that value? That answer is your wedge, and it should narrow your ICP (Step 3).",
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
          "Positioning is drafted at a desk but finished on calls. Harvest the exact phrasings that make prospects react (Step 9 makes this a routine) and promote them into your pillars and your website. Test messaging one variable at a time with real sample sizes (Step 12). And expect to revisit this step every time the ICP shifts: positioning, ICP and message move together or not at all.",
      },
      {
        type: "p",
        text:
          "In Elevay: your product description, voice and message pillars live in the workspace knowledge and feed every generated draft, so the angle you chose here is the angle the machine writes with.",
      },
    ],
  },
];
