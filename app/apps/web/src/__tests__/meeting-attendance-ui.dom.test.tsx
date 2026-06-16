// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

// next/link pulls the app-router context; stub it to a plain anchor so the card
// renders in isolation (we're testing the attendance control, not navigation).
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { MeetingCard, type Meeting } from "@/app/(dashboard)/meetings/_meeting-views";

function meeting(partial: Partial<Meeting>): Meeting {
  const start = new Date(Date.now() - 86_400_000);
  return {
    id: "act-1",
    calendarEventId: "ev-1",
    title: "Discovery — Acme",
    description: null,
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 1_800_000).toISOString(),
    attendees: [],
    location: null,
    meetingLink: null,
    status: "confirmed",
    isPast: true,
    hasTranscript: false,
    hasNotes: false,
    notes: null,
    recordingUrl: null,
    activityId: "act-1",
    account: null,
    matchedContacts: [],
    ...partial,
  };
}

const noop = () => {};

afterEach(cleanup);

describe("MeetingCard attendance capture", () => {
  it("offers Tenu / Pas venu on a past meeting and marks held", () => {
    const onAtt = vi.fn();
    const { getByText } = render(
      <MeetingCard meeting={meeting({ attendance: "unknown" })} expanded={false} onToggle={noop} onPrep={noop} onAttendance={onAtt} />,
    );
    fireEvent.click(getByText("Tenu"));
    expect(onAtt).toHaveBeenCalledWith("act-1", "held");
  });

  it("marks no-show", () => {
    const onAtt = vi.fn();
    const { getByText } = render(
      <MeetingCard meeting={meeting({ attendance: "unknown" })} expanded={false} onToggle={noop} onPrep={noop} onAttendance={onAtt} />,
    );
    fireEvent.click(getByText("Pas venu"));
    expect(onAtt).toHaveBeenCalledWith("act-1", "no_show");
  });

  it("clicking the active mark clears it (toggle off)", () => {
    const onAtt = vi.fn();
    const { getByText } = render(
      <MeetingCard meeting={meeting({ attendance: "held" })} expanded={false} onToggle={noop} onPrep={noop} onAttendance={onAtt} />,
    );
    fireEvent.click(getByText("Tenu"));
    expect(onAtt).toHaveBeenCalledWith("act-1", null);
  });

  it("a cancelled meeting shows a static label, no toggle", () => {
    const { getByText, queryByText } = render(
      <MeetingCard meeting={meeting({ attendance: "cancelled" })} expanded={false} onToggle={noop} onPrep={noop} onAttendance={noop} />,
    );
    expect(getByText("Annulé")).toBeTruthy();
    expect(queryByText("Tenu")).toBeNull();
    expect(queryByText("Pas venu")).toBeNull();
  });

  it("no attendance control on an upcoming meeting", () => {
    const { queryByText } = render(
      <MeetingCard meeting={meeting({ isPast: false, attendance: "scheduled" })} expanded={false} onToggle={noop} onPrep={noop} onAttendance={noop} />,
    );
    expect(queryByText("Tenu")).toBeNull();
    expect(queryByText("Pas venu")).toBeNull();
  });

  it("renders no control when onAttendance is not provided", () => {
    const { queryByText } = render(
      <MeetingCard meeting={meeting({ attendance: "unknown" })} expanded={false} onToggle={noop} onPrep={noop} />,
    );
    expect(queryByText("Tenu")).toBeNull();
  });
});
