"use client";

import { useState, useEffect, useCallback } from "react";

interface KnowledgeTopic {
  id: string;
  topic: string;
  content: string;
}

export default function KnowledgeSettingsPage() {
  const [topics, setTopics] = useState<KnowledgeTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/knowledge");
      if (res.ok) {
        const data = await res.json();
        setTopics(data.knowledge || []);
      }
    } catch {
      console.error("Failed to fetch knowledge");
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

    try {
      if (topic.id.startsWith("temp-")) {
        const res = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: topic.topic, content: topic.content }),
        });
        if (res.ok) {
          await fetchTopics();
        }
      } else {
        await fetch("/api/settings/knowledge", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: topic.id, topic: topic.topic, content: topic.content }),
        });
      }
    } catch {
      console.error("Failed to save topic");
    } finally {
      setSaving(null);
    }
  }

  async function removeTopic(id: string) {
    if (id.startsWith("temp-")) {
      setTopics(topics.filter((t) => t.id !== id));
      return;
    }

    try {
      await fetch(`/api/settings/knowledge?id=${id}`, { method: "DELETE" });
      setTopics(topics.filter((t) => t.id !== id));
    } catch {
      console.error("Failed to remove topic");
    }
  }

  function updateTopic(id: string, field: "topic" | "content", value: string) {
    setTopics(topics.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Knowledge</h1>
      <p className="mt-1 text-sm text-[#8b8ba0]">
        Give LeadSens additional context on your business. This context will be
        included in AI requests for everyone in your organization.
      </p>

      <button
        onClick={addTopic}
        className="mt-4 rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm text-[#8b8ba0] hover:border-[#6366f1] hover:text-[#e8e8ed]"
      >
        + Add knowledge
      </button>

      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-[#1e1f2a]" />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#1e1f2a] py-8 text-center">
            <p className="text-sm text-[#5a5a70]">
              No knowledge topics yet. Add topics to help the AI understand your business.
            </p>
          </div>
        ) : (
          topics.map((topic) => (
            <div
              key={topic.id}
              className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4"
            >
              <div>
                <label className="text-xs text-[#5a5a70]">Topic</label>
                <input
                  value={topic.topic}
                  onChange={(e) => updateTopic(topic.id, "topic", e.target.value)}
                  placeholder="Title of topic"
                  className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
                />
              </div>
              <div className="mt-3">
                <label className="text-xs text-[#5a5a70]">Content</label>
                <textarea
                  value={topic.content}
                  onChange={(e) => updateTopic(topic.id, "content", e.target.value)}
                  placeholder="Content of topic"
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => saveTopic(topic)}
                  disabled={saving === topic.id || !topic.topic.trim() || !topic.content.trim()}
                  className="rounded-lg bg-[#6366f1] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
                >
                  {saving === topic.id ? "Saving..." : "Save changes"}
                </button>
                <button
                  onClick={() => removeTopic(topic.id)}
                  className="rounded-lg px-3 py-1.5 text-sm text-[#8b8ba0] hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
