/**
 * Marketing product mockups.
 *
 * Crafted recreations of the real Elevay app surfaces, styled with the
 * light-theme tokens from globals.css so they read as genuine product
 * shots. People use real portrait photos and companies use real brand
 * logos (full-colour favicons); every image has an onError glyph
 * fallback so a blocked CDN never shows a broken image.
 *
 * Status colours are a smooth, muted palette (see C) rather than vivid
 * Tailwind green/red/amber, which read as generic.
 *
 * Every export is decorative: the root carries aria-hidden so assistive
 * tech skips the faux UI and reads the adjacent copy.
 */

import {
  Building2,
  Users,
  CircleDot,
  Inbox,
  Phone,
  Clock,
  Bell,
  MessageSquare,
  Send,
  Search,
  Check,
  TrendingUp,
  AlertTriangle,
  Eye,
  Reply,
  DollarSign,
  Lock,
  Activity,
  Lightbulb,
  FileText,
  User,
  type LucideIcon,
} from "lucide-react";

const BRAND = "linear-gradient(90deg,#17C3B2,#2C6BED,#FF7A3D)";

const PHOTO = {
  julien: "https://randomuser.me/api/portraits/men/32.jpg",
  sarah: "https://randomuser.me/api/portraits/women/44.jpg",
  tom: "https://randomuser.me/api/portraits/men/75.jpg",
};
// Brand marks for the integration strip.
const logo = (slug: string) => `https://cdn.simpleicons.org/${slug}`;
// Full-colour real company logos (the brand's actual favicon).
const clogo = (domain: string) => `https://icon.horse/icon/${domain}`;

// Smooth, muted status palette (softer than #10B981 / #EF4444 / #F59E0B).
const C = {
  green: "#4E9E86",
  greenSoft: "rgba(78,158,134,0.13)",
  red: "#D17B76",
  redSoft: "rgba(209,123,118,0.13)",
  amber: "#CDA25C",
  amberSoft: "rgba(205,162,92,0.15)",
  blue: "#2C6BED",
  blueSoft: "rgba(44,107,237,0.10)",
};

/* ── photo avatar with glyph fallback ──────────────────────────── */

function Avatar({ src, size = 28 }: { src: string; size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EEF1F6]"
      style={{ width: size, height: size }}
    >
      <User size={Math.round(size * 0.5)} className="text-[#AEB4C0]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    </span>
  );
}

/* ── company logo with glyph fallback ──────────────────────────── */

function Logo({
  src,
  size = 26,
  rounded = "rounded-[7px]",
  bordered = true,
}: {
  src: string;
  size?: number;
  rounded?: string;
  bordered?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ${rounded} ${bordered ? "border border-[#EDEFF3]" : ""}`}
      style={{ width: size, height: size }}
    >
      <Building2 size={Math.round(size * 0.46)} className="text-[#C4C8D2]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="absolute inset-0 m-auto h-full w-full object-contain p-[10%]"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    </span>
  );
}

/* ── shared primitives ─────────────────────────────────────────── */

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 90
      ? { c: C.green, b: C.greenSoft }
      : score >= 80
        ? { c: C.blue, b: C.blueSoft }
        : { c: C.amber, b: C.amberSoft };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ color: tone.c, background: tone.b }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: tone.c }} />
      {score}
    </span>
  );
}

function MiniBadge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}

/** App-window chrome. */
export function AppFrame({
  children,
  url = "app.elevay.com",
  className = "",
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden rounded-2xl border border-[#E8E8F0] bg-white ${className}`}
      style={{ boxShadow: "0 24px 70px -20px rgba(26,26,46,0.28)" }}
    >
      <div className="flex h-9 items-center gap-2 border-b border-[#EFEFF5] bg-[#FBFBFD] px-3.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F0A8A0]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F3D08A]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#A9DCA0]" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md border border-[#EAEAF2] bg-white px-2.5 py-1 text-[10px] text-[#9CA3AF]">
          <Lock size={9} />
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── 1. HERO: the "Up next" dashboard ──────────────────────────── */

const navItems: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: Clock, label: "Up next", active: true },
  { icon: Building2, label: "Accounts" },
  { icon: Users, label: "Contacts" },
  { icon: CircleDot, label: "Opportunities" },
  { icon: Inbox, label: "Inbox" },
  { icon: Phone, label: "Call Mode" },
  { icon: Send, label: "Campaigns" },
];

const heroPriorities: {
  icon: LucideIcon;
  tint: string;
  text: string;
  badge: { label: string; color: string; bg: string };
}[] = [
  { icon: Bell, tint: C.red, text: "Re-engage Linear · 12 days silent", badge: { label: "Stalled", color: C.red, bg: C.redSoft } },
  { icon: Reply, tint: C.blue, text: "Reply to Julien about pricing", badge: { label: "high", color: C.amber, bg: C.amberSoft } },
  { icon: Send, tint: C.green, text: "Send sequence to 18 new ICP-1 accounts", badge: { label: "ready", color: C.green, bg: C.greenSoft } },
];

export function DashboardMock() {
  return (
    <AppFrame>
      <div className="flex" style={{ minHeight: 380 }}>
        <aside className="hidden w-40 shrink-0 flex-col border-r border-[#EFEFF5] bg-white px-2 py-3 sm:flex">
          <div className="mb-4 flex items-center gap-1.5 px-1.5">
            <img src="/logo-Elevay.svg" alt="" className="h-5 w-5" />
            <span className="text-[13px] font-bold" style={{ background: BRAND, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Elevay</span>
          </div>
          <div className="space-y-0.5">
            {navItems.map((n) => {
              const Icon = n.icon;
              return (
                <div key={n.label} className="flex h-7 items-center gap-2 rounded-md px-2 text-[11px] font-medium"
                  style={{ color: n.active ? "#1A1A2E" : "#64648C", background: n.active ? "rgba(44,107,237,0.08)" : "transparent", boxShadow: n.active ? "inset 2px 0 0 0 #2C6BED" : undefined }}>
                  <Icon size={13} style={{ color: n.active ? "#2C6BED" : "#9CA3AF" }} />
                  {n.label}
                </div>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-[#FAFAFA] px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF]"><Clock size={11} /> Up next · Wed, Jun 3</div>
          <div className="mt-1.5 text-[15px] font-bold text-[#1A1A2E]">Good morning, Martin</div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[#E8E8F0] bg-white px-3.5 py-2.5">
            {[
              { icon: Building2, v: "544", l: "accounts" },
              { icon: Users, v: "312", l: "contacts" },
              { icon: DollarSign, v: "$148K", l: "pipeline" },
              { icon: TrendingUp, v: "9", l: "deals" },
            ].map((s) => { const Icon = s.icon; return (
              <div key={s.l} className="flex items-center gap-1.5">
                <Icon size={12} style={{ color: "#9CA3AF" }} />
                <span className="text-[13px] font-bold text-[#1A1A2E]">{s.v}</span>
                <span className="text-[11px] text-[#9CA3AF]">{s.l}</span>
              </div>
            ); })}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Your priorities today</div>
              <div className="space-y-1.5">
                {heroPriorities.map((p) => { const Icon = p.icon; return (
                  <div key={p.text} className="flex items-center justify-between gap-2 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon size={13} style={{ color: p.tint }} className="shrink-0" />
                      <span className="truncate text-[11.5px] font-medium text-[#1A1A2E]">{p.text}</span>
                    </div>
                    <MiniBadge color={p.badge.color} bg={p.badge.bg}>{p.badge.label}</MiniBadge>
                  </div>
                ); })}
              </div>

              <div className="mb-1.5 mt-3 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]"><AlertTriangle size={10} /> Deals at risk</div>
              <div className="space-y-1.5">
                {[
                  { dom: "notion.so", n: "Notion · Pro plan", v: "$36K", r: 78 },
                  { dom: "webflow.com", n: "Webflow · Team", v: "$22K", r: 41 },
                ].map((d) => (
                  <div key={d.n} className="flex items-center justify-between rounded-lg border border-[#E8E8F0] bg-white px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Logo src={clogo(d.dom)} size={18} />
                      <span className="truncate text-[11.5px] font-medium text-[#1A1A2E]">{d.n}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: C.green }}>{d.v}</span>
                      <MiniBadge color={d.r >= 70 ? C.red : C.amber} bg={d.r >= 70 ? C.redSoft : C.amberSoft}>{d.r}% stall risk</MiniBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Today&apos;s meetings</div>
              <div className="rounded-lg border border-[#E8E8F0] bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <Logo src={clogo("linear.app")} size={18} />
                  <div className="min-w-0">
                    <div className="truncate text-[11.5px] font-medium text-[#1A1A2E]">Linear · discovery</div>
                    <div className="text-[10px] text-[#9CA3AF]">2:30 PM · Zoom</div>
                  </div>
                </div>
              </div>

              <div className="mb-1.5 mt-3 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]"><Users size={10} /> Hot contacts</div>
              <div className="space-y-1.5">
                {[
                  { photo: PHOTO.julien, n: "Julien Meyer", t: "VP Sales · Linear", s: 92 },
                  { photo: PHOTO.sarah, n: "Sarah Klein", t: "COO · Notion", s: 88 },
                  { photo: PHOTO.tom, n: "Tom Bauer", t: "Founder · Webflow", s: 81 },
                ].map((p) => (
                  <div key={p.n} className="flex items-center gap-2 rounded-lg border border-[#E8E8F0] bg-white px-2.5 py-1.5">
                    <Avatar src={p.photo} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-[#1A1A2E]">{p.n}</div>
                      <div className="truncate text-[10px] text-[#9CA3AF]">{p.t}</div>
                    </div>
                    <ScorePill score={p.s} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ── 2. Auto-built TAM ──────────────────────────────────────────── */

export function TamMock() {
  const rows = [
    { dom: "linear.app", n: "Linear", t: "Dev SaaS · 180 · Berlin", s: 94 },
    { dom: "notion.so", n: "Notion", t: "Productivity · 600 · London", s: 89 },
    { dom: "webflow.com", n: "Webflow", t: "MarTech · 240 · Paris", s: 85 },
    { dom: "airtable.com", n: "Airtable", t: "No-code · 140 · Amsterdam", s: 78 },
  ];
  return (
    <ProductCard>
      <div className="flex items-center justify-between border-b border-[#EFEFF5] px-4 py-3">
        <div className="flex items-center gap-2">
          <Building2 size={14} style={{ color: C.blue }} />
          <span className="text-[12.5px] font-semibold text-[#1A1A2E]">Target accounts</span>
        </div>
        <div className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: BRAND }}>Build TAM</div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 text-[10px]">
        {["Industry: SaaS", "Headcount 50–500", "Region: EU", "Hiring SDRs"].map((f) => (
          <span key={f} className="rounded-full border border-[#E8E8F0] bg-[#FAFAFA] px-2 py-0.5 text-[#64648C]">{f}</span>
        ))}
      </div>
      <div className="px-2 py-2">
        {rows.map((r) => (
          <div key={r.n} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#FAFAFA]">
            <Logo src={clogo(r.dom)} size={26} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-[#1A1A2E]">{r.n}</div>
              <div className="truncate text-[10.5px] text-[#9CA3AF]">{r.t}</div>
            </div>
            <ScorePill score={r.s} />
          </div>
        ))}
      </div>
      <div className="border-t border-[#EFEFF5] px-4 py-2 text-[10.5px] text-[#9CA3AF]">544 accounts scored against ICP-1 · SaaS B2B scale-up</div>
    </ProductCard>
  );
}

/* ── 3. Signals feed ────────────────────────────────────────────── */

export function SignalsMock() {
  const sigs: { icon: LucideIcon; tint: string; bg: string; t: string; time: string }[] = [
    { icon: Eye, tint: C.blue, bg: C.blueSoft, t: "Linear viewed your pricing page", time: "5m" },
    { icon: Reply, tint: C.green, bg: C.greenSoft, t: "Julien replied to your sequence", time: "1h" },
    { icon: AlertTriangle, tint: C.red, bg: C.redSoft, t: "Notion deal silent for 14 days", time: "today" },
    { icon: TrendingUp, tint: C.amber, bg: C.amberSoft, t: "3 ICP-1 accounts started hiring SDRs", time: "2h" },
  ];
  return (
    <ProductCard>
      <div className="flex items-center gap-2 border-b border-[#EFEFF5] px-4 py-3">
        <Activity size={14} style={{ color: C.blue }} />
        <span className="text-[12.5px] font-semibold text-[#1A1A2E]">Why now</span>
      </div>
      <div className="px-2 py-2">
        {sigs.map((s) => { const Icon = s.icon; return (
          <div key={s.t} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: s.bg }}>
              <Icon size={13} style={{ color: s.tint }} />
            </div>
            <span className="flex-1 truncate text-[12px] font-medium text-[#1A1A2E]">{s.t}</span>
            <span className="shrink-0 text-[10.5px] text-[#9CA3AF]">{s.time}</span>
          </div>
        ); })}
      </div>
    </ProductCard>
  );
}

/* ── 4. Outreach: email draft ───────────────────────────────────── */

export function OutreachMock() {
  return (
    <ProductCard>
      <div className="flex items-center justify-between border-b border-[#EFEFF5] px-4 py-3">
        <div className="flex items-center gap-2">
          <Send size={14} style={{ color: C.blue }} />
          <span className="text-[12.5px] font-semibold text-[#1A1A2E]">Sequence · Step 2 · Email</span>
        </div>
        <MiniBadge color="#64648C" bg="#F3F3F8">Draft</MiniBadge>
      </div>
      <div className="px-4 py-3 text-[11.5px]">
        <div className="flex items-center gap-2 text-[#64648C]">
          <span className="text-[#9CA3AF]">To</span>
          <span className="flex items-center gap-1.5 rounded-full bg-[#FAFAFA] px-2 py-0.5 text-[#1A1A2E]"><Logo src={clogo("webflow.com")} size={14} bordered={false} /> tom@webflow.com</span>
        </div>
        <div className="mt-2 font-semibold text-[#1A1A2E]">Re: the manual prospecting problem you mentioned</div>
        <div className="mt-1.5 space-y-1 text-[#64648C]">
          <p>Hi Tom, you said your team loses ~6 hours a week stitching lists together.</p>
          <p>That&apos;s exactly the gap we close. Worth 15 minutes Thursday?</p>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10.5px]" style={{ background: C.blueSoft, color: C.blue }}>
          <FileText size={11} /> Drafted from your Apr 28 call with Webflow
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-[#EFEFF5] px-4 py-2.5">
        <div className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: BRAND }}>Approve &amp; send</div>
        <div className="rounded-md border border-[#E8E8F0] px-3 py-1.5 text-[11px] font-medium text-[#64648C]">Edit</div>
      </div>
    </ProductCard>
  );
}

/* ── 5. Call Mode cockpit ───────────────────────────────────────── */

export function CallMock() {
  return (
    <ProductCard>
      <div className="flex items-center justify-between border-b border-[#EFEFF5] px-4 py-3">
        <div className="flex items-center gap-2">
          <Phone size={14} style={{ color: C.blue }} />
          <span className="text-[12.5px] font-semibold text-[#1A1A2E]">Call Mode</span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: C.green }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: C.green }} /> Connected 02:14</span>
      </div>
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar src={PHOTO.julien} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-[#1A1A2E]">Julien Meyer</div>
          <div className="text-[10.5px] text-[#9CA3AF]">VP Sales · Linear · Lyon</div>
        </div>
        <span className="flex items-center gap-0.5">
          {[6, 12, 9, 16, 7, 13, 5].map((h, i) => (
            <span key={i} className="w-[3px] rounded-full" style={{ height: h, background: C.blue, opacity: 0.35 + (i % 3) * 0.22 }} />
          ))}
        </span>
      </div>
      <div className="mx-4 mb-3 rounded-lg px-3 py-2.5" style={{ border: "1px solid rgba(44,107,237,0.18)", background: "rgba(44,107,237,0.05)" }}>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.blue }}><Lightbulb size={11} /> Live coaching</div>
        <div className="mt-1 text-[11px] text-[#1A1A2E]">Objection: <span className="font-medium">&quot;too expensive&quot;</span></div>
        <div className="mt-0.5 text-[11px] text-[#64648C]">Anchor on ROI: they spend ~6 hours a week on manual prospecting.</div>
      </div>
    </ProductCard>
  );
}

/* ── 6. Meeting capture ─────────────────────────────────────────── */

export function MeetingMock() {
  return (
    <ProductCard>
      <div className="flex items-center justify-between border-b border-[#EFEFF5] px-4 py-3">
        <div className="flex items-center gap-2">
          <Logo src={clogo("notion.so")} size={18} />
          <span className="text-[12.5px] font-semibold text-[#1A1A2E]">Notion · Discovery call</span>
        </div>
        <span className="text-[10.5px] text-[#9CA3AF]">Zoom · 32 min</span>
      </div>
      <div className="px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Action items</div>
        <div className="mt-1.5 space-y-1.5">
          {["Send security overview to Sarah", "Loop in their CFO on pricing"].map((a) => (
            <div key={a} className="flex items-center gap-2 text-[11.5px] text-[#1A1A2E]">
              <span className="flex h-4 w-4 items-center justify-center rounded border border-[#E8E8F0]"><Check size={10} style={{ color: C.green }} /></span>
              {a}
            </div>
          ))}
        </div>
        <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Buying signals</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[
            { k: "Budget", v: "~$40K" },
            { k: "Timeline", v: "Q3" },
            { k: "Competitor", v: "Salesforce" },
          ].map((s) => (
            <span key={s.k} className="rounded-full border border-[#E8E8F0] bg-[#FAFAFA] px-2 py-0.5 text-[10.5px] text-[#64648C]">{s.k}: <span className="font-medium text-[#1A1A2E]">{s.v}</span></span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#EFEFF5] px-4 py-2.5">
        <div className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: BRAND }}>Review &amp; confirm</div>
        <span className="text-[10.5px] text-[#9CA3AF]">Recorded via Recall.ai</span>
      </div>
    </ProductCard>
  );
}

/* ── 7. Chat with citations ─────────────────────────────────────── */

export function ChatMock() {
  return (
    <ProductCard>
      <div className="flex items-center gap-2 border-b border-[#EFEFF5] px-4 py-3">
        <MessageSquare size={14} style={{ color: C.blue }} />
        <span className="text-[12.5px] font-semibold text-[#1A1A2E]">Ask Elevay</span>
      </div>
      <div className="space-y-3 px-4 py-3.5">
        <div className="flex justify-end">
          <div className="max-w-[78%] rounded-2xl rounded-br-sm px-3 py-2 text-[11.5px] text-white" style={{ background: C.blue }}>
            What did Sarah say about budget last Thursday?
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-[#E8E8F0] bg-white px-3 py-2.5">
            <p className="text-[11.5px] leading-relaxed text-[#1A1A2E]">Sarah said budget approval needs CFO sign-off, but she expects ~$40K is feasible this quarter.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { i: Phone, t: "Call · Notion demo · May 28" },
                { i: Inbox, t: "Email · Re: pricing · May 30" },
              ].map((c) => { const Icon = c.i; return (
                <span key={c.t} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ border: "1px solid rgba(44,107,237,0.25)", background: C.blueSoft, color: C.blue }}>
                  <Icon size={9} /> {c.t}
                </span>
              ); })}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-4 mb-3.5 flex items-center gap-2 rounded-lg border border-[#E8E8F0] bg-[#FAFAFA] px-3 py-2">
        <Search size={12} style={{ color: "#9CA3AF" }} />
        <span className="flex-1 text-[11px] text-[#9CA3AF]">Ask anything about your pipeline…</span>
        <div className="flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ background: BRAND }}><Send size={10} /></div>
      </div>
    </ProductCard>
  );
}

/* ── shared product-card shell ──────────────────────────────────── */

function ProductCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-[#E8E8F0] bg-white"
      style={{ boxShadow: "0 18px 50px -22px rgba(26,26,46,0.22)" }}
    >
      {children}
    </div>
  );
}

/* ── Integrations strip — real brand logos ──────────────────────── */

export function IntegrationsStrip() {
  // Simple Icons for the brands it still carries; icon.horse for the
  // Microsoft logos Simple Icons removed.
  const items = [
    { src: logo("gmail"), l: "Gmail" },
    { src: "https://icon.horse/icon/outlook.com", l: "Outlook" },
    { src: logo("googlemeet"), l: "Google Meet" },
    { src: logo("zoom"), l: "Zoom" },
    { src: "https://icon.horse/icon/teams.microsoft.com", l: "Teams" },
    { src: logo("googlecalendar"), l: "Calendar" },
  ];
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
      {items.map((i) => (
        <div key={i.l} className="flex items-center gap-2">
          <Logo src={i.src} size={24} rounded="rounded-md" bordered={false} />
          <span className="text-[13px] font-medium text-[#475569]">{i.l}</span>
        </div>
      ))}
    </div>
  );
}
