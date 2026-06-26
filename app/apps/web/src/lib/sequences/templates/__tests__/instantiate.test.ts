import { describe, it, expect, vi } from "vitest";
import { readTriggerConfig } from "@/lib/sequences/triggers";
import {
  instantiateTemplate,
  instantiateTemplates,
  buildCampaignConfig,
  type InstantiateDeps,
  type SequenceInsert,
  type StepInsert,
} from "../instantiate";
import { getTemplate, PROVEN_TEMPLATES } from "../registry";
import type { ProvenSequenceTemplate } from "../types";

const tpl = (): ProvenSequenceTemplate => getTemplate("post-funding")!;

function deps(over: Partial<InstantiateDeps> = {}): InstantiateDeps {
  return {
    findExisting: async (_t: string, _id: string) => null,
    insertSequence: vi.fn(async (_row: SequenceInsert) => ({ id: "seq_1" })),
    insertSteps: vi.fn(async (_rows: StepInsert[]) => undefined),
    ...over,
  };
}

describe("buildCampaignConfig", () => {
  it("sets the trigger types (router routing) + templateId provenance", () => {
    const cfg = buildCampaignConfig(tpl());
    expect(readTriggerConfig(cfg).triggerSignalTypes).toEqual(["post_funding"]);
    expect(cfg.templateId).toBe("post-funding");
    expect(cfg.recipientBenefitAngle).toBeTruthy();
  });
});

describe("instantiateTemplate", () => {
  it("creates the sequence (status draft) + its steps", async () => {
    const insertSequence = vi.fn(async (_row: SequenceInsert) => ({ id: "seq_1" }));
    const insertSteps = vi.fn(async (_rows: StepInsert[]) => undefined);
    const r = await instantiateTemplate("t1", tpl(), deps({ insertSequence, insertSteps }));

    expect(r).toMatchObject({ templateId: "post-funding", outcome: "created", sequenceId: "seq_1" });

    const seqRow = insertSequence.mock.calls[0][0];
    expect(seqRow.tenantId).toBe("t1");
    expect(seqRow.status).toBe("draft"); // configured, NOT activated
    expect(readTriggerConfig(seqRow.campaignConfig).triggerSignalTypes).toEqual(["post_funding"]);

    const stepRows = insertSteps.mock.calls[0][0];
    expect(stepRows.length).toBe(tpl().steps.length);
    expect(stepRows.every((s) => s.sequenceId === "seq_1")).toBe(true);
    // Step shape carries channel + cadence faithfully.
    expect(stepRows[0]).toMatchObject({ stepNumber: 1, stepType: "email", delayDays: 0 });
  });

  it("is idempotent: an existing seeded sequence → skipped, no inserts", async () => {
    const insertSequence = vi.fn(async (_row: SequenceInsert) => ({ id: "new" }));
    const insertSteps = vi.fn(async (_rows: StepInsert[]) => undefined);
    const r = await instantiateTemplate(
      "t1",
      tpl(),
      deps({ findExisting: async () => ({ id: "seq_existing" }), insertSequence, insertSteps }),
    );
    expect(r).toMatchObject({ outcome: "skipped_exists", sequenceId: "seq_existing" });
    expect(insertSequence).not.toHaveBeenCalled();
    expect(insertSteps).not.toHaveBeenCalled();
  });

  it("honours an explicit active status + createdBy", async () => {
    const insertSequence = vi.fn(async (_row: SequenceInsert) => ({ id: "seq_1" }));
    await instantiateTemplate("t1", tpl(), deps({ insertSequence }), { status: "active", createdBy: "user_9" });
    const seqRow = insertSequence.mock.calls[0][0];
    expect(seqRow.status).toBe("active");
    expect(seqRow.createdBy).toBe("user_9");
  });
});

describe("instantiateTemplates (batch)", () => {
  it("seeds the whole library, one result per template, in order", async () => {
    const ids: string[] = [];
    const results = await instantiateTemplates(
      "t1",
      PROVEN_TEMPLATES,
      deps({
        insertSequence: async (row) => {
          ids.push((row.campaignConfig as { templateId: string }).templateId);
          return { id: `seq_${ids.length}` };
        },
      }),
    );
    expect(results.length).toBe(PROVEN_TEMPLATES.length);
    expect(ids).toEqual(PROVEN_TEMPLATES.map((t) => t.id));
    expect(results.every((r) => r.outcome === "created")).toBe(true);
  });
});
