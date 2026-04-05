"use client";

import { useState, useEffect } from "react";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, Tag } from "@/components/ui/badge";
import {
  INDUSTRIES,
  COMPANY_SIZES,
  SALES_MOTIONS,
  DECISION_MAKER_ROLES,
  GEOGRAPHIES,
} from "@/lib/icp-constants";

export default function IcpSettingsPage() {
  const [productDescription, setProductDescription] = useState("");
  const [salesMotion, setSalesMotion] = useState("");
  const [primaryChallenge, setPrimaryChallenge] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [targetCompanySizes, setTargetCompanySizes] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState("");
  const [targetGeographies, setTargetGeographies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/icp")
      .then((r) => r.json())
      .then((data) => {
        setProductDescription(data.productDescription || "");
        setSalesMotion(data.salesMotion || "");
        setPrimaryChallenge(data.primaryChallenge || "");
        setAiTone(data.aiTone || "");
        setTargetIndustries(data.targetIndustries || []);
        setTargetCompanySizes(data.targetCompanySizes || []);
        setTargetRoles(data.targetRoles || "");
        setTargetGeographies(data.targetGeographies || []);
        setLoaded(true);
      })
      .catch(() => setError("Failed to load ICP settings"));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/icp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDescription, salesMotion, primaryChallenge, aiTone,
          targetIndustries, targetCompanySizes, targetRoles, targetGeographies,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setError("");
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save ICP settings");
      }
    } catch {
      setError("Failed to save ICP settings");
    } finally {
      setSaving(false);
    }
  }

  function toggleArrayItem(arr: string[], item: string, setter: (v: string[]) => void) {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  }

  if (!loaded) return null;

  return (
    <>
      <h1
        className="text-[24px] font-bold"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
      >
        ICP & Product
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Define your ideal customer profile and product context. This data drives AI scoring, outbound targeting, and deal coaching.
      </p>

      <div className="mt-8 space-y-8">
        {/* Product context */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Product context
          </h2>

          <div className="mt-4 space-y-4">
            <Textarea
              label="Product description"
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Describe what your product does and who it's for..."
              autoResize
            />

            <Select
              label="Sales motion"
              value={salesMotion}
              onChange={(e) => setSalesMotion(e.target.value)}
              options={[
                { value: "", label: "Select..." },
                ...SALES_MOTIONS.map((m) => ({ value: m, label: m })),
              ]}
            />

            <Textarea
              label="Primary challenge"
              value={primaryChallenge}
              onChange={(e) => setPrimaryChallenge(e.target.value)}
              placeholder="What's the main challenge you're solving for customers?"
              autoResize
            />

            <Select
              label="AI tone"
              value={aiTone}
              onChange={(e) => setAiTone(e.target.value)}
              options={[
                { value: "", label: "Select..." },
                { value: "Direct", label: "Direct" },
                { value: "Friendly", label: "Friendly" },
                { value: "Formal", label: "Formal" },
                { value: "Casual", label: "Casual" },
                { value: "Technical", label: "Technical" },
              ]}
            />
          </div>
        </section>

        {/* Target industries */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Target industries
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Select the industries your ideal customers belong to.
          </p>

          {targetIndustries.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {targetIndustries.map((ind) => (
                <Tag key={ind} onRemove={() => toggleArrayItem(targetIndustries, ind, setTargetIndustries)}>
                  {ind}
                </Tag>
              ))}
            </div>
          )}

          <MultiSelectDropdown
            options={INDUSTRIES}
            selected={targetIndustries}
            onToggle={(item) => toggleArrayItem(targetIndustries, item, setTargetIndustries)}
            placeholder="Search industries..."
          />
        </section>

        {/* Target company sizes */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Company sizes
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(COMPANY_SIZES).map((size) => {
              const selected = targetCompanySizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleArrayItem(targetCompanySizes, size, setTargetCompanySizes)}
                  className="rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    background: selected ? "var(--color-accent-soft)" : "var(--color-bg-card)",
                    color: selected ? "var(--color-accent)" : "var(--color-text-secondary)",
                    border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border-default)"}`,
                  }}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </section>

        {/* Target roles */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Decision-maker roles
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Comma-separated list of roles you want to target.
          </p>

          <div className="mt-3">
            <Textarea
              value={targetRoles}
              onChange={(e) => setTargetRoles(e.target.value)}
              placeholder="CEO, CTO, VP Engineering, Head of Product..."
              autoResize
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {(DECISION_MAKER_ROLES).slice(0, 20).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  const current = targetRoles.split(",").map((r) => r.trim()).filter(Boolean);
                  if (!current.includes(role)) {
                    setTargetRoles([...current, role].join(", "));
                  }
                }}
                className="rounded px-2 py-0.5 text-[11px] transition-colors"
                style={{
                  background: "var(--color-bg-card)",
                  color: "var(--color-text-tertiary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                + {role}
              </button>
            ))}
          </div>
        </section>

        {/* Target geographies */}
        <section>
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Geographies
          </h2>

          {targetGeographies.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {targetGeographies.map((geo) => (
                <Tag key={geo} onRemove={() => toggleArrayItem(targetGeographies, geo, setTargetGeographies)}>
                  {geo}
                </Tag>
              ))}
            </div>
          )}

          <MultiSelectDropdown
            options={GEOGRAPHIES}
            selected={targetGeographies}
            onToggle={(item) => toggleArrayItem(targetGeographies, item, setTargetGeographies)}
            placeholder="Search geographies..."
          />
        </section>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="solid" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
          {saved && <Badge variant="success">Saved</Badge>}
          {error && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
        </div>
      </div>
    </>
  );
}

/* ── Searchable multi-select dropdown ── */
function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  placeholder,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = options.filter(
    (o) => o.toLowerCase().includes(search.toLowerCase()) && !selected.includes(o)
  );

  return (
    <div className="relative mt-2">
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && search && filtered.length > 0 && (
        <div
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md py-1 shadow-lg"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          {filtered.slice(0, 20).map((item) => (
            <button
              key={item}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onToggle(item);
                setSearch("");
                setOpen(false);
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(""); }} />
      )}
    </div>
  );
}
