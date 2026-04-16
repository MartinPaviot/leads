"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface KnowledgeTopic {
  id: string;
  topic: string;
  content: string;
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
        setTopics(data.knowledge || []);
      }
    } catch {
      setError("Failed to load knowledge topics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  async function addTopic() {
    const newTopic = { id: "temp-" + Date.now(), topic: "", content: "" };
    setTopics([...topics, newTopic]);
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
          body: JSON.stringify({ topic: topic.topic, content: topic.content }),
        });
        if (res.ok) {
          await fetchTopics();
        } else {
          setError("Failed to save topic");
        }
      } else {
        await fetch("/api/settings/knowledge", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: topic.id, topic: topic.topic, content: topic.content }),
        });
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
      await fetch(`/api/settings/knowledge?id=${removeTopicId}`, { method: "DELETE" });
      setTopics((prev) => prev.filter((t) => t.id !== removeTopicId));
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

  return (
    <>
      <h1 className="text-xl font-semibold">Knowledge</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Give Elevay additional context on your business. This context will be
        included in AI requests for everyone in your organization.
      </p>

      <Button variant="outline" size="md" onClick={addTopic} className="mt-4">
        + Add knowledge
      </Button>
      {error && <p className="mt-2 text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}

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
          topics.map((topic) => (
            <Card key={topic.id}>
              <CardBody>
                {/* N14 — unsaved indicator. Topics created via "+ Add"
                    keep a `temp-` id until the first successful POST.
                    The id never renders, but a small badge tells the
                    user the row only exists locally so they don't
                    assume "Add" already saved it. */}
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
          ))
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
