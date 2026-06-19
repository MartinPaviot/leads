"use client";

/**
 * Edit an existing call campaign's plan — the goal + cadence the rep set at
 * onboarding stay changeable later from the cockpit header. Reuses the shared
 * controls so create and edit never drift. On save it PATCHes the campaign;
 * the server recomputes the daily quota and regenerates today's list.
 */

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  useCallPlan,
  GoalSection,
  CadenceSection,
  PlanPreview,
  type PlanValue,
  type GoalType,
  type GoalWindow,
} from "./_call-plan-form";

export interface CampaignRow {
  id: string;
  name: string;
  dailyQuota: number;
  maxAttempts: number;
  windowDays: number;
  targetFilter?: unknown;
}

/** Recover the editable plan from the persisted campaign + its targetFilter snapshot. */
export function initialFromCampaign(c: CampaignRow): Partial<PlanValue> {
  const tf = (c.targetFilter ?? {}) as {
    goal?: { type?: GoalType; target?: number; window?: GoalWindow };
    listFrequency?: "daily" | "weekly";
    workingDays?: number[];
  };
  const goal = tf.goal ?? {};
  return {
    type: goal.type ?? "calls",
    target: typeof goal.target === "number" ? goal.target : 1000,
    window: goal.window ?? "week",
    workingDays: Array.isArray(tf.workingDays) && tf.workingDays.length > 0 ? tf.workingDays : [1, 2, 3, 4, 5],
    listFrequency: tf.listFrequency === "weekly" ? "weekly" : "daily",
    maxAttempts: c.maxAttempts ?? 8,
    windowDays: c.windowDays ?? 15,
  };
}

export function EditCampaignModal({
  campaign,
  onClose,
  onSave,
}: {
  campaign: CampaignRow;
  onClose: () => void;
  /** CLE-09 §4: the page owns the one copy of the PATCH (patchPlan); the modal
   *  builds the payload from its controls and delegates the request to it. */
  onSave: (payload: unknown) => Promise<{ ok: boolean; perDay?: number; error?: string }>;
}) {
  const { toast } = useToast();
  const { value, set, daysPerWeek, perDay, payload } = useCallPlan(initialFromCampaign(campaign));
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    setSubmitting(true);
    const r = await onSave(payload);
    setSubmitting(false);
    if (!r.ok) {
      toast(r.error || "Couldn't update the plan", "error");
      return;
    }
    toast("Calling plan updated", "success");
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit calling plan"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="gradient" disabled={submitting || value.target <= 0} onClick={save}>
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save plan
          </Button>
        </>
      }
    >
      <GoalSection value={value} set={set} />
      <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--color-border-subtle, var(--color-border-default))" }}>
        <CadenceSection value={value} set={set} />
      </div>
      <div className="mt-5">
        <PlanPreview value={value} perDay={perDay} daysPerWeek={daysPerWeek} />
      </div>
    </Modal>
  );
}
