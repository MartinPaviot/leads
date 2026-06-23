import Anthropic from "@anthropic-ai/sdk";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

await client.connect();

const { rows: accounts } = await client.query(
  "SELECT id, name, domain FROM companies WHERE industry IS NULL OR industry = '' ORDER BY created_at LIMIT 15"
);

console.log("Enriching", accounts.length, "accounts...");

for (const acct of accounts) {
  try {
    const domainHint = acct.domain ? ` (domain: ${acct.domain})` : "";
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Research the company "${acct.name}"${domainHint}.\nReturn a JSON object with these fields:\n- industry: Primary industry (e.g. Fintech, SaaS, AI/ML, Healthcare, DevTools)\n- description: 1-2 sentence company description\n- size: Employee count range (e.g. 1-10, 11-50, 51-200, 201-500)\n- revenue: Estimated annual revenue (e.g. <$1M, $1M-$10M, $10M-$50M)\n- domain: Best guess domain if unknown\n\nONLY return the JSON object, no markdown.`
      }]
    });

    const text = msg.content[0].text;
    const data = JSON.parse(text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());

    await client.query(
      "UPDATE companies SET industry = $1, description = $2, size = $3, revenue = $4, domain = COALESCE(NULLIF(domain, ''), $5), updated_at = NOW() WHERE id = $6",
      [data.industry, data.description, data.size, data.revenue, data.domain || null, acct.id]
    );

    console.log("OK", acct.name, "->", data.industry, "|", data.size, "|", data.revenue);
  } catch (err) {
    console.error("FAIL", acct.name, err.message?.slice(0, 100));
  }
}

await client.end();
console.log("Done!");
