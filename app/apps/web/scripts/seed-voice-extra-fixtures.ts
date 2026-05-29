/**
 * Seed extra voice-test fixtures: DNC entries + a hot lead with
 * synthetic email engagement so the full pipeline can be tested
 * end-to-end (hot signal → /insights/hot-to-call → click Call →
 * Twilio dial).
 *
 * Companion to seed-voice-test-fixtures.ts (which does the basic
 * phone-pool + echo-test contact). Run THIS one second.
 *
 * What it seeds:
 *
 *   1. do_not_call_list — a few entries so you can verify:
 *      - global DNC (tenant_id=NULL) — applies to every tenant
 *      - tenant-scoped DNC — only this tenant
 *      - a number you'll deliberately try to call (proves the gate)
 *
 *   2. A "Test Hot Lead" contact + two synthetic outbound_emails
 *      rows pre-populated with openedAt + clickedAt timestamps. The
 *      hot-to-call endpoint sums those into a high hotness score,
 *      so the contact lands at the top of /insights/hot-to-call
 *      immediately — no need to wait for a real email to be opened.
 *
 * Idempotent. Edit the CONSTANTS block before first run.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/seed-voice-extra-fixtures.ts
 */

import postgres from "postgres";

// ────────────────────────────────────────────────────────────
// EDIT THESE BEFORE FIRST RUN
// ────────────────────────────────────────────────────────────

/** Email of the existing user whose tenant we seed into. */
const USER_EMAIL = "martin@elevay.dev";

/** Numbers you want on the DNC list. Two flavours:
 *   - { scope: "global" } → applies to every tenant (e.g. a known
 *     bot or harassed number you never want anyone to dial)
 *   - { scope: "tenant" } → only this tenant
 *
 * Replace the placeholders with real numbers (E.164). Re-runs skip
 * duplicates via the (tenant_id, phone_number) unique index.
 */
const DNC_ENTRIES: Array<{
  phone: string;
  reason: string;
  scope: "global" | "tenant";
  source?: string;
}> = [
  // Sample shape — replace with real numbers before running, OR
  // delete the entry if you just want the hot-lead seed below.
  {
    phone: "+33199999999",
    reason: "Test DNC entry — tenant-scoped",
    scope: "tenant",
    source: "manual",
  },
  {
    phone: "+33198888888",
    reason: "Test DNC entry — global",
    scope: "global",
    source: "manual",
  },
];

/** Hot lead contact — should appear at the top of /insights/hot-to-call
 *  with hotness ~50 (one click in the speed window scores 10×5 = 50). */
const HOT_LEAD_FIRST = "Hot";
const HOT_LEAD_LAST = "Lead Test";
const HOT_LEAD_EMAIL = "hot.lead@example.com";

/** Phone the softphone dials when you click Call on the hot lead. Use
 *  a number you control so you can pick up. Different from the basic
 *  echo-test contact in the first fixtures script — handy if you want
 *  to keep two parallel test prospects. */
const HOT_LEAD_PHONE = "+33xxxxxxxxx"; // TODO replace

/** Synthetic email signals to attribute to the hot lead. Edit the
 *  ageMinutes to control where on the hot-to-call recency curve the
 *  signal lands (< 5 min = speed window = red badge). */
const HOT_LEAD_SIGNALS: Array<{
  kind: "open" | "click";
  ageMinutes: number;
  subject: string;
}> = [
  // Fresh click in the 5-min speed window
  {
    kind: "click",
    ageMinutes: 2,
    subject: "Pricing page CTA",
  },
  // An open a bit earlier (still in the 1h band)
  {
    kind: "open",
    ageMinutes: 45,
    subject: "Onboarding intro",
  },
];

// ────────────────────────────────────────────────────────────
// SCRIPT
// ────────────────────────────────────────────────────────────

function preflightFail(msg: string): never {
  console.error(`\n[FAIL] ${msg}\n`);
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) preflightFail("DATABASE_URL is required");

  if (HOT_LEAD_PHONE.includes("xxxx")) {
    preflightFail(
      "Edit HOT_LEAD_PHONE at the top of the script — use a number you can pick up on.",
    );
  }

  const sql = postgres(url!, { max: 1 });

  console.log("\n=== 1. Look up user + tenant ===");
  const [user] = await sql<
    Array<{ id: string; tenant_id: string }>
  >`SELECT id, tenant_id FROM users WHERE email = ${USER_EMAIL} LIMIT 1`;
  if (!user) {
    await sql.end();
    preflightFail(`User ${USER_EMAIL} not found in 'users' table.`);
  }
  console.log(`  [OK] user.id     = ${user.id}`);
  console.log(`       tenant.id   = ${user.tenant_id}`);

  console.log("\n=== 2. DNC entries ===");
  let dncInserted = 0;
  let dncSkipped = 0;
  for (const entry of DNC_ENTRIES) {
    const tenantSlot = entry.scope === "global" ? null : user.tenant_id;
    const result = await sql<
      Array<{ id: string }>
    >`
      INSERT INTO do_not_call_list (id, tenant_id, phone_number, reason, source, added_at)
      VALUES (
        gen_random_uuid()::text,
        ${tenantSlot},
        ${entry.phone},
        ${entry.reason},
        ${entry.source ?? "manual"},
        NOW()
      )
      ON CONFLICT (tenant_id, phone_number) DO NOTHING
      RETURNING id
    `;
    if (result.length > 0) {
      console.log(
        `  [OK]  ${entry.phone}  (${entry.scope})  — ${entry.reason}`,
      );
      dncInserted++;
    } else {
      console.log(
        `  [--]  ${entry.phone}  (${entry.scope})  — already on DNC`,
      );
      dncSkipped++;
    }
  }
  console.log(`  Total: ${dncInserted} inserted, ${dncSkipped} already present`);

  console.log("\n=== 3. Hot Lead contact ===");
  const [existingHotLead] = await sql<
    Array<{ id: string }>
  >`SELECT id FROM contacts WHERE tenant_id = ${user.tenant_id} AND email = ${HOT_LEAD_EMAIL} LIMIT 1`;

  let hotLeadId: string;
  let hotLeadInserted = false;
  if (existingHotLead) {
    hotLeadId = existingHotLead.id;
    console.log(`  [--] contact.${hotLeadId} (already existed)`);
  } else {
    const [created] = await sql<
      Array<{ id: string }>
    >`
      INSERT INTO contacts (
        id, tenant_id, first_name, last_name, email, phone,
        owner_id, score, created_at, updated_at
      )
      VALUES (
        gen_random_uuid()::text,
        ${user.tenant_id},
        ${HOT_LEAD_FIRST},
        ${HOT_LEAD_LAST},
        ${HOT_LEAD_EMAIL},
        ${HOT_LEAD_PHONE},
        ${user.id},
        0.95,
        NOW(), NOW()
      )
      RETURNING id
    `;
    hotLeadId = created.id;
    hotLeadInserted = true;
    console.log(`  [OK] contact.${hotLeadId} (created)`);
  }
  console.log(
    `       ${HOT_LEAD_FIRST} ${HOT_LEAD_LAST} · ${HOT_LEAD_EMAIL} · ${HOT_LEAD_PHONE}`,
  );

  console.log("\n=== 4. Synthetic email signals (opened/clicked) ===");
  let signalsInserted = 0;
  let signalsSkipped = 0;
  for (const signal of HOT_LEAD_SIGNALS) {
    const signalAt = new Date(Date.now() - signal.ageMinutes * 60 * 1000);
    const dedupKey = `seed:hot-lead:${signal.kind}:${signal.subject}`;
    const [existing] = await sql<
      Array<{ id: string }>
    >`SELECT id FROM outbound_emails WHERE tenant_id = ${user.tenant_id} AND message_id = ${dedupKey} LIMIT 1`;

    if (existing) {
      signalsSkipped++;
      console.log(
        `  [--] ${signal.kind} "${signal.subject}" — already seeded`,
      );
      continue;
    }

    await sql`
      INSERT INTO outbound_emails (
        id, tenant_id, contact_id, from_address, to_address,
        subject, body_html, body_text, message_id,
        status, queued_at, sent_at, opened_at, clicked_at,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid()::text,
        ${user.tenant_id},
        ${hotLeadId},
        'seed@elevay.dev',
        ${HOT_LEAD_EMAIL},
        ${signal.subject},
        ${`<p>${signal.subject}</p>`},
        ${signal.subject},
        ${dedupKey},
        'sent',
        ${signalAt},
        ${signalAt},
        ${signalAt},
        ${signal.kind === "click" ? signalAt : null},
        NOW(), NOW()
      )
    `;
    signalsInserted++;
    console.log(
      `  [OK] ${signal.kind} "${signal.subject}" · ${signal.ageMinutes} min ago`,
    );
  }
  console.log(
    `  Total: ${signalsInserted} inserted, ${signalsSkipped} already present`,
  );

  console.log("\n=== Ready to verify ===");
  console.log("  curl '/api/dashboard/hot-to-call?hours=24' (signed-in)");
  console.log(`  → "Hot Lead Test" should appear with hotness ~50 (click in speed window) + ~3 (open at 45min)`);
  console.log(`  → Speed-window red badge if your fresh click is < 5 min old`);
  console.log("");
  console.log("  /insights/hot-to-call → click Call on Hot Lead Test");
  console.log("  → /api/calls/dnc check: passes (HOT_LEAD_PHONE not on DNC)");
  console.log("  → softphone dials your number");
  console.log("");
  console.log("  Sanity for DNC gate:");
  console.log(
    `  POST /api/calls/start with a contactId tied to phone="${DNC_ENTRIES[0]?.phone ?? "<a DNC number>"}"`,
  );
  console.log("  → 409 { code: 'dnc' }");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
