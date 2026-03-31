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

  if (loading) return <div className="p-6 text-sm text-[#5a5a70]">Loading...</div>;
  if (!sequence) return <div className="p-6 text-sm text-red-400">Sequence not found</div>;

  const statusColor = sequence.status === "active" ? "text-emerald-400" : sequence.status === "paused" ? "text-amber-400" : "text-[#5a5a70]";

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{sequence.name}</h1>
          {sequence.description && (
            <p className="mt-1 text-sm text-[#5a5a70]">{sequence.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium uppercase ${statusColor}`}>{sequence.status}</span>
          <button
            onClick={toggleStatus}
            disabled={updatingStatus}
            className="rounded-lg border border-[#1e1f2a] px-3 py-1.5 text-sm text-[#8b8ba0] hover:text-[#e8e8ed] disabled:opacity-50"
          >
            {sequence.status === "active" ? "Pause" : "Activate"}
          </button>
        </div>
      </div>

      {/* Steps */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
            Steps ({steps.length})
          </h2>
          <button
            onClick={() => setShowAddStep(true)}
            className="text-sm text-[#6366f1] hover:text-[#5558e6]"
          >
            + Add Step
          </button>
        </div>

        {showAddStep && (
          <form onSubmit={handleAddStep} className="mt-3 space-y-2 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4">
            <input
              value={stepSubject}
              onChange={(e) => setStepSubject(e.target.value)}
              placeholder="Subject template (use {{firstName}}, {{company}})"
              autoFocus
              className="w-full rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
            <textarea
              value={stepBody}
              onChange={(e) => setStepBody(e.target.value)}
              placeholder="Body template..."
              rows={4}
              className="w-full rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#5a5a70]">Delay (days):</label>
              <input
                type="number"
                value={stepDelay}
                onChange={(e) => setStepDelay(Number(e.target.value))}
                min={0}
                max={30}
                className="w-16 rounded border border-[#1e1f2a] bg-[#0a0b0f] px-2 py-1 text-sm text-[#e8e8ed]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addingStep || !stepSubject.trim() || !stepBody.trim()}
                className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
              >
                {addingStep ? "Adding..." : "Add Step"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddStep(false)}
                className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm text-[#8b8ba0]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mt-3 space-y-2">
          {steps.length === 0 ? (
            <p className="text-sm text-[#5a5a70]">No steps yet. Add a step to get started.</p>
          ) : (
            steps.map((step) => (
              <div key={step.id} className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#6366f1]">Step {step.stepNumber}</span>
                  <span className="text-xs text-[#5a5a70]">
                    {step.delayDays > 0 ? `Wait ${step.delayDays} day${step.delayDays > 1 ? "s" : ""}` : "Immediate"}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-[#e8e8ed]">{step.subjectTemplate}</p>
                <p className="mt-1 text-xs text-[#5a5a70] line-clamp-2">{step.bodyTemplate}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Enrollments */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Enrolled ({enrollments.length})
        </h2>
        <div className="mt-3">
          {enrollments.length === 0 ? (
            <p className="text-sm text-[#5a5a70]">No contacts enrolled yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#1e1f2a] text-[11px] uppercase tracking-wider text-[#5a5a70]">
                  <th className="pb-2 pr-4">Contact</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Step</th>
                  <th className="pb-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="border-b border-[#1e1f2a]">
                    <td className="py-2 pr-4 text-[#e8e8ed]">{enrollment.contactName}</td>
                    <td className="py-2 pr-4 text-[#8b8ba0]">{enrollment.contactEmail || "—"}</td>
                    <td className="py-2 pr-4 text-[#8b8ba0]">{enrollment.currentStep}/{steps.length}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-medium ${
                        enrollment.status === "active" ? "text-emerald-400" :
                        enrollment.status === "completed" ? "text-blue-400" :
                        enrollment.status === "replied" ? "text-purple-400" :
                        "text-[#5a5a70]"
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
