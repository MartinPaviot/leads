import { describe, expect, it } from "vitest";
import { decideDispatch } from "@/lib/sequence-drafts/dispatch-decision";

describe("decideDispatch", () => {
  it("dispatches an approved email draft", () => {
    expect(
      decideDispatch({ status: "approved", channel: "email" }),
    ).toEqual({ dispatch: true, via: "email" });
  });

  it("refuses to dispatch a pending_approval draft (consumer fired too early)", () => {
    expect(
      decideDispatch({ status: "pending_approval", channel: "email" }),
    ).toEqual({ dispatch: false, reason: "status_not_approved" });
  });

  it("refuses to dispatch a rejected draft", () => {
    expect(
      decideDispatch({ status: "rejected", channel: "email" }),
    ).toEqual({ dispatch: false, reason: "status_not_approved" });
  });

  it("refuses to dispatch an expired draft (cron timed it out)", () => {
    expect(
      decideDispatch({ status: "expired", channel: "email" }),
    ).toEqual({ dispatch: false, reason: "status_not_approved" });
  });

  it("refuses to dispatch a sent draft (idempotency — another consumer already processed)", () => {
    expect(
      decideDispatch({ status: "sent", channel: "email" }),
    ).toEqual({ dispatch: false, reason: "status_not_approved" });
  });

  it("routes linkedin_invite elsewhere (linkedin-send-worker reads linkedinMessages)", () => {
    expect(
      decideDispatch({ status: "approved", channel: "linkedin_invite" }),
    ).toEqual({ dispatch: false, reason: "channel_routed_elsewhere" });
  });

  it("routes linkedin_message elsewhere", () => {
    expect(
      decideDispatch({ status: "approved", channel: "linkedin_message" }),
    ).toEqual({ dispatch: false, reason: "channel_routed_elsewhere" });
  });

  it("dispatches an approved phone_task via the phone_task channel", () => {
    // After the B (phone_task) task ship, the dispatcher emits
    // phone/task-queued for phone_task drafts. The voice cold call
    // consumer (Twilio + Deepgram) handles them when feat/voice-cold-call
    // merges; producer ships ahead.
    expect(
      decideDispatch({ status: "approved", channel: "phone_task" }),
    ).toEqual({ dispatch: true, via: "phone_task" });
  });

  it("flags an unknown channel without crashing", () => {
    expect(
      decideDispatch({ status: "approved", channel: "carrier_pigeon" }),
    ).toEqual({ dispatch: false, reason: "channel_unknown" });
  });

  it("prioritises status over channel (rejected linkedin_invite reports status, not channel)", () => {
    // If both status AND channel would block, we surface the status
    // reason — it's the load-bearing rejection.
    expect(
      decideDispatch({ status: "rejected", channel: "linkedin_invite" }),
    ).toEqual({ dispatch: false, reason: "status_not_approved" });
  });
});
