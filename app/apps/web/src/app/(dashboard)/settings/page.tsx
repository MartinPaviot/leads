"use client";

/**
 * Settings overview — the "Your AI at a glance" cockpit (Settings IA).
 *
 * Elevay is an autonomous engine, so opening Settings should answer "what is my
 * AI doing right now, and how aggressive is it?" before it offers a list of
 * config pages. The two top cards read LIVE state (autonomy level + trust score,
 * connected mailboxes); the rest are deep links into the section a founder most
 * often needs. Profile moved to /settings/profile.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Gauge, Mail, PenLine, Target, BookOpen, ArrowRight } from "lucide-react";

type AutonomyLevel = "copilot" | "guided" | "autonomous" | "strategic";
const LEVEL_LABEL: Record<AutonomyLevel, string> = {
  copilot: "Copilot",
  guided: "Guided",
  autonomous: "Autonomous",
  strategic: "Strategic",
};
const LEVEL_BLURB: Record<AutonomyLevel, string> = {
  copilot: "Approves everything before it happens",
  guided: "Acts on safe changes, sends still wait",
  autonomous: "Auto-runs high-confidence work",
  strategic: "More leeway once trust is earned",
};

export default function SettingsOverviewPage() {
  const [level, setLevel] = useState<AutonomyLevel | null>(null);
  const [trust, setTrust] = useState<number | null>(null);
  const [mailboxes, setMailboxes] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [a, m] = await Promise.all([
        fetch("/api/settings/autonomy").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/settings/mailboxes").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (a?.config?.level) setLevel(a.config.level as AutonomyLevel);
      const overall = typeof a?.trustScore === "number" ? a.trustScore : a?.trustScore?.overall;
      if (typeof overall === "number") setTrust(Math.round(overall));
      if (Array.isArray(m?.mailboxes)) setMailboxes(m.mailboxes.length);
    })();
  }, []);

  return (
    <>
      <SettingsHeader title="Overview" subtitle="Your AI at a glance — and where to tune it." />

      {/* Live state — autonomy + channels */}
      <div className="grid gap-3 @min-[560px]:grid-cols-2">
        <StatCard
          href="/settings/autonomy"
          icon={<Gauge size={16} />}
          label="Autonomy"
          value={level ? LEVEL_LABEL[level] : "—"}
          sub={level ? LEVEL_BLURB[level] : "How much it acts on its own"}
          meta={trust != null ? `Trust ${trust}/100` : undefined}
        />
        <StatCard
          href="/settings/sending-infrastructure"
          icon={<Mail size={16} />}
          label="Channels"
          value={mailboxes != null ? `${mailboxes} connected` : "—"}
          sub={mailboxes === 0 ? "Connect a mailbox to start sending" : "Mailboxes it sends from"}
        />
      </div>

      {/* Where to tune the AI */}
      <h2 className="mt-8 mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        Tune your AI
      </h2>
      <div className="space-y-2">
        <LinkRow href="/settings/writing-style" icon={<PenLine size={15} />} title="Voice & Writing" sub="How it sounds, your standing instructions, audiences" />
        <LinkRow href="/settings/icp" icon={<Target size={15} />} title="Targeting" sub="Your ICP — who the engine goes after" />
        <LinkRow href="/settings/knowledge" icon={<BookOpen size={15} />} title="Knowledge" sub="Business context the AI uses everywhere" />
        <LinkRow href="/settings/profile" icon={<ArrowRight size={15} />} title="Profile & account" sub="Your name, language, security, notifications" />
      </div>
    </>
  );
}

function StatCard({
  href, icon, label, value, sub, meta,
}: { href: string; icon: React.ReactNode; label: string; value: string; sub: string; meta?: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl p-4 transition-colors"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
          <span style={{ color: "var(--color-accent)" }}>{icon}</span>
          {label}
        </div>
        {meta && (
          <span className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>{meta}</span>
        )}
      </div>
      <div className="mt-2 text-[20px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
        {value}
      </div>
      <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{sub}</div>
    </Link>
  );
}

function LinkRow({
  href, icon, title, sub,
}: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg p-3 transition-colors"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-bg-card)"; }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{title}</span>
        <span className="block text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{sub}</span>
      </span>
      <ArrowRight size={14} style={{ color: "var(--color-text-tertiary)" }} />
    </Link>
  );
}
