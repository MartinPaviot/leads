"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KNOWLEDGE_STAGES } from "@/lib/knowledge/stages";

interface KnowledgeTopic {
  id: string;
  topic: string;
  content: string;
  /** Consumption stages (lib/knowledge/stages.ts) — assigned automatically
   * from the content on save; the chips are optional refinement only. */
  stages: string[];
}

export default function KnowledgeSettingsPage() {
  const [topics, setTopics] = useState<KnowledgeTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/knowledge");
      if (res.ok) {
        const data = await res.json();
        // API speaks `title`; this page's local shape is `topic`.
        setTopics(
          (data.knowledge || []).map(
            (k: { id: string; title?: string; topic?: string; content?: string; stages?: string[] }) => ({
              id: k.id,
              topic: k.title ?? k.topic ?? "",
              content: k.content ?? "",
              stages: Array.isArray(k.stages) ? k.stages : [],
            }),
          ),
        );
      }
    } catch {
      setError("Failed to load knowledge topics");
    } finally {
      setLoading(false);
    }
  }, []);

  // Industrialised company intake — read the workspace's website and write
  // the FDAE-style "Company — ..." sections (lib/knowledge/company-intake.ts).
  const [generating, setGenerating] = useState(false);
  const [genSummary, setGenSummary] = useState<string | null>(null);
  const [genGaps, setGenGaps] = useState<Array<{ question: string; why: string }>>([]);

  async function generateFromWebsite() {
    setGenerating(true);
    setError("");
    setGenSummary(null);
    setGenGaps([]);
    try {
      const res = await fetch("/api/settings/knowledge/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Website intake failed");
      } else {
        setGenSummary(
          `Read ${data.pages.length} page${data.pages.length === 1 ? "" : "s"} — ${data.created} section${data.created === 1 ? "" : "s"} created, ${data.updated} updated, ${data.unchanged} unchanged.`,
        );
        setGenGaps((data.gaps || []).slice(0, 6));
        await fetchTopics();
      }
    } catch {
      setError("Website intake failed");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  async function addTopic() {
    const newTopic = { id: "temp-" + Date.now(), topic: "", content: "", stages: [] };
    setTopics([...topics, newTopic]);
  }

  /** Toggle a consumption stage on an entry — persisted immediately for
   * saved entries; temp rows carry it into their first POST. */
  async function toggleStage(topic: KnowledgeTopic, stageKey: string) {
    const prevStages = topic.stages;
    const next = topic.stages.includes(stageKey)
      ? topic.stages.filter((s) => s !== stageKey)
      : [...topic.stages, stageKey];
    setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, stages: next } : t)));
    if (!topic.id.startsWith("temp-")) {
      const revert = () =>
        setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, stages: prevStages } : t)));
      try {
        const res = await fetch("/api/settings/knowledge", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: topic.id, stages: next }),
        });
        if (!res.ok) {
          // The PUT was never status-checked: a 500 left the toggle visually
          // flipped though it never persisted. Revert so the UI doesn't lie.
          revert();
          setError("Failed to update stages");
        }
      } catch {
        revert();
        setError("Failed to update stages");
      }
    }
  }

  async function saveTopic(topic: KnowledgeTopic) {
    if (!topic.topic.trim() || !topic.content.trim()) return;
    setSaving(topic.id);
    setError("");

    try {
      if (topic.id.startsWith("temp-")) {
        const res = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // No stages sent: the server classifies the entry from its
          // content ("write normally" — auto-stage, fail-soft).
          body: JSON.stringify({ title: topic.topic, content: topic.content }),
        });
        if (res.ok) {
          await fetchTopics();
        } else {
          setError("Failed to save topic");
        }
      } else {
        const res = await fetch("/api/settings/knowledge", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: topic.id, title: topic.topic, content: topic.content, stages: topic.stages }),
        });
        // PUT edit was never status-checked → a 500 looked like a saved edit.
        if (!res.ok) setError("Failed to save topic");
      }
    } catch {
      setError("Failed to save topic");
    } finally {
      setSaving(null);
    }
  }

  // E5 — knowledge deletes now route through ConfirmDialog. Temp rows
  // (never saved) skip the dialog since there's nothing destructive to
  // confirm — they exist only in local state.
  const [removeTopicId, setRemoveTopicId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  function removeTopic(id: string) {
    if (id.startsWith("temp-")) {
      setTopics(topics.filter((t) => t.id !== id));
      return;
    }
    setRemoveTopicId(id);
  }

  async function confirmRemoveTopic() {
    if (!removeTopicId) return;
    setRemoving(true);
    setError("");
    try {
      const res = await fetch(`/api/settings/knowledge?id=${removeTopicId}`, { method: "DELETE" });
      // DELETE was never status-checked → the topic vanished from the UI even
      // if the server delete failed. Only drop it on a confirmed success.
      if (res.ok) {
        setTopics((prev) => prev.filter((t) => t.id !== removeTopicId));
      } else {
        setError("Failed to remove topic");
      }
    } catch {
      setError("Failed to remove topic");
    } finally {
      setRemoving(false);
      setRemoveTopicId(null);
    }
  }

  function updateTopic(id: string, field: "topic" | "content", value: string) {
    setTopics(topics.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  function renderTopicCard(topic: KnowledgeTopic) {
    return (
      <Card key={topic.id}>
        <CardBody>
          {/* N14 — unsaved indicator. Topics created via "+ Add"
              keep a `temp-` id until the first successful POST. */}
          {topic.id.startsWith("temp-") && (
            <span
              className="mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: "var(--color-warning-soft)",
                color: "var(--color-warning)",
              }}
            >
              Unsaved
            </span>
          )}
          <Input
            label="Topic"
            value={topic.topic}
            onChange={(e) => updateTopic(topic.id, "topic", e.target.value)}
            placeholder="Title of topic"
          />
          <div className="mt-3">
            <Textarea
              label="Content"
              value={topic.content}
              onChange={(e) => updateTopic(topic.id, "content", e.target.value)}
              placeholder="Content of topic"
              rows={4}
            />
          </div>
          {/* Consumption stages — assigned automatically on save; the chips
              are optional refinement, never a required step. */}
          {topic.id.startsWith("temp-") ? (
            <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
              Where this gets used is assigned automatically when you save.
            </p>
          ) : (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">Used in:</span>
            {KNOWLEDGE_STAGES.map((s) => {
              const active = topic.stages.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleStage(topic, s.key)}
                  title={s.description}
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors"
                  style={
                    active
                      ? {
                          borderColor: "var(--color-text-secondary)",
                          color: "var(--color-text-primary)",
                          background: "var(--color-bg-hover)",
                        }
                      : {
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-tertiary)",
                        }
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="gradient"
              size="sm"
              onClick={() => saveTopic(topic)}
              disabled={saving === topic.id || !topic.topic.trim() || !topic.content.trim()}
              loading={saving === topic.id}
            >
              {saving === topic.id ? "Saving..." : "Save changes"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => removeTopic(topic.id)}>
              Remove
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <SettingsHeader
        title="Knowledge"
        subtitle="Give Elevay additional context on your business. This context will be included in AI requests for everyone in your organization."
      />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="md" onClick={addTopic}>
          + Add knowledge
        </Button>
        <Button variant="outline" size="md" onClick={generateFromWebsite} disabled={generating} loading={generating}>
          {generating ? "Reading your website..." : "Generate from website"}
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
      {genSummary && (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)] p-3">
          <p className="text-[12px] text-[var(--color-text-secondary)]">{genSummary}</p>
          {genGaps.length > 0 && (
            <div className="mt-2">
              <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
                What your website could not answer — worth adding by hand:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {genGaps.map((g, i) => (
                  <li key={i} className="text-[12px] text-[var(--color-text-secondary)]" title={g.why}>
                    {g.question}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <Card>
            <div className="py-8 text-center" style={{ borderStyle: "dashed" }}>
              <p className="text-sm text-[var(--color-text-tertiary)]">
                No knowledge topics yet. Add topics to help the AI understand your business.
              </p>
            </div>
          </Card>
        ) : (
          // Organised by CONSUMPTION STAGE (where the product pulls the
          // entry), not by topic. An entry shows under its primary stage;
          // the chips on each card curate all its stages.
          KNOWLEDGE_STAGES.map((stage) => {
            const inStage = topics.filter((t) => (t.stages[0] ?? "global") === stage.key);
            if (inStage.length === 0) return null;
            return (
              <section key={stage.key}>
                <div className="mb-2 mt-6 first:mt-0">
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {stage.label}
                    <span className="ml-2 text-[11px] font-normal text-[var(--color-text-tertiary)]">
                      {inStage.length}
                    </span>
                  </h2>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">{stage.description}</p>
                </div>
                <div className="space-y-4">{inStage.map((topic) => renderTopicCard(topic))}</div>
              </section>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={removeTopicId !== null}
        title="Remove this knowledge topic?"
        description="This topic will stop being included in Elevay's AI context for your workspace. You can add it again later."
        confirmLabel="Remove topic"
        variant="destructive"
        onConfirm={confirmRemoveTopic}
        onCancel={() => setRemoveTopicId(null)}
        busy={removing}
      />
    </>
  );
}
