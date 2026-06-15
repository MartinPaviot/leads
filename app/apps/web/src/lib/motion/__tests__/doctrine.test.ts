import { describe, it, expect } from "vitest";
import { getStepDoctrine, MOMENT_TO_SLUG, MAX_RUBRIC_CHARS } from "../doctrine";
import { getDocBySlug } from "@/lib/docs/content";
import { MOMENTS } from "../moment";

describe("getStepDoctrine", () => {
  it("every mapped slug resolves in docSteps (guards against step renames)", () => {
    for (const moment of MOMENTS) {
      const slug = MOMENT_TO_SLUG[moment];
      if (slug) {
        expect(getDocBySlug(slug), `slug "${slug}" for moment "${moment}"`).toBeDefined();
      }
    }
  });

  it("discovery rubric keeps headings and table/list rules", () => {
    const { slug, rubric } = getStepDoctrine("discovery");
    expect(slug).toBe("the-discovery-call");
    expect(rubric).toContain("## The question discipline");
    expect(rubric).toContain("11 to 14"); // a load-bearing ul rule
  });

  it("discovery rubric drops prose and worked examples", () => {
    const { rubric } = getStepDoctrine("discovery");
    // a sentence that lives in a <p> block:
    expect(rubric).not.toContain("Everything after the meeting is decided mostly in discovery");
    // the worked-example block is dropped entirely:
    expect(rubric).not.toContain("Example: an Elevay discovery");
  });

  it("rubric is size-bounded across moments", () => {
    for (const moment of MOMENTS) {
      expect(getStepDoctrine(moment).rubric.length).toBeLessThanOrEqual(MAX_RUBRIC_CHARS);
    }
  });

  it("expansion has no doctrine step → empty rubric", () => {
    expect(getStepDoctrine("expansion")).toEqual({ slug: null, rubric: "" });
  });

  it("close maps to the closing step and carries its rules", () => {
    const { slug, rubric } = getStepDoctrine("close");
    expect(slug).toBe("closing");
    expect(rubric.length).toBeGreaterThan(0);
  });
});
