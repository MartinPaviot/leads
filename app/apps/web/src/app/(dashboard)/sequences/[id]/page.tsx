"use client";

import { useState, useEffect, useCallback, use } from "react";

interface Step {
  id: string;
  stepNumber: number;
  subjectTemplate: string;
  bodyTemplate: string;
  delayDays: number;
}

interface Enrollment {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  status: string;
  currentStep: number;
  enrolledAt: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // Step form
  const [showAddStep, setShowAddStep] = useState(false);
  const [stepSubject, setStepSubject] = useState("");
  const [stepBody, setStepBody] = useState("");
  const [stepDelay, setStepDelay] = useState(2);
  const [addingStep, setAddingStep] = useState(false);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchSequence = useCallback(async () => {
    try {
      const res = await fetch(`/api/sequences/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSequence(data.sequence);
        setSteps(data.steps || []);
        setEnrollments(data.enrollments || []);
      }
    } catch {
      console.error("Failed to fetch sequence");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSequence();
  }, [fetchSequence]);

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    if (!stepSubject.trim() || !stepBody.trim()) return;
    setAddingStep(true);

    try {
      const res = await fetch(`/api/sequences/${id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: stepSubject.trim(),
          bodyTemplate: stepBody.trim(),
          delayDays: stepDelay,
        }),
      });
      if (res.ok) {
        setStepSubject("");
        setStepBody("");
        setStepDelay(2);
        setShowAddStep(false);
        fetchSequence();
      }
    } catch {
      console.error("Failed to add step");
    } finally {
      setAddingStep(false);
    }
  }

  async function toggleStatus() {
    if (!sequence) return;
    setUpdatingStatus(true);
    const newStatus = sequence.status === "active" ? "paused" : "active";

    try {
      const res = await fetch(`/api/sequences/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchSequence();
      }
    } catch {
      console.error("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-[var(--color-text-tertiary)]">Loading...</div>;
  if (!sequence) return <div className="p-6 text-sm text-red-400">Sequence not found</div>;

  const statusColor = sequence.status === "active" ? "text-emerald-400" : sequence.status === "paused" ? "text-amber-400" : "text-[var(--color-text-tertiary)]";

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{sequence.name}</h1>
          {sequence.description && (
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{sequence.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium uppercase ${statusColor}`}>{sequence.status}</span>
          <button
            onClick={toggleStatus}
            disabled={updatingStatus}
            className="rounded-lg border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            {sequence.status === "active" ? "Pause" : "Activate"}
          </button>
        </div>
      </div>

      {/* Steps */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Steps ({steps.length})
          </h2>
          <button
            onClick={() => setShowAddStep(true)}
            className="text-sm text-[var(--color-accent)] hover:opacity-90"
          >
            + Add Step
          </button>
        </div>

        {showAddStep && (
          <form onSubmit={handleAddStep} className="mt-3 space-y-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-4">
            <input
              value={stepSubject}
              onChange={(e) => setStepSubject(e.target.value)}
              placeholder="Subject template (use {{firstName}}, {{company}})"
              autoFocus
              className="w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <textarea
              value={stepBody}
              onChange={(e) => setStepBody(e.target.value)}
              placeholder="Body template..."
              rows={4}
              className="w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--color-text-tertiary)]">Delay (days):</label>
              <input
                type="number"
                value={stepDelay}
                onChange={(e) => setStepDelay(Number(e.target.value))}
                min={0}
                max={30}
                className="w-16 rounded border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addingStep || !stepSubject.trim() || !stepBody.trim()}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {addingStep ? "Adding..." : "Add Step"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddStep(false)}
                className="rounded-lg border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mt-3 space-y-2">
          {steps.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)]">No steps yet. Add a step to get started.</p>
          ) : (
            steps.map((step) => (
              <div key={step.id} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--color-accent)]">Step {step.stepNumber}</span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {step.delayDays > 0 ? `Wait ${step.delayDays} day${step.delayDays > 1 ? "s" : ""}` : "Immediate"}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{step.subjectTemplate}</p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)] line-clamp-2">{step.bodyTemplate}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* AI-Suggested Enrollments (G4: Approve/Reject Flow) */}
      {sequence.status === "active" && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            AI Suggestions
          </h2>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Contacts recommended for enrollment based on scoring and signals.
          </p>
          <AISuggestions sequenceId={id} onApprove={fetchSequence} />
        </section>
      )}

      {/* Enrollments */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Enrolled ({enrollments.length})
        </h2>
        <div className="mt-3">
          {enrollments.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)]">No contacts enrolled yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  <th className="pb-2 pr-4">Contact</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Step</th>
                  <th className="pb-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="border-b border-[rgba(255,255,255,0.08)]">
                    <td className="py-2 pr-4 text-[var(--color-text-primary)]">{enrollment.contactName}</td>
                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{enrollment.contactEmail || "—"}</td>
                    <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{enrollment.currentStep}/{steps.length}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-medium ${
                        enrollment.status === "active" ? "text-emerald-400" :
                        enrollment.status === "completed" ? "text-blue-400" :
                        enrollment.status === "replied" ? "text-purple-400" :
                        "text-[var(--color-text-tertiary)]"
                      }`}>
                        {enrollment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// G4: AI-suggested enrollment cards with approve/reject
function AISuggestions({ sequenceId, onApprove }: { sequenceId: string; onApprove: () => void }) {
  const [suggestions, setSuggestions] = useState<Array<{
    contactId: string;
    contactName: string;
    companyName: string;
    reason: string;
    score: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [enrolling, setEnrolling] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function fetchSuggestions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  async function approveSuggestion(contactId: string) {
    setEnrolling((prev) => ({ ...prev, [contactId]: true }));
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId] }),
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((s) => s.contactId !== contactId));
        onApprove();
      }
    } catch {
      // Handle error
    } finally {
      setEnrolling((prev) => ({ ...prev, [contactId]: false }));
    }
  }

  function rejectSuggestion(contactId: string) {
    setDismissed((prev) => new Set(prev).add(contactId));
  }

  const visible = suggestions.filter((s) => !dismissed.has(s.contactId));

  if (!fetched) {
    return (
      <button
        onClick={fetchSuggestions}
        disabled={loading}
        className="mt-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] px-4 py-3 text-sm text-[var(--color-accent)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] w-full"
      >
        {loading ? "Finding suggestions..." : "Get AI Suggestions"}
      </button>
    );
  }

  if (visible.length === 0) {
    return <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No suggestions right now.</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {visible.map((suggestion) => (
        <div
          key={suggestion.contactId}
          className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{suggestion.contactName}</p>
              <span className="text-xs text-[var(--color-accent)]">{suggestion.companyName}</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{suggestion.reason}</p>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <button
              onClick={() => rejectSuggestion(suggestion.contactId)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.08)] text-[var(--color-text-tertiary)] hover:border-red-500/30 hover:text-red-400"
              title="Reject"
            >
              👎
            </button>
            <button
              onClick={() => approveSuggestion(suggestion.contactId)}
              disabled={enrolling[suggestion.contactId]}
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-[var(--color-bg-base)] hover:bg-gray-100 disabled:opacity-50"
            >
              {enrolling[suggestion.contactId] ? "..." : "Start"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
