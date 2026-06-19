/**
 * Demo payloads for the landing's live product surfaces. Shapes mirror the real
 * API responses exactly, so the real components render them unchanged. Served by
 * DemoSurface's fetch interceptor.
 */

const now = Date.now();
const agoMin = (m: number) => new Date(now - m * 60_000).toISOString();

/** GET /api/home/up-next — components/up-next/up-next-view.tsx Payload. */
export const UP_NEXT_DEMO = {
  greeting: "Good morning",
  firstName: "Martin",
  kpis: [
    { key: "pipeline", label: "Pipeline", value: "$148K", sub: null, delta: null },
    { key: "deals", label: "Active deals", value: "9", sub: null, delta: 2 },
    { key: "calls", label: "Calls booked", value: "4", sub: "this week", delta: null },
    { key: "replies", label: "Replies", value: "9", sub: null, delta: 1 },
    { key: "outreach", label: "Outreach", value: "64", sub: "this week", delta: null },
    { key: "winrate", label: "Win rate", value: "38%", sub: null, delta: 5 },
  ],
  actualites: [
    { id: "a1", kind: "reply", title: "Sarah Klein replied", detail: "Re: pricing · Notion", at: agoMin(2), href: null },
    { id: "a2", kind: "meeting_booked", title: "Meeting booked with Figma", detail: "Léa · Thu 10:00", at: agoMin(60), href: null },
    { id: "a3", kind: "deal_won", title: "Vercel — Closed Won", detail: "$44K · nicely done", at: agoMin(120), href: null },
    { id: "a4", kind: "call", title: "Call with Mercury · connected", detail: "Outcome: callback Friday", at: agoMin(180), href: null },
    { id: "a5", kind: "open", title: "Ramp opened your email", detail: "3rd open this week", at: agoMin(240), href: null },
    { id: "a6", kind: "account", title: "12 accounts added", detail: "sourced by Elevay", at: agoMin(300), href: null },
  ],
  todos: [
    { id: "t1", kind: "reply", tone: "reply", title: "Reply to Sarah", subtitle: "pricing", why: "Re: pricing · draft ready", stakes: null, entityId: null, contactId: null, conversationKey: null, toAddress: "sarah@notion.so", href: null },
    { id: "t2", kind: "deal_risk", tone: "risk", title: "Notion at risk", subtitle: null, why: "12 days silent", stakes: "$36K", entityId: null, contactId: null, conversationKey: null, toAddress: null, href: "#" },
    { id: "t3", kind: "meeting", tone: "meeting", title: "Demo with Figma", subtitle: null, why: "Today 2:00 PM · prep ready", stakes: null, entityId: null, contactId: null, conversationKey: null, toAddress: null, href: "#" },
  ],
};

/* GET /api/accounts — accounts/page.tsx Account shape. Geography, LinkedIn, owner
   and source live in `properties` / top-level, exactly as the real API returns. */
const agoDay = (d: number) => new Date(now - d * 86_400_000).toISOString();
type AcctIn = [id: string, name: string, domain: string, industry: string, city: string, country: string, size: string, revenue: string, desc: string, score: number | null, stage: string, last: [number, string] | null, owner: string | null];
const A = (i: AcctIn) => {
  const [id, name, domain, industry, city, country, size, revenue, description, score, lifecycleStage, last, owner] = i;
  const [ownerFirst, ownerLast] = owner ? owner.split(" ") : [null, null];
  return {
    id, name, domain, industry, size, revenue, description, score, scoreReasons: null as string[] | null,
    lifecycleStage,
    lastInteraction: last ? { date: agoDay(last[0]), summary: last[1] } : null,
    ownerFirstName: ownerFirst, ownerLastName: ownerLast,
    properties: { linkedinUrl: `https://www.linkedin.com/company/${id}`, city, country, source: lifecycleStage === "new" || lifecycleStage === "nurture" ? "tam" : "manual" },
  };
};
const ACCOUNTS = ([
  ["linear", "Linear", "linear.app", "computer software", "San Francisco", "United States", "180", "$48M", "Issue tracking for software teams", 94, "customer", [2, "Renewal call"], "Martin Paviot"],
  ["notion", "Notion", "notion.so", "computer software", "San Francisco", "United States", "600", "$250M", "Connected workspace for docs and wikis", 89, "opportunity", [0, "Replied: pricing"], "Martin Paviot"],
  ["figma", "Figma", "figma.com", "design", "San Francisco", "United States", "1200", "$600M", "Collaborative interface design", 92, "opportunity", [1, "Pricing sent"], "Léa Rochat"],
  ["vercel", "Vercel", "vercel.com", "computer software", "San Francisco", "United States", "550", "$90M", "Frontend cloud and deployments", 88, "opportunity", [0, "Call booked"], "Martin Paviot"],
  ["ramp", "Ramp", "ramp.com", "financial services", "New York", "United States", "730", "$300M", "Corporate cards and spend management", 86, "opportunity", [2, "Demo done"], "Léa Rochat"],
  ["supabase", "Supabase", "supabase.com", "computer software", "Singapore", "Singapore", "120", "$40M", "Open-source Postgres backend", 90, "customer", [7, "Renewed"], "Martin Paviot"],
  ["webflow", "Webflow", "webflow.com", "information technology & services", "San Francisco", "United States", "240", "$120M", "Visual web development platform", 85, "opportunity", [3, "Follow-up"], "Martin Paviot"],
  ["retool", "Retool", "retool.com", "computer software", "San Francisco", "United States", "280", "$80M", "Internal tools, fast", 81, "new", null, null],
  ["mercury", "Mercury", "mercury.com", "financial services", "San Francisco", "United States", "700", "$150M", "Banking built for startups", 88, "new", null, null],
  ["amplitude", "Amplitude", "amplitude.com", "computer software", "San Francisco", "United States", "680", "$300M", "Digital product analytics", 82, "new", null, null],
  ["rippling", "Rippling", "rippling.com", "human resources", "San Francisco", "United States", "3000", "$870M", "HR, IT and finance in one", 86, "new", null, null],
  ["stripe", "Stripe", "stripe.com", "financial services", "San Francisco", "United States", "8000", "$3B", "Payments infrastructure", 91, "new", null, null],
  ["gusto", "Gusto", "gusto.com", "human resources", "Denver", "United States", "2500", "$500M", "Payroll and HR for SMBs", 77, "new", null, null],
  ["miro", "Miro", "miro.com", "computer software", "Amsterdam", "Netherlands", "1800", "$400M", "The innovation workspace", 81, "nurture", [28, "Went quiet"], null],
  ["intercom", "Intercom", "intercom.com", "computer software", "San Francisco", "United States", "950", "$260M", "AI-first customer service", 83, "new", null, null],
  ["deel", "Deel", "deel.com", "human resources", "San Francisco", "United States", "4000", "$800M", "Global payroll and compliance", null, "new", null, null],
  ["loom", "Loom", "loom.com", "information technology & services", "San Francisco", "United States", "320", "$90M", "Async video messaging", null, "nurture", null, null],
  ["airtable", "Airtable", "airtable.com", "computer software", "San Francisco", "United States", "1000", "$140M", "Part spreadsheet, part database", 79, "opportunity", [5, "Trial started"], "Martin Paviot"],
] as AcctIn[]).map(A);

export const ACCOUNTS_DEMO = (url: URL) => {
  const page = Number(url.searchParams.get("page") || "1");
  const pagination = { page: 1, pageSize: 200, total: ACCOUNTS.length, totalPages: 1, hasMore: false };
  return { accounts: page > 1 ? [] : ACCOUNTS, pagination };
};

/* GET /api/opportunities — opportunities/page.tsx Deal shape (board groups by
   stage: lead/qualification/demo/trial/proposal/negotiation/won/lost). */
type DealIn = [id: string, name: string, domain: string, stage: string, value: number, summary: string | null, owner: string | null];
const D = (i: DealIn) => {
  const [id, name, domain, stage, value, summary, owner] = i;
  const [ownerFirstName, ownerLastName] = owner ? owner.split(" ") : [null, null];
  return {
    id, name, stage, value, companyId: id, companyDomain: domain, contactId: null, ownerId: owner ? id : null,
    summary, expectedCloseDate: stage === "proposal" || stage === "negotiation" ? new Date(now + 30 * 86_400_000).toISOString() : null,
    properties: {}, companyName: name, ownerFirstName, ownerLastName, createdAt: agoDay(20), updatedAt: agoDay(3),
  };
};
const DEALS = ([
  ["loom", "Loom", "loom.com", "lead", 12000, null, null],
  ["posthog", "PostHog", "posthog.com", "lead", 9000, null, null],
  ["intercom", "Intercom", "intercom.com", "qualification", 20000, null, null],
  ["airtable", "Airtable", "airtable.com", "qualification", 18000, null, null],
  ["retool", "Retool", "retool.com", "demo", 15000, "Eval in progress", "Martin Paviot"],
  ["webflow", "Webflow", "webflow.com", "trial", 28000, "Trial · week 2", "Martin Paviot"],
  ["ramp", "Ramp", "ramp.com", "trial", 61000, null, "Léa Rochat"],
  ["notion", "Notion", "notion.so", "proposal", 40000, "Close Q3 · vs Salesforce", "Martin Paviot"],
  ["figma", "Figma", "figma.com", "proposal", 52000, null, "Léa Rochat"],
  ["vercel", "Vercel", "vercel.com", "negotiation", 44000, "Redlines with legal", "Martin Paviot"],
  ["linear", "Linear", "linear.app", "won", 36000, null, "Martin Paviot"],
  ["supabase", "Supabase", "supabase.com", "won", 29000, null, "Martin Paviot"],
] as DealIn[]).map(D);

export const OPPORTUNITIES_DEMO = { deals: DEALS };

/* GET /api/meetings — meetings/_meeting-views.tsx Meeting shape. Placed on
   weekday business-hour slots in the current week so the calendar reads
   cleanly (a week of captured calls), not odd times on the weekend. */
const weekdaySlot = (dayIdx: number, hour: number) => {
  const d = new Date(now);
  const mondayOffset = (d.getDay() + 6) % 7; // days since Monday
  d.setDate(d.getDate() - mondayOffset + dayIdx);
  d.setHours(hour, 0, 0, 0);
  return d;
};
type MeetIn = [id: string, title: string, day: number, hour: number, dur: number, acct: string, dom: string, transcript: boolean, notes: string | null, who: string[]];
const MK = (i: MeetIn) => {
  const [id, title, day, hour, dur, acct, dom, transcript, notes, who] = i;
  const start = weekdaySlot(day, hour);
  const end = new Date(start.getTime() + dur * 60_000);
  const past = start.getTime() < now;
  return {
    id, calendarEventId: id, title, description: null,
    startTime: start.toISOString(), endTime: end.toISOString(),
    attendees: who.map((n) => ({ email: `${n.toLowerCase().replace(/\s+/g, ".")}@${dom}`, displayName: n, responseStatus: "accepted" })),
    location: null, meetingLink: past ? null : "https://meet.google.com/demo-abc",
    status: "confirmed", isPast: past, isAllDay: false,
    organizer: { email: "martin.paviot@pilae.ch", displayName: "Martin Paviot" },
    isRecurring: false, hasTranscript: transcript, hasNotes: !!notes,
    notes: notes ? { summary: notes } : null,
    recordingUrl: transcript ? "https://demo/recording" : null, activityId: notes ? id : null,
    account: { id, name: acct, domain: dom }, matchedContacts: [],
  };
};
const MEETINGS = ([
  ["m1", "Discovery call · Notion", 0, 10, 30, "Notion", "notion.so", true, "Strong pain around manual prospecting; ~$40K budget, CFO sign-off, close targeted Q3.", ["Sarah Klein"]],
  ["m2", "Demo · Figma", 1, 14, 45, "Figma", "figma.com", true, "Loved the live capture; comparing vs incumbent, decision within two weeks.", ["Léa Rochat"]],
  ["m3", "Intro · Ramp", 2, 11, 30, "Ramp", "ramp.com", false, "Exploratory; spend-controls fit, eval next sprint.", ["Dana Liu"]],
  ["m4", "Pricing · Vercel", 3, 15, 30, "Vercel", "vercel.com", true, "Asked for annual pricing; weighing budget, targeting Q3 close.", ["Sam Reed"]],
  ["m5", "Renewal · Linear", 4, 10, 30, "Linear", "linear.app", false, null, ["Alex Carter"]],
] as MeetIn[]).map(MK);

export const MEETINGS_DEMO = {
  meetings: MEETINGS,
  calendarConnected: true,
  nextMeeting: null,
  conflicts: [],
};

/* GET /api/sequences — sequences/page.tsx Sequence shape. */
export const SEQUENCES_DEMO = {
  sequences: [
    { id: "s1", name: "Re-engage · stalled deals", description: "Win back accounts that went quiet", status: "active", stepCount: 4, enrolledCount: 18, emailStats: { sent: 142, opened: 87, replied: 20 }, createdAt: agoDay(9) },
    { id: "s2", name: "ICP-2 · SaaS founders", description: "Cold outbound to founder-led SaaS", status: "active", stepCount: 5, enrolledCount: 142, emailStats: { sent: 142, opened: 61, replied: 14 }, createdAt: agoDay(20) },
    { id: "s3", name: "Event follow-up · SaaStr", description: "Follow up on booth conversations", status: "draft", stepCount: 3, enrolledCount: 76, emailStats: { sent: 0, opened: 0, replied: 0 }, createdAt: agoDay(3) },
  ],
};

export const PIPELINE_ANALYTICS_DEMO = (() => {
  const open = DEALS.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const won = DEALS.filter((d) => d.stage === "won");
  const valueByStage: Record<string, { count: number; value: number }> = {};
  for (const d of DEALS) {
    const v = valueByStage[d.stage] ?? { count: 0, value: 0 };
    v.count += 1; v.value += d.value;
    valueByStage[d.stage] = v;
  }
  const funnel = Object.entries(valueByStage).map(([stage, v]) => ({ stage, count: v.count }));
  return {
    totalDeals: DEALS.length,
    activeDeals: open.length,
    totalPipelineValue: open.reduce((a, d) => a + d.value, 0),
    wonValue: won.reduce((a, d) => a + d.value, 0),
    wonCount: won.length,
    lostCount: 3,
    winRate: 41,
    avgDealValue: 31000,
    avgVelocityDays: 24,
    valueByStage,
    funnel,
    riskSummary: { high: 2, medium: 3, low: 4, none: 3 },
  };
})();
