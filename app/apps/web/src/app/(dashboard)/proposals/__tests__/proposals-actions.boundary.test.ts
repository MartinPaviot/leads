import { describe, it, expect } from "vitest";
import { PROPOSALS_EXCLUDED_IDS } from "@/app/(dashboard)/proposals/_excluded-ids";

/**
 * CLE-14 /proposals boundary — the headline guard. A template UPLOAD is a native
 * OS file dialog + a multipart byte stream; a DOWNLOAD is a native browser
 * download (the server streams the assembled file). The agent can never pick a
 * local file nor receive raw bytes, so the SUBMIT/STREAM verbs are human-bound
 * and frozen in PROPOSALS_EXCLUDED_IDS. The two file-adjacent actions we DO
 * register — openTemplateUpload (opens the picker only) and openDownload
 * (navigates to the URL only) — must be DISJOINT from that excluded set.
 */

// The proposals ids the page registers (hardcoded so a drift is caught here, not
// silently). Kept in lockstep with page.tsx's useMemo([]) action list.
const REGISTERED_IDS = [
  "proposals.draftFromDeal",
  "proposals.confirmMapping",
  "proposals.editComponentMap",
  "proposals.regenerateComponent",
  "proposals.saveEdits",
  "proposals.openTemplateUpload",
  "proposals.openDownload",
];

// The file-adjacent ids we intentionally allow: open-only picker + navigate-only
// download. These are the SAFE EDGES (no byte stream, no multipart, no file pick).
const SAFE_FILE_EDGES = ["proposals.openTemplateUpload", "proposals.openDownload"];

describe("CLE-14 /proposals — excluded (human-bound) id set", () => {
  it("freezes the upload-SUBMIT and download-STREAM verbs", () => {
    expect([...PROPOSALS_EXCLUDED_IDS]).toEqual([
      "proposals.uploadTemplate",
      "proposals.submitTemplate",
      "proposals.downloadPdf",
      "proposals.download",
    ]);
  });

  it("the registered id set is DISJOINT from the excluded set", () => {
    const banned = new Set<string>(PROPOSALS_EXCLUDED_IDS);
    expect(REGISTERED_IDS.filter((id) => banned.has(id))).toEqual([]);
    for (const banned of PROPOSALS_EXCLUDED_IDS) {
      expect(REGISTERED_IDS).not.toContain(banned);
    }
  });

  it("the ONLY file-adjacent ids are the two safe edges, and neither is excluded", () => {
    const fileAdjacent = REGISTERED_IDS.filter(
      (id) => /upload|download|template/i.test(id),
    );
    expect(fileAdjacent.sort()).toEqual([...SAFE_FILE_EDGES].sort());
    const banned = new Set<string>(PROPOSALS_EXCLUDED_IDS);
    for (const id of SAFE_FILE_EDGES) {
      expect(REGISTERED_IDS).toContain(id);
      expect(banned.has(id)).toBe(false);
    }
  });

  it("no registered id is an upload-submit or download-stream verb (substring sweep)", () => {
    // openTemplateUpload / openDownload are allowed because they OPEN/NAVIGATE only;
    // the forbidden shapes are a bare submit/stream verb.
    const FORBIDDEN_EXACT = ["proposals.uploadtemplate", "proposals.submittemplate", "proposals.downloadpdf", "proposals.download"];
    for (const id of REGISTERED_IDS) {
      expect(FORBIDDEN_EXACT).not.toContain(id.toLowerCase());
    }
  });
});
