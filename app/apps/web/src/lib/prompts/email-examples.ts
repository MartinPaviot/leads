/**
 * Golden Few-Shot Examples for Email Generation
 *
 * These are high-quality email examples used as few-shot demonstrations
 * for the sequence generator. Each example includes annotations explaining
 * why it works, so the LLM can learn the underlying principles.
 *
 * Two examples per methodology (BASHO, Challenger, Problem-Solution, Product-Led).
 * Each example targets a specific signal type to demonstrate signal usage.
 */

export interface EmailExample {
  methodology: string;
  seniority: string;
  signalType: string;
  context: string;
  subject: string;
  body: string;
  whyItWorks: string;
}

export const GOLDEN_EMAIL_EXAMPLES: EmailExample[] = [
  // ── BASHO (C-Suite) ──────────────────────────────────────────

  {
    methodology: "BASHO",
    seniority: "c-suite",
    signalType: "funding",
    context: "CEO of a Series B DevTools company ($25M raised), 80 employees, hiring 12 engineers",
    subject: "scaling past 80 engineers",
    body: `Marie,

DevTools companies that 3x engineering post-Series B usually hit a wall around month 4 — the processes that worked at 30 engineers break silently at 100. Pipeline visibility is the first casualty.

With 12 open engineering roles, you're on that trajectory. How are you thinking about sales infrastructure scaling alongside the team?`,
    whyItWorks: "Opens with a specific, data-grounded insight about THEIR trajectory (not ours). References the exact signal (12 open roles). Asks a strategic question that positions us as peers, not vendors. 62 words — well under the 80-word BASHO limit.",
  },

  {
    methodology: "BASHO",
    seniority: "c-suite",
    signalType: "leadership_change",
    context: "New CTO at a B2B SaaS company, joined 6 weeks ago from a competitor, company has 200 employees",
    subject: "the first 90 days",
    body: `Thomas,

New CTOs at 200-person SaaS companies typically inherit 3-4 years of technical debt disguised as "architecture decisions." The ones who move fastest start by mapping what the sales team actually needs from product — it reveals the real priorities.

What's surprised you most about the stack since joining from DataForge?`,
    whyItWorks: "Acknowledges the career move naturally. Leads with a counterintuitive insight (start with sales, not engineering). References specific detail (DataForge) proving research. Ends with a curiosity-driven question, not a pitch. 63 words.",
  },

  // ── Challenger (VP) ──────────────────────────────────────────

  {
    methodology: "Challenger",
    seniority: "vp",
    signalType: "hiring",
    context: "VP Sales at a mid-market SaaS, company hiring 8 SDRs, using Salesforce, 150 employees, $40M ARR",
    subject: "the SDR scaling trap",
    body: `Laura,

Most VP Sales I talk to assume that doubling SDR headcount doubles pipeline. But the data tells a different story — companies that scaled from 5 to 15 SDRs without changing their tooling saw pipeline per rep drop 34% within two quarters.

The issue isn't the people. It's that manual CRM entry at 5 reps becomes a data integrity crisis at 15 — reps log less, managers see less, and forecasting becomes fiction.

NexaFlow was in the same spot last year at similar headcount. They automated 90% of CRM capture before scaling SDRs and maintained pipeline-per-rep through the transition.

Would the NexaFlow playbook be useful context as you plan the ramp?`,
    whyItWorks: "Opens by challenging a common assumption with specific data (34% drop). Names the root cause clearly. Provides a peer proof point with a concrete metric. CTA offers value (playbook) not a meeting. 118 words — within the 120-word Challenger limit.",
  },

  {
    methodology: "Challenger",
    seniority: "vp",
    signalType: "tech_change",
    context: "VP Engineering at a fintech, just migrated to AWS, using Python/Django, 90 employees",
    subject: "post-migration pipeline blind spots",
    body: `Alex,

VPs of Engineering who just finished a cloud migration often tell me the same thing six months later: "We optimized the infrastructure but forgot the go-to-market tooling."

At fintech scale, the migration to AWS usually exposes how much your sales and CS teams were relying on on-prem data flows that nobody documented. Customer signals that used to arrive in real-time now have a 24-48 hour lag.

Paystack hit this exact issue after their GCP migration. They closed the gap in 3 weeks by piping their event stream directly into their GTM layer — reply rates jumped 22%.

Happy to share the technical brief if the signal lag resonates.`,
    whyItWorks: "Reframes the cloud migration story from an engineering win to a GTM risk. Very specific about the consequences (24-48h lag). Peer proof with quantified result (22% reply rate increase). CTA is a technical brief — respects the VP Eng persona. 115 words.",
  },

  // ── Problem-Solution (Director/Head) ─────────────────────────

  {
    methodology: "Problem-Solution",
    seniority: "director",
    signalType: "expansion",
    context: "Head of Sales at a HR-tech company, expanding to EMEA, 120 employees, Series A",
    subject: "EMEA expansion + pipeline",
    body: `Sophie,

Heads of Sales expanding to EMEA for the first time usually face a specific problem: the pipeline cadence that works in the US falls apart when you're managing reps across 3+ timezones with different selling cultures.

The typical symptom is that EMEA pipeline looks healthy in the CRM but actual conversion is 40% lower than US — because the data is stale by the time you see it.

CleverStaff had the same challenge when they opened London and Berlin last year. They moved from weekly pipeline reviews to real-time deal signals and brought EMEA conversion within 8% of US within one quarter.

Would a 20-minute call to walk through their approach be useful before you finalize the EMEA playbook?`,
    whyItWorks: "Names the exact pain a Head of Sales feels during international expansion. Quantifies the problem (40% lower conversion). Peer proof with specific cities and timeline. CTA is time-bounded (20 min) and positioned as input to their planning. 130 words.",
  },

  {
    methodology: "Problem-Solution",
    seniority: "head",
    signalType: "funding",
    context: "Director of Revenue Operations at a cybersecurity company, just raised Series B ($35M), 200 employees",
    subject: "rev ops post-Series B",
    body: `James,

Revenue Operations directors at post-Series B cybersecurity companies typically face a crunch: the board wants 3x pipeline growth in 18 months, but the CRM data quality that was "good enough" at $10M ARR becomes a liability at $30M.

The pattern I see is that RevOps teams spend 60% of their time cleaning data instead of building the forecasting infrastructure the board actually needs.

Armis solved this by automating contact and activity capture before their Series C push — their RevOps team went from data janitors to strategic operators, and forecast accuracy improved from 65% to 89%.

If data quality is on your radar ahead of the next board meeting, I can send you the Armis framework.`,
    whyItWorks: "Names the exact tension between board expectations and operational reality. The 'data janitor' framing resonates viscerally with RevOps. Peer proof with dramatic metric improvement. CTA tied to a real deadline (board meeting). 128 words.",
  },

  // ── Product-Led (Manager/Senior) ─────────────────────────────

  {
    methodology: "Product-Led",
    seniority: "manager",
    signalType: "hiring",
    context: "Sales Manager at a logistics SaaS, team of 6 AEs, using HubSpot, company has 80 employees",
    subject: "your team's CRM time",
    body: `Rachel,

Sales managers with 6+ AEs typically lose 4-5 hours per week per rep to manual CRM updates — that's roughly 120 hours of selling time your team loses every month.

Your peers at similar-sized logistics SaaS teams have been testing tools that auto-capture every email, call, and meeting without any rep input. The average result is reps getting 6+ hours back per week.

Here's a 2-minute sandbox you can try with your own HubSpot data — no credit card, no sales call required: [link]

If it saves your team even half that time, it's worth the two minutes.`,
    whyItWorks: "Opens with a quantified pain every sales manager recognizes (CRM entry time). Converts to team-level impact (120 hours/month). Offers a self-serve path respecting the manager's autonomy. Zero friction CTA. 105 words.",
  },

  {
    methodology: "Product-Led",
    seniority: "senior",
    signalType: "tech_change",
    context: "Senior SDR at a martech company, recently switched from Outreach to Apollo, team of 4 SDRs",
    subject: "Apollo → actual pipeline",
    body: `Marcus,

SDRs who just moved to Apollo usually spend the first month rebuilding sequences and importing lists. But the reps who ramp fastest skip the manual setup and connect a tool that auto-builds their prospect research.

Three SDRs at a similar martech company tried this approach — they cut list-building time by 70% and hit quota two weeks earlier than their peers.

Here's the free tier link if you want to test it alongside Apollo: [link]

Takes about 5 minutes to connect.`,
    whyItWorks: "Meets the SDR where they are (just switched tools, in the weeds). Peer proof is relatable (other SDRs, not executives). CTA is a free tier — zero risk, zero meetings. Concise at 92 words.",
  },

  // ── Follow-up Examples (Steps 2-5) ───────────────────────────

  {
    methodology: "Challenger",
    seniority: "vp",
    signalType: "funding",
    context: "Step 2 (Teach) — follow-up to VP Sales who didn't reply to initial signal-based email",
    subject: "benchmark you might find useful",
    body: `Laura,

Unrelated to my last note — came across research showing that Series B SaaS companies with automated activity capture close deals 23% faster than those relying on manual CRM entry.

The gap comes down to one thing: managers with real-time pipeline visibility coach 3x more often than those waiting for weekly forecast calls.

Here's the dataset if you want to benchmark your team: [link]`,
    whyItWorks: "Step 2 (Teach) done right: pure value, zero product mention, different angle from step 1. Shares a specific, non-obvious insight with a quantified claim. The 'unrelated to my last note' framing resets the conversation. 68 words.",
  },

  {
    methodology: "Problem-Solution",
    seniority: "director",
    signalType: "funding",
    context: "Step 4 (Pattern Interrupt) — 3rd follow-up to Director who hasn't replied",
    subject: "quick question",
    body: `Sophie,

If your EMEA reps could see US-quality pipeline data in real-time, would that change how you're planning Q3 headcount?

Genuinely curious — no pitch attached.`,
    whyItWorks: "Step 4 (Pattern Interrupt) is ultra-short: 28 words. One provocative question that reframes the value in terms of THEIR strategic decision (Q3 headcount planning). The 'no pitch attached' disarms. This is the kind of email that gets a reply because it's easy to answer.",
  },

  {
    methodology: "BASHO",
    seniority: "c-suite",
    signalType: "news",
    context: "Step 5 (Graceful Exit) — final email to CEO who hasn't replied to any of 4 emails",
    subject: "closing the loop",
    body: `Marie,

Clearly the timing isn't right, and I respect that. I'll stop reaching out.

If pipeline visibility becomes a priority as you scale past 100 engineers, here's a resource that's helped similar companies navigate that transition: [link]

Door's always open.`,
    whyItWorks: "Step 5 (Graceful Exit): zero pressure, full respect. Leaves a useful resource so the last impression is value, not persistence. 'Door's always open' is warm without being needy. 46 words. This email often gets the reply that the previous 4 didn't.",
  },
];

/**
 * Get examples filtered by methodology for injection into the generation prompt.
 */
export function getExamplesForMethodology(methodologyName: string): EmailExample[] {
  return GOLDEN_EMAIL_EXAMPLES.filter(
    (ex) => ex.methodology.toLowerCase() === methodologyName.toLowerCase()
  );
}

/**
 * Format examples as a prompt-ready string for few-shot injection.
 */
export function formatExamplesForPrompt(examples: EmailExample[]): string {
  if (examples.length === 0) return "";

  return `\n\n<golden_examples>
${examples.map((ex, i) => `<example_${i + 1}>
CONTEXT: ${ex.context}
SIGNAL: ${ex.signalType}
SENIORITY: ${ex.seniority}

Subject: ${ex.subject}
Body:
${ex.body}

WHY THIS WORKS: ${ex.whyItWorks}
</example_${i + 1}>`).join("\n\n")}
</golden_examples>

Study these examples carefully. Your emails should match this quality — specific, concise, research-grounded, with a clear value exchange. Never produce generic templates.`;
}
