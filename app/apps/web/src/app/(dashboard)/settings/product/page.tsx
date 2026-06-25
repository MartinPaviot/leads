"use client";

/**
 * /settings/product — Product & Voice (Phase 1, _specs/icp-unification
 * R4.9). What you sell and how Elevay writes for you — consumed by the
 * chat system prompt, call scripts, sequences, replies and proposals.
 * Split out of the legacy "ICP & Product" page: seller context is not
 * targeting.
 */

import { useEffect, useState } from "react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SALES_MOTIONS } from "@/lib/config/icp-constants";

export default function ProductVoicePage() {
  const [productDescription, setProductDescription] = useState("");
  const [salesMotion, setSalesMotion] = useState("");
  const [primaryChallenge, setPrimaryChallenge] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/product")
      // Was `.then(r => r.json())` with no status check: a 500's error body
      // parsed into empty fields, so the form rendered blank with no error.
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load settings");
        return r.json();
      })
      .then((data) => {
        setProductDescription(data.productDescription || "");
        setSalesMotion(data.salesMotion || "");
        setPrimaryChallenge(data.primaryChallenge || "");
        setAiTone(data.aiTone || "");
        setLoaded(true);
      })
      .catch(() => { setError("Failed to load settings"); setLoaded(true); });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/product", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDescription, salesMotion, primaryChallenge, aiTone }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save");
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <div>
      <SettingsHeader
        title="Product & Voice"
        subtitle="What you sell and how Elevay writes for you. Used by chat, call scripts, sequences and proposals."
      />

      <div className="max-w-2xl space-y-4">
        <Textarea
          label="Product description"
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          placeholder="Describe what your product does and who it's for…"
          autoResize
        />
        <Select
          label="Sales motion"
          value={salesMotion}
          onChange={(e) => setSalesMotion(e.target.value)}
          options={[
            { value: "", label: "Select…" },
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
            { value: "", label: "Select…" },
            { value: "Direct", label: "Direct" },
            { value: "Friendly", label: "Friendly" },
            { value: "Formal", label: "Formal" },
            { value: "Casual", label: "Casual" },
            { value: "Technical", label: "Technical" },
          ]}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button variant="solid" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && <Badge variant="success">Saved</Badge>}
          {error && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
