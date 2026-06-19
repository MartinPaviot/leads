"use client";

/**
 * Per-feature autonomy hub (INBOX-T11 / O06) settings.
 *
 * One screen to set how much each AI-native inbox feature may act: Off /
 * Suggest / Auto. Saved owner-scoped (user_preferences JSONB) and read by
 * feature code via resolveFeatureAutonomy. Outward-writing features (drafting,
 * sending) cap at Suggest — the dial can never make the inbox act on its own.
 */

import { useEffect, useState } from "react";
import { Sliders, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type FeatureAutonomy = "off" | "suggest" | "auto";
interface AutonomyFeature {
  id: string;
  label: string;
  description: string;
  ceiling: FeatureAutonomy;
  default: FeatureAutonomy;
}
type AutonomySettings = Record<string, FeatureAutonomy>;

const ORDER: FeatureAutonomy[] = ["off", "suggest", "auto"];
const LABELS: Record<FeatureAutonomy, string> = { off: "Off", suggest: "Suggest", auto: "Auto" };

function levelsUpTo(ceiling: FeatureAutonomy): FeatureAutonomy[] {
  return ORDER.filter((l) => ORDER.indexOf(l) <= ORDER.indexOf(ceiling));
}

export default function InboxAutonomyPage() {
  const [catalog, setCatalog] = useState<AutonomyFeature[]>([]);
  const [settings, setSettings] = useState<AutonomySettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/autonomy")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { catalog?: AutonomyFeature[]; settings?: AutonomySettings }) => {
        if (!cancelled) {
          setCatalog(data.catalog ?? []);
          setSettings(data.settings ?? {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function effective(f: AutonomyFeature): FeatureAutonomy {
    const chosen = settings[f.id];
    const level = chosen && ORDER.includes(chosen) ? chosen : f.default;
    return ORDER.indexOf(level) > ORDER.indexOf(f.ceiling) ? f.ceiling : level;
  }

  function setLevel(id: string, level: FeatureAutonomy) {
    setSettings((s) => ({ ...s, [id]: level }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch("/api/inbox/autonomy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (r.ok) {
        const data = (await r.json()) as { settings?: AutonomySettings };
        if (data.settings) setSettings(data.settings);
        setSaved(true);
      }
    } catch {
      /* fail-soft */
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        <Sliders size={16} /> Autonomy
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Decide how much each feature can do on its own. <strong>Off</strong> hides it, <strong>Suggest</strong> stages
        actions for one-click approval, <strong>Auto</strong> lets it act and logs an audit entry. Drafting and sending
        stay at Suggest — the inbox never sends on its own.
      </p>

      <div className="mt-5 divide-y" style={{ borderColor: "var(--color-border-default)" }}>
        {catalog.map((f) => {
          const current = effective(f);
          const options = levelsUpTo(f.ceiling);
          return (
            <div key={f.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {f.label}
                </div>
                <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {f.description}
                </div>
              </div>
              <div
                className="flex shrink-0 overflow-hidden rounded-md border"
                style={{ borderColor: "var(--color-border-default)" }}
                role="radiogroup"
                aria-label={`${f.label} autonomy`}
              >
                {options.map((lvl) => {
                  const selected = current === lvl;
                  return (
                    <button
                      key={lvl}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLevel(f.id, lvl)}
                      className="px-2.5 py-1 text-[12px]"
                      style={{
                        background: selected ? "var(--color-accent)" : "transparent",
                        color: selected ? "var(--color-accent-foreground, #fff)" : "var(--color-text-secondary)",
                      }}
                    >
                      {LABELS[lvl]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && (
          <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Saved.
          </span>
        )}
      </div>
    </div>
  );
}
