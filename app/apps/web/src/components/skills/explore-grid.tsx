"use client";

import { useRouter } from "next/navigation";
import { Wand2, Play, GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SkillEntry } from "@/app/(dashboard)/skills/_types";

interface ExploreGridProps {
  skills: SkillEntry[];
  onFork: (skill: SkillEntry) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  enrichment: "Enrichment",
  scoring: "Scoring",
  outreach: "Outreach",
  signals: "Signals",
  intelligence: "Intelligence",
  custom: "Custom",
};

const CATEGORY_VARIANT: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  enrichment: "info",
  scoring: "warning",
  outreach: "success",
  signals: "error",
  intelligence: "neutral",
  custom: "neutral",
};

const CATEGORY_ORDER = ["enrichment", "scoring", "outreach", "signals", "intelligence", "custom"];

export function ExploreGrid({ skills, onFork }: ExploreGridProps) {
  const router = useRouter();

  // Group skills by category
  const grouped = skills.reduce<Record<string, SkillEntry[]>>((acc, skill) => {
    const cat = skill.category || "custom";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  // Sort categories in defined order
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Wand2 size={32} style={{ color: "var(--color-text-muted)" }} />
        <p
          className="mt-3 text-[13px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          No skills available
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sortedCategories.map((category) => (
        <div key={category}>
          <div className="mb-3 flex items-center gap-2">
            <h2
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {CATEGORY_LABELS[category] || category}
            </h2>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: "var(--color-bg-hover)",
                color: "var(--color-text-muted)",
              }}
            >
              {grouped[category].length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped[category].map((skill) => (
              <div
                key={skill.id}
                className="group flex flex-col rounded-xl p-4 transition-all duration-150"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border-default)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-hover)";
                  e.currentTarget.style.boxShadow = "var(--shadow-card)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-default)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--color-accent-soft)" }}
                  >
                    <Wand2
                      size={14}
                      style={{ color: "var(--color-accent)" }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3
                      className="truncate text-[14px] font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {skill.name}
                    </h3>
                    <Badge
                      variant={CATEGORY_VARIANT[skill.category] || "neutral"}
                      size="sm"
                      className="mt-1"
                    >
                      {skill.category}
                    </Badge>
                  </div>
                </div>

                <p
                  className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {skill.description}
                </p>

                <div className="mt-auto flex items-center gap-2 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="gradient"
                    size="sm"
                    icon={<Play size={11} />}
                    onClick={() =>
                      router.push(
                        `/chat?skill=${encodeURIComponent(skill.slug)}`
                      )
                    }
                  >
                    Use
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<GitFork size={11} />}
                    onClick={() => onFork(skill)}
                  >
                    Fork
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
