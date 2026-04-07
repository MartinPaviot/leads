/**
 * Shared Prompt Rules — Constants used across all LLM agents.
 *
 * Per Anthropic best practices:
 * - Use XML tags for structure
 * - Be specific about what NOT to do
 * - Provide measurable quality criteria
 */

/**
 * Anti-hallucination rules to include in any prompt that generates
 * factual claims or references external data.
 */
export const ANTI_HALLUCINATION_RULES = `<anti_hallucination>
- ONLY reference information explicitly provided in the context above
- If data is missing, say so clearly — never fill gaps with plausible-sounding content
- Never invent company names, contact names, metrics, dates, or URLs
- When uncertain about a fact, qualify it: "Based on the available data..."
- Distinguish between "not mentioned" (data wasn't provided) and "confirmed absent" (explicitly stated as none/zero)
</anti_hallucination>`;

/**
 * Output quality rubric — measurable criteria for any generated content.
 * Adapt per use case by selecting relevant dimensions.
 */
export const QUALITY_RUBRIC = {
  personalization: `Personalization (weight: high): Every piece of content must reference specific facts about the recipient — their name, company, role, industry, or recent signals. Generic content that could apply to anyone scores 0.`,

  conciseness: `Conciseness (weight: medium): Say what needs to be said, then stop. No filler phrases, no unnecessary preamble. Every sentence must earn its place.`,

  actionability: `Actionability (weight: high): End with a clear, specific next step. Vague CTAs like "let me know what you think" score 0. Good CTAs propose a concrete action with a timeframe.`,

  tone: `Tone (weight: medium): Match the specified tone exactly. Professional ≠ formal. Direct ≠ aggressive. Casual ≠ sloppy. The reader should feel addressed by a knowledgeable peer, not a bot.`,

  evidence: `Evidence (weight: high): Every claim must be grounded in provided data. No generic statistics ("80% of companies..."). Only cite numbers from the context or well-known public data.`,
};

/**
 * Format quality dimensions for injection into a prompt.
 */
export function formatQualityRubric(dimensions: (keyof typeof QUALITY_RUBRIC)[]): string {
  const rules = dimensions.map((d) => QUALITY_RUBRIC[d]);
  return `<quality_criteria>\n${rules.join("\n\n")}\n</quality_criteria>`;
}

/**
 * Common email generation rules shared across all email-producing agents.
 */
export const EMAIL_RULES = `<email_rules>
- Plain text only — no HTML formatting, no bullet points, no bold/italic
- Never start with "I hope this finds you well", "I noticed that", "Just wanted to", "I'd love to"
- Never start with your name or company — start with THEIR world
- No exclamation marks (!!!) — ever
- Subject lines: 3-6 words, lowercase ok, no clickbait, no "[First name],"
- Match the language of the recipient's location (English for US/UK, French for France)
- Each email in a sequence must have a DIFFERENT angle — never repeat the same value prop
</email_rules>`;

/**
 * Instructions for when the model should use extended thinking.
 */
export const THINKING_INSTRUCTIONS = `<thinking>
Before generating your response, reason through the following:
1. What specific data points from the context are most relevant?
2. What is the recipient's likely mindset given their role and signals?
3. What angle would be most compelling and why?
4. What should I NOT include (already said, irrelevant, too generic)?
Take your time — quality matters more than speed.
</thinking>`;
