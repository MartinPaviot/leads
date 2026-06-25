"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Zap, BarChart3, Network, Sparkles, Radio, FlaskConical, Brain, DollarSign, ShieldCheck, Target, GitBranch, Flame } from "lucide-react";

const navItems = [
  { href: "/", label: "Agents", icon: Activity },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/evals", label: "Evals", icon: FlaskConical },
  { href: "/intelligence", label: "Intelligence", icon: Brain },
  { href: "/costs", label: "Costs", icon: DollarSign },
  { href: "/sla", label: "SLA", icon: ShieldCheck },
  { href: "/scoring", label: "Scoring", icon: Target },
  { href: "/flywheel", label: "Flywheel", icon: Zap },
  { href: "/channel", label: "Channel", icon: Radio },
  { href: "/warmup", label: "Warmup", icon: Flame },
  { href: "/graph", label: "Graph", icon: Network },
  { href: "/business", label: "Business", icon: BarChart3 },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex w-56 shrink-0 flex-col border-r px-3 py-5"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <Sparkles size={18} style={{ color: "var(--color-accent)" }} />
        <span className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Elevay Admin
        </span>
      </div>

      <div className="space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
              style={{
                color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
                background: isActive ? "var(--color-accent-soft)" : "transparent",
              }}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto px-2 pt-4 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        Observability Dashboard
      </div>
    </nav>
  );
}
