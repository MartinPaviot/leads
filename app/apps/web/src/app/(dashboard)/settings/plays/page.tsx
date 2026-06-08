"use client";

import { useState, useEffect } from "react";
import { Layers, Plus, X, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface Play {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  guidelines: string;
  trigger: string | null;
  examples: unknown;
  version: number | null;
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  { value: "qualification", label: "Qualification" },
  { value: "discovery", label: "Discovery" },
  { value: "proposal", label: "Proposal" },
  { value: "objection", label: "Objection Handling" },
  { value: "closing", label: "Closing" },
  { value: "re_engage", label: "Re-engage" },
];

export default function PlaysSettingsPage() {
  const { toast } = useToast();
  const [plays, setPlays] = useState<Play[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Play | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "qualification",
    description: "",
    guidelines: "",
    trigger: "",
  });

  async function fetchPlays() {
    try {
      const res = await fetch("/api/settings/plays");
      if (res.ok) {
        const data = await res.json();
        setPlays(data.plays || []);
      }
    } catch (e) {
      console.warn("plays: fetch failed", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlays(); }, []);

  function openCreate() {
    setForm({ name: "", category: "qualification", description: "", guidelines: "", trigger: "" });
    setEditing(null);
    setCreating(true);
  }

  function openEdit(play: Play) {
    setForm({
      name: play.name,
      category: play.category,
      description: play.description,
      guidelines: play.guidelines,
      trigger: play.trigger || "",
    });
    setEditing(play);
    setCreating(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.guidelines.trim()) {
      toast("Name and guidelines are required", "error");
      return;
    }

    try {
      if (editing) {
        const res = await fetch(`/api/settings/plays/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          toast("Play updated", "success");
          setCreating(false);
          setEditing(null);
          fetchPlays();
        } else {
          toast("Failed to update play", "error");
        }
      } else {
        const res = await fetch("/api/settings/plays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          toast("Play created", "success");
          setCreating(false);
          fetchPlays();
        } else {
          toast("Failed to create play", "error");
        }
      }
    } catch {
      toast("Failed to save play", "error");
    }
  }

  async function handleToggle(play: Play) {
    try {
      await fetch(`/api/settings/plays/${play.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !play.isActive }),
      });
      fetchPlays();
    } catch {
      toast("Failed to toggle play", "error");
    }
  }

  async function handleDelete(play: Play) {
    try {
      await fetch(`/api/settings/plays/${play.id}`, { method: "DELETE" });
      toast("Play deleted", "success");
      fetchPlays();
    } catch {
      toast("Failed to delete play", "error");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <SettingsHeader
            title="Sales Plays"
            subtitle="Codify your sales process into repeatable plays. The agent uses active plays as context when drafting proposals, handling objections, or coaching deals."
          />
        </div>
        <Button variant="gradient" size="sm" icon={<Plus size={12} />} onClick={openCreate}>
          Add play
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg animate-pulse" style={{ background: "var(--color-bg-secondary)" }} />
          ))}
        </div>
      ) : plays.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: "var(--color-bg-secondary)" }}>
          <Layers size={32} style={{ color: "var(--color-text-muted)" }} />
          <h3 className="mt-3 text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            No plays yet
          </h3>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Create your first play to codify how you qualify leads, handle objections, or draft proposals.
          </p>
          <Button variant="gradient" size="sm" className="mt-4" icon={<Plus size={12} />} onClick={openCreate}>
            Add your first play
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {plays.map((play) => (
            <div
              key={play.id}
              className="flex items-center justify-between rounded-lg px-4 py-3 cursor-pointer transition-colors"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
                opacity: play.isActive === false ? 0.5 : 1,
              }}
              onClick={() => openEdit(play)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {play.name}
                  </span>
                  <Badge variant="info" size="sm">{play.category}</Badge>
                  {play.version && play.version > 1 && (
                    <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>v{play.version}</span>
                  )}
                </div>
                {play.description && (
                  <p className="mt-0.5 text-[12px] truncate" style={{ color: "var(--color-text-tertiary)" }}>
                    {play.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleToggle(play)}
                  className="relative inline-flex h-5 w-9 rounded-full transition-colors"
                  style={{
                    background: play.isActive !== false ? "var(--color-accent)" : "var(--color-bg-muted)",
                  }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform shadow-sm"
                    style={{ left: play.isActive !== false ? 18 : 2 }}
                  />
                </button>
                <button
                  onClick={() => handleDelete(play)}
                  className="p-1 rounded transition-colors hover:bg-red-50"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="w-full max-w-xl rounded-xl p-6 shadow-xl" style={{ background: "var(--color-bg-card)", maxHeight: "calc(100vh - 2rem)", overflow: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {editing ? "Edit Play" : "New Play"}
              </h3>
              <button onClick={() => { setCreating(false); setEditing(null); }} style={{ color: "var(--color-text-tertiary)" }}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Enterprise Proposal Template" />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                  style={{ background: "var(--color-bg-muted)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description of what this play does" />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Guidelines <span style={{ color: "var(--color-text-muted)" }}>(markdown)</span>
                </label>
                <textarea
                  value={form.guidelines}
                  onChange={(e) => setForm({ ...form, guidelines: e.target.value })}
                  placeholder={"# How to run this play\n\n1. Start by...\n2. Then ask about...\n3. Close with..."}
                  className="w-full rounded-lg p-3 text-[13px] font-mono outline-none"
                  rows={8}
                  style={{ background: "var(--color-bg-muted)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)", resize: "vertical" }}
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Trigger <span style={{ color: "var(--color-text-muted)" }}>(optional — when to suggest this play)</span>
                </label>
                <Input value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} placeholder="e.g., When deal reaches proposal stage" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
              <Button variant="gradient" size="sm" icon={<Check size={12} />} onClick={handleSave}>
                {editing ? "Save changes" : "Create play"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
