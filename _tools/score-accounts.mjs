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
  "SELECT id, name, domain, industry, size, revenue, description FROM companies WHERE score IS NULL AND industry IS NOT NULL AND industry != '' AND industry != 'Unknown' LIMIT 20"
);

console.log("Scoring", accounts.length, "accounts...");

for (const a of accounts) {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Score this company 0-100 as a B2B SaaS customer prospect. Return JSON only: {"score":N,"reasons":["reason1","reason2"]}\n\nCompany: ${a.name}\nDomain: ${a.domain || "unknown"}\nIndustry: ${a.industry}\nSize: ${a.size || "unknown"}\nRevenue: ${a.revenue || "unknown"}\nDescription: ${a.description || "none"}\n\nScore higher for: tech companies, AI/SaaS, well-funded startups, 10-500 employees, $1M-$100M revenue.\nScore lower for: consumer businesses, very small or very large, unclear business.`
      }]
    });

    const text = msg.content[0].text;
    const data = JSON.parse(text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());

    await client.query(
      "UPDATE companies SET score = $1, score_reasons = $2, updated_at = NOW() WHERE id = $3",
      [data.score, JSON.stringify(data.reasons), a.id]
    );

    const grade = data.score >= 80 ? "A" : data.score >= 60 ? "B" : data.score >= 40 ? "C" : data.score >= 20 ? "D" : "F";
    console.log("OK", a.name, "->", grade, data.score, data.reasons.join("; "));
  } catch (err) {
    console.error("FAIL", a.name, err.message?.slice(0, 100));
  }
}

await client.end();
console.log("Done!");
