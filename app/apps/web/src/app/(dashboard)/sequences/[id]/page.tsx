"use client";

import { useState, useEffect, useCallback, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

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

  const statusBadgeVariant: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
    active: "success",
    paused: "warning",
    draft: "neutral",
    archived: "neutral",
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={sequence.name}
        subtitle={sequence.description || undefined}
      >
        <Badge variant={statusBadgeVariant[sequence.status] || "neutral"} size="md">
          {sequence.status.toUpperCase()}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleStatus}
          loading={updatingStatus}
        >
          {sequence.status === "active" ? "Pause" : "Activate"}
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        {/* Steps */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Steps ({steps.length})
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setShowAddStep(true)}>
              + Add Step
            </Button>
          </div>

          {showAddStep && (
            <Card className="mt-3">
              <CardBody>
                <form onSubmit={handleAddStep} className="space-y-2">
                  <input
                    value={stepSubject}
                    onChange={(e) => setStepSubject(e.target.value)}
                    placeholder="Subject template (use {{firstName}}, {{company}})"
                    autoFocus
                    className="w-full rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
                    style={{
                      background: "var(--color-bg-page)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  />
                  <textarea
                    value={stepBody}
                    onChange={(e) => setStepBody(e.target.value)}
                    placeholder="Body template..."
                    rows={4}
                    className="w-full rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
                    style={{
                      background: "var(--color-bg-page)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[var(--color-text-tertiary)]">Delay (days):</label>
                    <input
                      type="number"
                      value={stepDelay}
                      onChange={(e) => setStepDelay(Number(e.target.value))}
                      min={0}
                      max={30}
                      className="w-16 rounded px-2 py-1 text-sm text-[var(--color-text-primary)]"
                      style={{
                        background: "var(--color-bg-page)",
                        border: "1px solid var(--color-border-default)",
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="solid"
                      loading={addingStep}
                      disabled={!stepSubject.trim() || !stepBody.trim()}
                    >
                      {addingStep ? "Adding..." : "Add Step"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddStep(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}

          <div className="mt-3 space-y-2">
            {steps.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">No steps yet. Add a step to get started.</p>
            ) : (
              steps.map((step) => (
                <Card key={step.id}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--color-accent)]">Step {step.stepNumber}</span>
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {step.delayDays > 0 ? `Wait ${step.delayDays} day${step.delayDays > 1 ? "s" : ""}` : "Immediate"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{step.subjectTemplate}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)] line-clamp-2">{step.bodyTemplate}</p>
                  </CardBody>
                </Card>
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
                  <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                    <th className="pb-2 pr-4">Contact</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Step</th>
                    <th className="pb-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((enrollment) => (
                    <tr key={enrollment.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                      <td className="py-2 pr-4 text-[var(--color-text-primary)]">{enrollment.contactName}</td>
                      <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{enrollment.contactEmail || "—"}</td>
                      <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{enrollment.currentStep}/{steps.length}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            enrollment.status === "active" ? "success" :
                            enrollment.status === "completed" ? "info" :
                            enrollment.status === "replied" ? "info" :
                            "neutral"
                          }
                        >
                          {enrollment.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
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
      <Button
        variant="outline"
        onClick={fetchSuggestions}
        loading={loading}
        className="mt-2 w-full"
      >
        {loading ? "Finding suggestions..." : "Get AI Suggestions"}
      </Button>
    );
  }

  if (visible.length === 0) {
    return <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No suggestions right now.</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {visible.map((suggestion) => (
        <Card key={suggestion.contactId}>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{suggestion.contactName}</p>
                  <span className="text-xs text-[var(--color-accent)]">{suggestion.companyName}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{suggestion.reason}</p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rejectSuggestion(suggestion.contactId)}
                  title="Reject"
                >
                  Reject
                </Button>
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={() => approveSuggestion(suggestion.contactId)}
                  loading={enrolling[suggestion.contactId]}
                >
                  {enrolling[suggestion.contactId] ? "..." : "Start"}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
