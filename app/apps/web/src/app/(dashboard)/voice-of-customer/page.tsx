"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, ChevronDown, ChevronRight, BarChart3, Loader2, Lightbulb, AlertTriangle, Heart, Shield, Crosshair } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

interface VoCMention {
  company: string;
  contact: string;
  date: string;
  quote: string;
}

interface VoCTheme {
  theme: string;
  category: "feature_request" | "pain_point" | "praise" | "objection" | "competitive_mention";
  mentions: VoCMention[];
  summary: string;
  frequency: number;
}

const categoryConfig: Record<string, { label: string; color: string; icon: typeof Lightbulb }> = {
  feature_request: { label: "Feature Request", color: "oklch(0.65 0.15 250)", icon: Lightbulb },
  pain_point: { label: "Pain Point", color: "oklch(0.6 0.2 25)", icon: AlertTriangle },
  praise: { label: "Praise", color: "oklch(0.6 0.15 145)", icon: Heart },
  objection: { label: "Objection", color: "oklch(0.65 0.15 50)", icon: Shield },
  competitive_mention: { label: "Competitor", color: "oklch(0.55 0.15 300)", icon: Crosshair },
};

export default function VoiceOfCustomerPage() {
  const [themes, setThemes] = useState<VoCTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [totalInteractions, setTotalInteractions] = useState(0);
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/voice-of-customer");
      if (res.ok) {
        const data = await res.json();
        setThemes(data.insights || []);
        setTotalInteractions(data.totalInteractions || 0);
      } else {
        // A 500 (LLM parse failure) or a thrown fetch used to fall through to
        // the "No customer insights yet" empty state, hiding the failure.
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredThemes = filterCategory
    ? themes.filter((t) => t.category === filterCategory)
    : themes;

  const categoryCounts = themes.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={<MessageCircle size={15} />} title="Voice of Customer" subtitle="Analyzing..." />
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
          <span className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            Analyzing customer interactions...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<MessageCircle size={15} />}
        title="Voice of Customer"
        subtitle={`${themes.length} themes from ${totalInteractions} interactions`}
      />

      <div className="flex-1 overflow-auto px-4 py-6">
        {loadError ? (
          <EmptyState
            variant="error"
            title="Couldn't analyze your conversations"
            description="Something went wrong extracting customer themes. This is not an empty inbox."
            actionLabel="Retry"
            onAction={load}
          />
        ) : themes.length === 0 ? (
          <EmptyState
            icon={<MessageCircle size={24} />}
            title="No customer insights yet"
            description="Connect your email and start having customer conversations. Elevay will automatically extract themes and feedback."
          />
        ) : (
          <div className="mx-auto max-w-4xl">
            {/* Category filter pills */}
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setFilterCategory(null)}
                className="rounded-full px-3 py-1 text-[12px] font-medium transition-all"
                style={{
                  background: !filterCategory ? "var(--color-accent)" : "var(--color-bg-muted)",
                  color: !filterCategory ? "white" : "var(--color-text-secondary)",
                }}
              >
                All ({themes.length})
              </button>
              {Object.entries(categoryConfig).map(([key, config]) => {
                const count = categoryCounts[key] || 0;
                if (count === 0) return null;
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterCategory(filterCategory === key ? null : key)}
                    className="flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition-all"
                    style={{
                      background: filterCategory === key
                        ? `color-mix(in oklch, ${config.color} 20%, transparent)`
                        : "var(--color-bg-muted)",
                      color: filterCategory === key ? config.color : "var(--color-text-secondary)",
                      border: filterCategory === key ? `1px solid ${config.color}` : "1px solid transparent",
                    }}
                  >
                    <Icon size={11} />
                    {config.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Theme cards */}
            <div className="space-y-3">
              {filteredThemes.map((theme) => {
                const config = categoryConfig[theme.category] || categoryConfig.feature_request;
                const Icon = config.icon;
                const isExpanded = expandedTheme === theme.theme;

                return (
                  <div
                    key={theme.theme}
                    className="rounded-lg transition-all"
                    style={{
                      background: "var(--color-bg-card)",
                      border: "0.5px solid var(--color-border-default)",
                    }}
                  >
                    {/* Theme header */}
                    <button
                      onClick={() => setExpandedTheme(isExpanded ? null : theme.theme)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `color-mix(in oklch, ${config.color} 12%, transparent)` }}
                      >
                        <Icon size={14} style={{ color: config.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium"
                            style={{ color: "var(--color-text-primary)" }}>
                            {theme.theme}
                          </span>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: `color-mix(in oklch, ${config.color} 12%, transparent)`, color: config.color }}>
                            {config.label}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[12px]"
                          style={{ color: "var(--color-text-tertiary)" }}>
                          {theme.summary}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}>
                          {theme.frequency}x
                        </span>
                        {isExpanded ? <ChevronDown size={14} style={{ color: "var(--color-text-tertiary)" }} /> :
                          <ChevronRight size={14} style={{ color: "var(--color-text-tertiary)" }} />}
                      </div>
                    </button>

                    {/* Expanded mentions */}
                    {isExpanded && theme.mentions.length > 0 && (
                      <div className="px-4 pb-3" style={{ borderTop: "0.5px solid var(--color-border-default)" }}>
                        <div className="mt-3 space-y-2">
                          {theme.mentions.map((mention, idx) => (
                            <div key={idx} className="flex gap-3 rounded-md p-2"
                              style={{ background: "var(--color-bg-surface)" }}>
                              <div className="w-1 flex-shrink-0 rounded-full"
                                style={{ background: config.color, opacity: 0.5 }} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-[11px]"
                                  style={{ color: "var(--color-text-tertiary)" }}>
                                  <span style={{ fontWeight: 600 }}>{mention.company}</span>
                                  <span>/</span>
                                  <span>{mention.contact}</span>
                                  <span className="ml-auto">{mention.date}</span>
                                </div>
                                <div className="mt-1 text-[12px] italic"
                                  style={{ color: "var(--color-text-secondary)" }}>
                                  &ldquo;{mention.quote}&rdquo;
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
