"use client";

/**
 * The landing's product shots, rendered from the REAL product components (not
 * hand-built mockups), wrapped in DemoSurface so they get demo data + the
 * dashboard providers. Pixel-identical to the app by construction.
 *
 * The dashboard pages are loaded with `dynamic(ssr:false)`: they're heavy and
 * client-only by nature (localStorage, timers, fetch), so client-only rendering
 * keeps the landing's SSR clean (no hydration mismatch) and lazy-loads each
 * surface instead of bloating the initial bundle.
 */

import dynamic from "next/dynamic";
import { DemoSurface } from "./demo-surface";
import { UP_NEXT_DEMO, ACCOUNTS_DEMO, OPPORTUNITIES_DEMO, PIPELINE_ANALYTICS_DEMO, SEQUENCES_DEMO, MEETINGS_DEMO } from "./demo-data";

const UpNextView = dynamic(() => import("@/components/up-next/up-next-view").then((m) => m.UpNextView), { ssr: false });
const AccountsPage = dynamic(() => import("@/app/(dashboard)/accounts/page"), { ssr: false });
const OpportunitiesPage = dynamic(() => import("@/app/(dashboard)/opportunities/page"), { ssr: false });
const ChatPage = dynamic(() => import("@/app/(dashboard)/chat/page"), { ssr: false });
const CampaignsPageReal = dynamic(() => import("@/app/(dashboard)/sequences/page"), { ssr: false });
const MeetingsPageReal = dynamic(() => import("@/app/(dashboard)/meetings/page"), { ssr: false });

export function RealUpNext() {
  return (
    <DemoSurface routes={{ "/api/home/up-next": UP_NEXT_DEMO }}>
      <div className="h-full overflow-hidden px-5 py-5" style={{ background: "var(--color-bg-page)" }}>
        <UpNextView />
      </div>
    </DemoSurface>
  );
}

export function RealAccounts() {
  return (
    <DemoSurface
      routes={{
        "/api/accounts": ACCOUNTS_DEMO,
        // Auxiliary GETs the page fires on load — empty objects so the page's
        // `data.x ?? []` fallbacks kick in (no 401 noise, graceful empties).
        "/api/icps": {},
        "/api/custom-signals": {},
        "/api/custom-fields": {},
        "/api/custom-objects": {},
        "/api/tam/proposals": {},
        "/api/warm-paths": {},
      }}
    >
      <div className="flex h-full flex-col overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
        <AccountsPage />
      </div>
    </DemoSurface>
  );
}

export function RealOpportunities() {
  return (
    <DemoSurface
      routes={{
        "/api/opportunities": OPPORTUNITIES_DEMO,
        "/api/pipeline/analytics": PIPELINE_ANALYTICS_DEMO,
        "/api/accounts": ACCOUNTS_DEMO,
        "/api/contacts": {},
        "/api/forecast": {},
      }}
    >
      <div className="flex h-full flex-col overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
        <OpportunitiesPage />
      </div>
    </DemoSurface>
  );
}

export function RealChat() {
  return (
    <DemoSurface routes={{ "/api/chat/threads": { threads: [] } }}>
      <div className="flex h-full flex-col overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
        <ChatPage />
      </div>
    </DemoSurface>
  );
}

export function RealCampaigns() {
  return (
    <DemoSurface routes={{ "/api/sequences": SEQUENCES_DEMO, "/api/sending-mode": { testMode: false, allowlist: [] } }}>
      <div className="flex h-full flex-col overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
        <CampaignsPageReal />
      </div>
    </DemoSurface>
  );
}

export function RealMeetings() {
  return (
    <DemoSurface routes={{ "/api/meetings": MEETINGS_DEMO, "/api/features": { recallai: true } }}>
      <div className="flex h-full flex-col overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
        <MeetingsPageReal />
      </div>
    </DemoSurface>
  );
}
