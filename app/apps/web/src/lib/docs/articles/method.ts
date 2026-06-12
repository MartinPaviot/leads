import type { DocArticle } from "../types";

/**
 * Category: Method. How the Elevay engine works end to end and the
 * doctrines behind it. Distilled from the GTM research corpus
 * (_research/): revenue equation, demand-first diagnosis, founder-sender,
 * relevance over personalization, statistical honesty.
 */
export const methodArticles: DocArticle[] = [
  {
    slug: "how-elevay-works",
    category: "Method",
    title: "How Elevay works",
    description:
      "The operating loop behind the product and the doctrines it enforces: demand first, founder as sender, relevance over personalization, machine reveals and human acts.",
    blocks: [
      {
        type: "p",
        text:
          "Revenue is an equation: **opportunities x conversion rate x deal size**. Everything Elevay does is aimed at moving one of those three variables, starting with the one founders most often get wrong.",
      },
      {
        type: "p",
        text:
          "When revenue is short, roughly nine out of ten founders diagnose a conversion problem (\"the deal pushed\", \"we lost the demo\") when the real constraint is demand: there were not enough qualified opportunities in play. Improving a close rate by half is hard. Doubling the number of good conversations is usually achievable. So the engine is demand-first by design: it always works to keep the top of your funnel full of the right companies, then helps you convert them.",
      },
      { type: "h2", text: "The operating loop" },
      {
        type: "ol",
        items: [
          "**Describe who you sell to.** Your ICP in plain language, converted into explicit, editable criteria. This is a hypothesis, not a setting you get right once.",
          "**Elevay builds your market.** It sources companies that match, deduplicates them, enriches decision makers with verified contact details, and scores every account against your criteria. The result is a finite, named, prioritized universe: your operational TAM.",
          "**Signals decide who is worked today.** Fundraises, hiring, leadership changes, technology moves, website visits. Fit says who could buy; signals say who might buy now. The daily list is the intersection.",
          "**Outreach is drafted, not fired.** Emails and call scripts are generated from real, cited context, in your voice, sent from your own mailbox. You approve before anything leaves. Volume caps, warm-up and sending windows protect your domain.",
          "**Every interaction is captured.** Emails, meetings and calls land on the right account, contact and deal automatically, summarized with sources. No manual CRM entry, because manual entry does not happen in practice.",
          "**Outcomes feed back.** Wins and losses update which signals matter, what the winning profile looks like, and what to propose changing in your targeting. You stay the judge of every change.",
        ],
      },
      { type: "h2", text: "The doctrines" },
      {
        type: "h3",
        text: "Founder as sender",
      },
      {
        type: "p",
        text:
          "At the early stage, outreach originates from the founder. A founder writing about a problem they personally chose to solve gets a level of trust and reply no junior rep can match, and prospects know the difference. Elevay is built around this: your mailbox, your name, your story, with the preparation cost per message driven toward zero so it does not cannibalize your selling time.",
      },
      { type: "h3", text: "Relevance, not personalization" },
      {
        type: "p",
        text:
          "A good outbound message cites one fact that benefits the recipient: the role they are hiring for, the round they raised, the tool they are replacing. Mentioning their city or their favorite team is decoration, and buyers read it as automation. Every draft Elevay produces is grounded in a verifiable source, and a message with no real reason to exist is not worth sending.",
      },
      { type: "h3", text: "Machine reveals, human acts" },
      {
        type: "p",
        text:
          "Elevay prepares everything: the list, the priorities, the drafts, the call brief, the notes, the follow-ups. The conversations, the relationships and the judgment stay yours. Nothing outbound leaves without your approval by default, and recommendations always show their evidence so you can disagree.",
      },
      { type: "h3", text: "Statistical honesty" },
      {
        type: "p",
        text:
          "Early-stage sample sizes are small. With a handful of closed deals, any pattern (\"finance personas convert better\", \"this vertical closes faster\") is more likely noise than insight. Where the numbers are thin, Elevay says so, shows ranges instead of false precision, and proposes experiments rather than conclusions. A weighted pipeline number without an uncertainty range is a coin flip dressed up as a forecast.",
      },
      { type: "h2", text: "What this replaces" },
      {
        type: "p",
        text:
          "The usual founder stack is a data tool, a sequencer, a dialer, a note taker and a CRM, glued together by the founder's evenings. Elevay is the pre-assembled version of that machine with the methodology built in: the same loop a strong revenue team would run, available from day one, sized for one person.",
      },
      {
        type: "callout",
        title: "Where to go next",
        text:
          "Start with the TAM articles: what an operational TAM is, how to build one, and how to keep it alive. Then pick the playbook for each channel you run.",
      },
    ],
  },
];
