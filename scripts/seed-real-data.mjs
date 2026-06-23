/**
 * Seed the Elevay DB with real email + calendar data from contact@elevay.app
 * Run: node scripts/seed-real-data.mjs
 */
import pg from "pg";
import crypto from "crypto";
const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const OWNER_EMAIL = "contact@elevay.app";

const IGNORED_DOMAINS = new Set([
  "mail.instagram.com",
  "instagram.com",
  "google.com",
  "notifications.hubspot.com",
]);

const emails = [
  { date: "2026-04-30T11:04:55Z", from: "hello@apify.com", fromName: "Apify", subject: "First $1M month to creators + big redesign to MCP Configurator", snippet: "Apify April updates — creators hit $1M in payouts, redesigned MCP Configurator, in-run email verification, interactive API docs for standby Actors." },
  { date: "2026-04-30T08:11:44Z", from: "hubspotfrance@hubspot.com", fromName: "HubSpot France", subject: "Martin, consultez le rapport personnalisé de vos 30 premiers jours d'utilisation", snippet: "Découvrez quels indicateurs vous avez fait progresser grâce à HubSpot après un mois d'utilisation." },
  { date: "2026-04-29T17:19:03Z", from: "team@mg.dataforseo.io", fromName: "DataForSEO", subject: "Is AI talking behind your back?", snippet: "Peek behind the curtain of ChatGPT, Claude, and Gemini with our new free AI Visibility Tracker." },
  { date: "2026-04-28T08:38:06Z", from: "hello@qonto.com", fromName: "Qonto", subject: "Qonto AI est là. Par où commencer ?", snippet: "Deux agents IA dans votre compte. Voilà ce qu'ils font pour vous." },
  { date: "2026-04-28T07:11:11Z", from: "Sofia@hubspot.com", fromName: "Sofia (HubSpot)", subject: "Atteignez vos objectifs grâce à HubSpot - accès gratuit aux versions premium", snippet: "Il semblerait que vous n'ayez pas encore exploité tout le potentiel de HubSpot." },
  { date: "2026-04-24T06:31:54Z", from: "zeno@updates.resend.com", fromName: "Zeno (Resend)", subject: "Automations, Open Source Editor, Resend CLI 2.0, and more", snippet: "Explore our latest features and announcements from Launch Week 6." },
  { date: "2026-04-24T06:24:25Z", from: "workspace-noreply@google.com", fromName: "Google Workspace", subject: "Compte Workspace : corrigez les problèmes de sécurité potentiels", snippet: "Nous avons détecté des failles de sécurité dans votre organisation." },
  { date: "2026-04-23T14:02:20Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Get the Free Calendly guide!", snippet: "Check out our guide to maximizing your free Calendly account." },
  { date: "2026-04-23T12:20:02Z", from: "hello@qonto.com", fromName: "Qonto", subject: "Découvrez la carte Mirror", snippet: "1% de cashback, 0% de frais de change, 400 000 €/mois de dépenses." },
  { date: "2026-04-23T03:14:10Z", from: "CloudPlatform-noreply@google.com", fromName: "Google Cloud", subject: "[Product Update] Vertex AI Platform into the Gemini AI Platform", snippet: "Name update for Vertex AI and Data and Analytics products starting Apr 22, 2026." },
  { date: "2026-04-23T02:09:48Z", from: "workspace-noreply@google.com", fromName: "Google Workspace", subject: "[Product Update] New Workspace Intelligence admin controls", snippet: "Review new Workspace Intelligence features and admin settings." },
  { date: "2026-04-22T19:11:38Z", from: "hello@apify.com", fromName: "Apify", subject: "Custom limit for Maximum platform usage per month expired", snippet: "Your maximum platform usage per month custom limit has expired." },
  { date: "2026-04-22T12:56:25Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Martin, your free trial has ended.", snippet: "Your 14-day trial may have ended, but your journey with Calendly is just getting started." },
  { date: "2026-04-21T07:01:32Z", from: "hello@qonto.com", fromName: "Qonto", subject: "Acceptez les paiements par carte plus rapidement", snippet: "Gagnez des heures sur la réconciliation." },
  { date: "2026-04-20T14:10:28Z", from: "noreply@notifications.hubspot.com", fromName: "HubSpot", subject: "Prenez des mesures pour sécuriser l'accès à votre compte HubSpot", snippet: "Le compte HubSpot est protégé par la double authentification (2FA)." },
  { date: "2026-04-20T11:00:06Z", from: "hello@qonto.com", fromName: "Qonto", subject: "Vos virements internationaux en 24h", snippet: "Profitez de virements rapides et sécurisés dans +30 devises." },
  { date: "2026-04-19T12:03:33Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Your trial is almost over", snippet: "Don't miss out on premium features." },
  { date: "2026-04-18T02:36:26Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Get next steps scheduled fast with automated follow-ups", snippet: "Send post-meeting emails like follow-ups with Calendly Workflows." },
  { date: "2026-04-17T06:32:03Z", from: "domiciliation-paris@email.legalplace.fr", fromName: "LegalPlace", subject: "Vous avez du courrier !", snippet: "Nous avons le plaisir de vous adresser votre courrier du jour scanné." },
  { date: "2026-04-16T05:32:02Z", from: "yevhen.tishchenko@dataforseo.com", fromName: "Yevhen Tishchenko", subject: "Still thinking it over, Martin Paviot?", snippet: "A gift inside is waiting for you!" },
  { date: "2026-04-16T02:36:12Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Enhance your workflows with essential integrations", snippet: "Connect payment platforms, CRMs, and calendars." },
  { date: "2026-04-15T19:12:43Z", from: "hello@apify.com", fromName: "Apify", subject: "Custom limit will expire soon", snippet: "Your Maximum platform usage per month custom limit is expiring in 6 days." },
  { date: "2026-04-15T08:32:03Z", from: "hello@qonto.com", fromName: "Qonto", subject: "Payez en ligne avec votre carte Qonto", snippet: "Payer les outils et services indispensables à votre entreprise." },
  { date: "2026-04-14T12:08:17Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "7 days left in your trial! See your scheduling progress", snippet: "See what you've already accomplished." },
  { date: "2026-04-14T09:23:33Z", from: "hello@qonto.com", fromName: "Qonto", subject: "Nouveau en Avril sur votre compte", snippet: "Découvert, carte à débit différé: gérez votre trésorerie sereinement." },
  { date: "2026-04-14T02:36:06Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Get one-click scheduling with the Calendly Extension!", snippet: "Unlock seamless scheduling and instant accessibility." },
  { date: "2026-04-13T13:07:14Z", from: "paul@email.upfluence.com", fromName: "Paul (Upfluence)", subject: "Ombeline, dernière chance", snippet: "Je ne veux pas prendre trop de place dans votre boîte mail, alors je voulais voir une dernière fois si vous étiez toujours intéressé par une démo d'Upfluence." },
  { date: "2026-04-13T07:40:21Z", from: "hello@qonto.com", fromName: "Qonto", subject: "Quelle est votre expérience avec Qonto ?", snippet: "Votre témoignage est précieux: partagez-le sur Trustpilot." },
  { date: "2026-04-12T02:36:05Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Reduce meeting no-shows with less work", snippet: "Automate meeting reminder emails with Calendly Workflows." },
  { date: "2026-04-12T01:06:11Z", from: "support@upstash.com", fromName: "Upstash", subject: "Your inactive Upstash Redis Database has been archived", snippet: "Due to prolonged inactivity, we have archived your database elevay-seo-geo-cache." },
  { date: "2026-04-10T03:25:17Z", from: "domiciliation-paris@email.legalplace.fr", fromName: "LegalPlace", subject: "Vous avez du courrier !", snippet: "Nous avons le plaisir de vous adresser votre courrier du jour scanné." },
  { date: "2026-04-10T02:36:03Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "You've accomplished so much!", snippet: "Keep the momentum going!" },
  { date: "2026-04-09T15:43:24Z", from: "team@mg.dataforseo.io", fromName: "DataForSEO", subject: "DataForSEO Academy is live!", snippet: "Your new home for expert-led training and no-code automation." },
  { date: "2026-04-09T14:00:12Z", from: "paul@email.upfluence.com", fromName: "Paul (Upfluence)", subject: "You x Upfluence", snippet: "Nous n'avons pas encore eu l'occasion de se parler, êtes-vous toujours à la recherche d'une plateforme de marketing d'influence ?" },
  { date: "2026-04-09T02:36:00Z", from: "teamcalendly@send.calendly.com", fromName: "Calendly", subject: "Need a little help?", snippet: "Choose the option that works for you!" },
  { date: "2026-04-09T00:06:34Z", from: "support@upstash.com", fromName: "Upstash", subject: "Upstash Redis Database Inactivity Final Notice", snippet: "This is a final reminder regarding your free plan Database." },
];

const sentEmails = [
  { date: "2026-03-29T02:01:18Z", to: "148134145@bcc.eu1.hubspot.com", subject: "contact@elevay.app is now connected to HubSpot!", snippet: "HubSpot BCC connection email." },
];

const calendarEvents = [
  { date: "2026-04-07T01:00:00+02:00", endDate: "2026-04-07T02:00:00+02:00", summary: "Demo Elevay", meetingLink: "https://meet.google.com/qts-mkfn-cky" },
];

function domainFrom(email) {
  const at = email.indexOf("@");
  if (at < 0) return null;
  let d = email.slice(at + 1).toLowerCase();
  if (d.startsWith("email.")) d = d.slice(6);
  if (d.startsWith("send.")) d = d.slice(5);
  if (d.startsWith("updates.")) d = d.slice(8);
  if (d.startsWith("mg.")) d = d.slice(3);
  return d;
}

async function main() {
  const client = await pool.connect();

  try {
    // Find the elevay.dev tenant (or default)
    const { rows: tenantRows } = await client.query(
      `SELECT id FROM tenants WHERE name = 'elevay.dev' LIMIT 1`
    );
    let tenantId = tenantRows[0]?.id;
    if (!tenantId) {
      const { rows: defRows } = await client.query(
        `SELECT id FROM tenants WHERE id = 'default' LIMIT 1`
      );
      tenantId = defRows[0]?.id || "default";
    }
    console.log(`Tenant: ${tenantId}`);

    // Find user in that tenant
    const { rows: userRows } = await client.query(
      `SELECT id, email FROM users WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const userId = userRows[0]?.id;
    console.log(`User: ${userId} (${userRows[0]?.email})`);

    // Track created companies + contacts
    const companyMap = new Map();
    const contactMap = new Map();

    // Create companies + contacts from unique sender domains
    const senders = new Map();
    for (const e of emails) {
      const domain = domainFrom(e.from);
      if (!domain || IGNORED_DOMAINS.has(domain)) continue;
      if (!senders.has(domain)) {
        senders.set(domain, { email: e.from, name: e.fromName, domain });
      }
    }

    console.log(`\nCreating ${senders.size} companies + contacts...`);

    for (const [domain, info] of senders) {
      // Check if company exists
      const { rows: existing } = await client.query(
        `SELECT id FROM companies WHERE tenant_id = $1 AND domain = $2 LIMIT 1`,
        [tenantId, domain]
      );

      let companyId;
      if (existing.length > 0) {
        companyId = existing[0].id;
        console.log(`  [skip] Company ${domain} already exists`);
      } else {
        companyId = crypto.randomUUID();
        const companyName =
          info.name.replace(/ \(.*\)/, "").replace(/^.+ \(/, "").replace(/\)$/, "") ||
          domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
        await client.query(
          `INSERT INTO companies (id, tenant_id, name, domain, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [companyId, tenantId, companyName, domain]
        );
        console.log(`  [new] Company: ${companyName} (${domain})`);
      }
      companyMap.set(domain, companyId);

      // Check if contact exists
      const { rows: existingContact } = await client.query(
        `SELECT id FROM contacts WHERE tenant_id = $1 AND email = $2 LIMIT 1`,
        [tenantId, info.email]
      );

      let contactId;
      if (existingContact.length > 0) {
        contactId = existingContact[0].id;
      } else {
        contactId = crypto.randomUUID();
        const nameParts = info.name.split(" ");
        await client.query(
          `INSERT INTO contacts (id, tenant_id, first_name, last_name, email, company_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [
            contactId,
            tenantId,
            nameParts[0] || info.name,
            nameParts.slice(1).join(" ") || null,
            info.email,
            companyId,
          ]
        );
        console.log(`  [new] Contact: ${info.name} <${info.email}>`);
      }
      contactMap.set(info.email, contactId);
    }

    // Insert inbound emails as activities
    console.log(`\nInserting ${emails.length} inbound email activities...`);
    let inserted = 0;
    for (const e of emails) {
      const domain = domainFrom(e.from);
      const contactId = contactMap.get(e.from) || "unknown";
      const id = crypto.randomUUID();

      await client.query(
        `INSERT INTO activities
         (id, tenant_id, actor_type, actor_id, entity_type, entity_id, activity_type, channel, direction, occurred_at, summary, raw_content, metadata, created_at)
         VALUES ($1, $2, 'contact', $3, 'contact', $3, 'email_received', 'email', 'inbound', $4, $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [
          id,
          tenantId,
          contactId,
          e.date,
          e.subject,
          e.snippet,
          JSON.stringify({
            from: e.from,
            to: OWNER_EMAIL,
            subject: e.subject,
            gmailMessageId: `seed-${e.date}`,
            source: "gmail-mcp-sync",
          }),
        ]
      );
      inserted++;
    }
    console.log(`  Inserted ${inserted} inbound emails`);

    // Insert sent emails
    console.log(`\nInserting ${sentEmails.length} outbound email activities...`);
    for (const e of sentEmails) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO activities
         (id, tenant_id, actor_type, actor_id, entity_type, entity_id, activity_type, channel, direction, occurred_at, summary, raw_content, metadata, created_at)
         VALUES ($1, $2, 'user', $3, 'contact', 'unknown', 'email_sent', 'email', 'outbound', $4, $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [
          id,
          tenantId,
          userId,
          e.date,
          e.subject,
          e.snippet,
          JSON.stringify({
            from: OWNER_EMAIL,
            to: e.to,
            subject: e.subject,
            source: "gmail-mcp-sync",
          }),
        ]
      );
    }

    // Insert calendar event
    console.log(`\nInserting ${calendarEvents.length} calendar events...`);
    for (const e of calendarEvents) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO activities
         (id, tenant_id, actor_type, actor_id, entity_type, entity_id, activity_type, channel, direction, occurred_at, summary, metadata, created_at)
         VALUES ($1, $2, 'user', $3, 'contact', 'unknown', 'meeting_completed', 'meeting', 'internal', $4, $5, $6, NOW())
         ON CONFLICT DO NOTHING`,
        [
          id,
          tenantId,
          userId,
          e.date,
          e.summary,
          JSON.stringify({
            startTime: e.date,
            endTime: e.endDate,
            meetingLink: e.meetingLink,
            source: "calendar-mcp-sync",
          }),
        ]
      );
    }

    // Summary
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) as c FROM activities WHERE tenant_id = $1`,
      [tenantId]
    );
    const { rows: contactCount } = await client.query(
      `SELECT COUNT(*) as c FROM contacts WHERE tenant_id = $1`,
      [tenantId]
    );
    const { rows: companyCount } = await client.query(
      `SELECT COUNT(*) as c FROM companies WHERE tenant_id = $1`,
      [tenantId]
    );

    console.log(`\n=== DONE ===`);
    console.log(`Activities: ${countRows[0].c}`);
    console.log(`Contacts: ${contactCount[0].c}`);
    console.log(`Companies: ${companyCount[0].c}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
