import type { StrategyType } from "@/lib/campaign-engine/types";

export const PLAYBOOK_PROMPTS: Partial<Record<StrategyType, string>> = {
  warm_intro: `STRATEGY GUIDANCE (Warm Intro):
- First email should go to the CONNECTOR, not the prospect directly
- Draft a short, forwardable message the connector can send
- If connector hasn't responded in 3 days, nudge once
- After 7 days without forward, switch to a cold approach`,

  trigger_based: `STRATEGY GUIDANCE (Trigger-Based):
- Reference the specific trigger signal in the first sentence
- Speed matters: the closer to the event, the more credible
- Don't explain the trigger at length — they know what happened
- Connect the trigger to a specific pain it creates that you solve`,

  smykm: `STRATEGY GUIDANCE (Show Me You Know Me):
- First sentence MUST cite something specific about the PERSON (not company)
- A LinkedIn post, a talk, a public comment — something only THEY said
- Bridge: "That resonates because..." or "I've been thinking about X since your post on..."
- CTA: soft question, NOT a meeting ask
- Max 65 words. 4-5 sentences. Plain text.`,

  displacement: `STRATEGY GUIDANCE (Competitive Displacement):
- NEVER trash the competitor by name in a negative way
- Frame as: "Companies at your stage often hit [limitation] with [Competitor]"
- Ask a diagnostic question: "Is that your experience too?"
- Offer one specific differentiator, not a feature list
- If they confirm the pain, offer a comparison/demo`,

  value_first: `STRATEGY GUIDANCE (Value-First / Hormozi):
- First email delivers something VALUABLE with ZERO ask
- "Here's [analysis/insight/benchmark] specific to your situation"
- Second email: "Did that resonate? Happy to go deeper"
- Third email (if engaged): "Easiest way to explore this is a quick call"
- The value must be genuinely useful, not a thinly-veiled pitch`,

  social_first: `STRATEGY GUIDANCE (Social-First):
- DO NOT email first. This strategy assumes LinkedIn engagement happened already.
- Email should reference the LinkedIn interaction: "We connected on LinkedIn around [topic]"
- Treat the email as a continuation of an existing conversation
- Much warmer tone than cold — they already know your name`,

  multi_thread: `STRATEGY GUIDANCE (Multi-Thread / Buying Committee):
- Different messages for different personas:
  - Champion (user-level): value-first, light, "want to try this?"
  - Economic buyer (VP/C): ROI-focused, concise, executive tone
  - Technical evaluator: specs, integrations, security
- Coordinate: don't email the VP until the champion has engaged
- Never send the same message to two people at the same company`,

  re_engagement: `STRATEGY GUIDANCE (Re-Engagement):
- Arrive with something NEW: a product update, a new case study, a market shift
- Reference the previous conversation: "Last time we spoke, the timing wasn't right"
- Connect the new thing to why timing might be better now
- Shorter and lighter than a first-touch email`,

  event_triggered: `STRATEGY GUIDANCE (Event/Inbound Triggered):
- The prospect came to US (website visit, content download, etc.)
- Speed is critical: respond within minutes if possible
- Reference what they looked at: "Noticed you checked out [page]"
- Offer to shortcut their research: "Want me to show you the relevant bits?"
- Higher confidence = more direct CTA`,

  long_game: `STRATEGY GUIDANCE (Long Game / Nurture):
- ONE touch per month maximum
- NEVER pitch. Every touch delivers standalone value:
  - Month 1: industry insight
  - Month 2: useful connection or resource
  - Month 3: relevant content you created
  - Month 4+: keep nurturing until a signal triggers a strategy upgrade
- Space emails 3-4 weeks apart`,
};
