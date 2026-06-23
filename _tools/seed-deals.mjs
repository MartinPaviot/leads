import pg from "pg";
import crypto from "crypto";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

await client.connect();

// Get some enriched companies to link deals to
const { rows: companies } = await client.query(
  "SELECT id, name FROM companies WHERE industry IS NOT NULL AND industry != '' AND industry != 'Unknown' LIMIT 10"
);

const stages = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"];

const deals = [
  { name: "DataForge Enterprise License", company: 0, stage: "negotiation", value: 45000 },
  { name: "Craft Health API Integration", company: 1, stage: "proposal", value: 28000 },
  { name: "Zenith Cloud Migration Deal", company: 2, stage: "demo", value: 72000 },
  { name: "Vortex AI Platform Expansion", company: 3, stage: "trial", value: 120000 },
  { name: "StackPilot Starter Plan", company: 4, stage: "won", value: 9600 },
  { name: "Pulsar Data Analytics Suite", company: 5, stage: "qualification", value: 35000 },
  { name: "Helio SaaS Integration", company: 6, stage: "lead", value: 15000 },
  { name: "AI Bridge Consulting Retainer", company: 8, stage: "proposal", value: 60000 },
  { name: "AfriPay Payment Gateway", company: 9, stage: "demo", value: 42000 },
  { name: "SmartGrid IoT Platform", company: 7, stage: "negotiation", value: 95000 },
];

console.log("Creating", deals.length, "deals...");

for (const deal of deals) {
  const company = companies[deal.company];
  if (!company) continue;

  const id = crypto.randomUUID();
  const daysAgo = Math.floor(Math.random() * 30);
  await client.query(
    `INSERT INTO deals (id, tenant_id, name, stage, value, company_id, created_at, updated_at)
     VALUES ($1, 'default', $2, $3, $4, $5, NOW() - interval '${daysAgo} days', NOW())`,
    [id, deal.name, deal.stage, deal.value, company.id]
  );
  console.log("OK", deal.name, "->", deal.stage, "$" + deal.value.toLocaleString(), "(", company.name, ")");
}

await client.end();
console.log("Done! Pipeline value: $" + deals.reduce((s, d) => s + d.value, 0).toLocaleString());
