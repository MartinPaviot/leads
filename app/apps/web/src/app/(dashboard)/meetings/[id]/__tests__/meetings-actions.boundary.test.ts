import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { MEETINGS_EXCLUDED_IDS } from "@/app/(dashboard)/meetings/[id]/_excluded-ids";

/**
 * CLE-14 — the /meetings/[id] detail page registers the seven NON-CAPTURE
 * page actions and reuses the page handlers (the §4 lifts) so the agent path
 * and the button path issue one identical request each. The headline property
 * is the HUMAN-BOUND boundary: producing a transcript — the in-browser recorder
 * (mic getUserMedia + MediaRecorder) and the transcript upload (a native file
 * dialog) — is NEVER registered. The agent operates on a meeting that ALREADY
 * has a transcript. This is asserted two ways:
 *   1. the registered id set is DISJOINT from MEETINGS_EXCLUDED_IDS, and
 *   2. a static source sweep — no registered id mentions a capture verb, and
 *      no run references the recorder's start/stop or handleFileUpload.
 */

// The exact ids the page registers (kept in lockstep with page.tsx).
const REGISTERED_IDS = [
  "meetings.editNotesSection",
  "meetings.sendFollowUp",
  "meetings.shareSlack",
  "meetings.generatePrep",
  "meetings.postCallConfirm",
  "meetings.approveIntel",
  "meetings.dismissIntel",
] as const;

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "page.tsx"),
  "utf8",
);

describe("CLE-14 /meetings/[id] — human-bound capture boundary", () => {
  it("the registered id set is disjoint from MEETINGS_EXCLUDED_IDS", () => {
    const excluded = new Set<string>(MEETINGS_EXCLUDED_IDS);
    for (const id of REGISTERED_IDS) {
      expect(excluded.has(id), `registered id "${id}" must not be in MEETINGS_EXCLUDED_IDS`).toBe(false);
    }
    const overlap = REGISTERED_IDS.filter((id) => excluded.has(id));
    expect(overlap).toEqual([]);
  });

  it("MEETINGS_EXCLUDED_IDS lists exactly the recorder + upload ids", () => {
    expect([...MEETINGS_EXCLUDED_IDS].sort()).toEqual(
      [
        "meetings.record",
        "meetings.startRecording",
        "meetings.stopRecording",
        "meetings.uploadTranscript",
        "meetings.submitTranscript",
      ].sort(),
    );
  });

  it("no registered id mentions a capture verb (record / recorder / upload / transcript)", () => {
    const FORBIDDEN = ["record", "recorder", "upload", "transcript"];
    for (const id of REGISTERED_IDS) {
      const lower = id.toLowerCase();
      for (const bad of FORBIDDEN) {
        expect(lower.includes(bad), `registered id "${id}" must not contain "${bad}"`).toBe(false);
      }
    }
  });

  it("each registered id appears verbatim in the page source (no drift)", () => {
    for (const id of REGISTERED_IDS) {
      expect(pageSource.includes(`"${id}"`), `id "${id}" not found in page.tsx`).toBe(true);
    }
  });

  it("the action block never references the recorder start/stop or handleFileUpload", () => {
    // Slice from the registration block so we only sweep the run()s, not the
    // recorder JSX that legitimately mounts MeetingRecorder / handleFileUpload.
    const start = pageSource.indexOf("const meetingActions");
    const end = pageSource.indexOf("useRegisterPageActions(meetingActions)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = pageSource.slice(start, end);
    for (const banned of ["handleFileUpload", "startRecording", "stopRecording", "MediaRecorder", "getUserMedia"]) {
      expect(block.includes(banned), `action block must not reference "${banned}"`).toBe(false);
    }
  });
});
