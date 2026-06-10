/**
 * Hostile UI evaluation of the inbox-triage page (Phase 6).
 *
 * Runs its OWN chromium instance via the playwright npm lib (never the
 * shared Playwright MCP profile), against a dev server given by BASE_URL.
 * Seeds a disposable "E2E " tenant + user, mints a NextAuth session cookie
 * for it, walks the UI hostile-QA style with screenshots, then hard-cleans
 * the tenant.
 *
 * Env: DATABASE_URL, AUTH_SECRET, BASE_URL (e.g. http://localhost:3017),
 *      SHOTS_DIR (screenshot output dir)
 */
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { db } from "../src/db";
import { tenants, users, contacts, activities, outboundEmails, inboxTriage } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = process.env.BASE_URL || "http://localhost:3017";
const SHOTS = process.env.SHOTS_DIR || "screenshots/inbox-eval";
const H = 3600_000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H);

let failures = 0;
let step = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  // ── Seed tenant + user + conversations ──
  const [tenant] = await db.insert(tenants).values({ name: "E2E Inbox UI Eval", plan: "trial" }).returning({ id: tenants.id });
  const tid = tenant.id;
  const [user] = await db
    .insert(users)
    .values({ clerkId: `e2e-inbox-eval-${tid}`, tenantId: tid, email: "e2e-inbox@elevay.dev", firstName: "Eval", lastName: "Bot", role: "admin" })
    .returning({ id: users.id });
  console.log(`seeded tenant ${tid} user ${user.id}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const [alice] = await db.insert(contacts).values({ tenantId: tid, firstName: "Alice", lastName: "Hot", email: "alice@e2e.test" }).returning({ id: contacts.id });
    const [bob] = await db.insert(contacts).values({ tenantId: tid, firstName: "Bob", lastName: "Ooo", email: "bob@e2e.test" }).returning({ id: contacts.id });

    // Thread A: sent + meeting-request reply + intelligence + a prepared draft
    await db.insert(outboundEmails).values({
      tenantId: tid, contactId: alice.id, threadId: "e2e-ui-a", stepNumber: 1,
      fromAddress: "me@elevay.dev", toAddress: "alice@e2e.test",
      subject: "Elevay <> Acme", bodyHtml: "<p>x</p>", bodyText: "Bonjour Alice, je vous contacte car votre equipe grandit.",
      status: "sent", sentAt: at(30), repliedAt: at(2), replySnippet: "oui appelez-moi",
      replyClassification: "meeting_request",
    });
    await db.insert(activities).values({
      tenantId: tid, actorType: "contact", actorId: alice.id, entityType: "contact", entityId: alice.id,
      activityType: "email_received", channel: "email", direction: "inbound",
      occurredAt: at(2), summary: "Re: Elevay <> Acme",
      rawContent: "Oui, appelez-moi demain matin a 9h.\nQuel est votre prix pour 10 sieges ?\n\nAlice",
      sentiment: "positive", intent: ["interested", "question"], threadId: "e2e-ui-a",
      metadata: {
        from: "alice@e2e.test", to: "me@elevay.dev",
        threadIntelligence: {
          threadId: "e2e-ui-a",
          signals: [{ type: "timeline", evidence: "appelez-moi demain matin a 9h", confidence: 0.9 }],
          competitors: ["FuseAI"], sentiment: "positive", sentimentTrend: "improving",
          objections: [{ category: "pricing", summary: "Veut le prix pour 10 sieges", status: "unresolved" }],
          nextSteps: ["Appel demain 9h"], urgencyLevel: "high",
          extractedAt: new Date().toISOString(),
        },
      },
    });
    await db.insert(outboundEmails).values({
      tenantId: tid, contactId: alice.id, threadId: "e2e-ui-a", stepNumber: 101,
      fromAddress: "pending@rotation", toAddress: "alice@e2e.test",
      subject: "Re: Elevay <> Acme", bodyHtml: "<p>d</p>", bodyText: "Bonjour Alice, parfait pour demain 9h. Pour 10 sieges, voici le detail...",
      status: "draft",
    });

    // Thread B: out-of-office → handled
    await db.insert(activities).values({
      tenantId: tid, actorType: "contact", actorId: bob.id, entityType: "contact", entityId: bob.id,
      activityType: "email_received", channel: "email", direction: "inbound",
      occurredAt: at(5), summary: "Absence du bureau", rawContent: "Je suis absent jusqu'au 20 juin.",
      sentiment: "neutral", intent: ["out_of_office"], threadId: "e2e-ui-b",
      metadata: { from: "bob@e2e.test", to: "me@elevay.dev" },
    });

    // Thread C: neutral question
    await db.insert(activities).values({
      tenantId: tid, actorType: "contact", actorId: bob.id, entityType: "contact", entityId: bob.id,
      activityType: "email_received", channel: "email", direction: "inbound",
      occurredAt: at(1), summary: "Question sur la documentation", rawContent: "Ou trouver la doc API ?",
      sentiment: "neutral", intent: ["question"], threadId: "e2e-ui-c",
      metadata: { from: "bob@e2e.test", to: "me@elevay.dev" },
    });

    // ── Mint session cookie (http → plain cookie name + salt) ──
    const jwt = await encode({
      token: { id: user.id, sub: user.id, tenantId: tid, appUserId: user.id, role: "admin", name: "Eval Bot", email: "e2e-inbox@elevay.dev" },
      secret: process.env.AUTH_SECRET!,
      salt: "authjs.session-token",
      maxAge: 8 * 3600,
    });

    // Debug: hit the API directly with the minted cookie before the UI does.
    const apiProbe = await fetch(`${BASE}/api/inbox/conversations?lane=attention`, {
      headers: { cookie: `authjs.session-token=${await encode({ token: { id: user.id, sub: user.id, tenantId: tid, appUserId: user.id, role: "admin", name: "Eval Bot", email: "e2e-inbox@elevay.dev" }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 28800 })}` },
    });
    console.log(`API probe: ${apiProbe.status} ${(await apiProbe.text()).slice(0, 300)}`);

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const url = new URL(BASE);
    await ctx.addCookies([{ name: "authjs.session-token", value: jwt, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console.log(`BROWSER ${m.type()}: ${m.text().slice(0, 200)}`);
    });
    page.on("response", (r) => {
      if (r.url().includes("/api/")) console.log(`NET ${r.status()} ${r.url().slice(0, 120)}`);
    });
    const shot = async (name: string) => page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: false });

    // ── 1. Attention lane ──
    // Pre-warm the route compile (first dev hit can exceed page timeouts),
    // then navigate with a lenient wait + explicit anchor on the lane bar.
    await fetch(`${BASE}/inbox`).catch(() => {});
    const waitText = async (text: string, timeout = 30_000) => {
      try {
        await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout });
        return true;
      } catch {
        return false;
      }
    };

    await page.goto(`${BASE}/inbox`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.locator("[data-conversation-key]").first().waitFor({ timeout: 120_000 });
    await shot("attention-lane");
    check("page loads with lanes + rows", true);
    check("attention count is 2", await waitText("Needs attention (2)"));
    check("handled count is 1", await waitText("Handled (1)"));
    check("Alice (meeting_request) listed first", await page.locator("[data-conversation-key]").first().textContent().then((t) => (t ?? "").includes("Alice")));
    // Both labels are bucket-1 and grounded in the seed (intent "interested"
    // + classification "meeting_request"); the stable sort may pick either.
    check("reason line shows a P1 label", (await waitText("Interested", 5_000)) || (await waitText("Meeting request", 5_000)));

    // ── 2. Reading pane: full body + intelligence + prepared draft ──
    await page.locator("[data-conversation-key]").first().click();
    check("outbound step message visible (thread joined)", await waitText("je vous contacte car votre equipe grandit", 60_000));
    await shot("reading-pane-alice");
    const paneText = (await page.textContent("body")) ?? "";
    check("full inbound body visible (multi-line, no clamp)", paneText.includes("Quel est votre prix pour 10 sieges"));
    check("intelligence section with evidence quote", paneText.includes("What this thread tells us") && paneText.includes("appelez-moi demain matin a 9h"));
    check("unresolved objection shown", paneText.includes("pricing") && paneText.includes("unresolved"));
    check("prepared reply card shown", paneText.includes("Prepared reply") && paneText.includes("parfait pour demain 9h"));
    check("high urgency chip", paneText.includes("High urgency"));
    check("contact link to /contacts/", await page.locator(`a[href="/contacts/${alice.id}"]`).count().then((n) => n > 0));

    // ── 3. Done verb ──
    await page.getByRole("button", { name: "Done", exact: true }).first().click();
    check("attention count decremented", await waitText("Needs attention (1)"));
    check("done count incremented", await waitText("Done (1)"));
    await shot("after-done");
    check("done removes Alice from attention", !((await page.locator("[data-conversation-key]").allTextContents()).join(" ").includes("Alice")));

    // ── 4. Done lane + Reopen ──
    const doneProbe = await fetch(`${BASE}/api/inbox/conversations?lane=done`, {
      headers: { cookie: `authjs.session-token=${jwt}` },
    });
    console.log(`done-lane API probe: ${doneProbe.status} ${(await doneProbe.text()).slice(0, 260)}`);
    await page.getByRole("button", { name: /^Done \(/ }).click();
    try {
      await page.locator("[data-conversation-key]").first().waitFor({ timeout: 20_000 });
    } catch {
      await shot("done-lane-EMPTY");
      console.log("DONE LANE BODY:", ((await page.textContent("body")) ?? "").replace(/\s+/g, " ").slice(0, 400));
    }
    await shot("done-lane");
    check("Alice in Done lane", (await page.locator("[data-conversation-key]").allTextContents()).join(" ").includes("Alice"));
    await page.locator("[data-conversation-key]").first().click();
    await page.getByRole("button", { name: "Reopen" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Reopen" }).click();
    check("reopen restores attention count", await waitText("Needs attention (2)"));

    // ── 5. Handled lane shows the agent note ──
    await page.getByRole("button", { name: /^Handled \(/ }).click();
    check("handled lane shows ooo reason", await waitText("Out of office"));
    await shot("handled-lane");

    // ── 6. Outbound tab ──
    await page.getByRole("button", { name: /^Outbound \(/ }).click();
    check("outbound table renders with statuses", (await waitText("Replied", 60_000)) || (await waitText("Sent", 10_000)));
    await shot("outbound-tab");

    // ── 7. Keyboard: back to attention, j moves selection ──
    await page.getByRole("button", { name: /^Needs attention/ }).click();
    await page.locator("[data-conversation-key]").first().waitFor({ timeout: 30_000 });
    await page.keyboard.press("j");
    await page.waitForTimeout(400);
    await shot("keyboard-j");
    check("keyboard j navigates without crash", (await page.locator("[data-conversation-key]").count()) > 0);

    console.log(failures === 0 ? "\nALL UI CHECKS PASSED" : `\n${failures} UI CHECKS FAILED`);
  } finally {
    await browser.close().catch(() => {});
    await db.delete(inboxTriage).where(eq(inboxTriage.tenantId, tid));
    await db.delete(activities).where(eq(activities.tenantId, tid));
    await db.delete(outboundEmails).where(eq(outboundEmails.tenantId, tid));
    await db.delete(contacts).where(eq(contacts.tenantId, tid));
    await db.delete(users).where(eq(users.tenantId, tid));
    await db.delete(tenants).where(eq(tenants.id, tid));
    console.log(`cleaned tenant ${tid}`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("EVAL FAILED:", e);
  process.exit(1);
});
