/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TranscriptVideoPlayer } from "@/components/coaching/transcript-video-player";

describe("TranscriptVideoPlayer", () => {
  it("renders no-recording fallback when URL is null", () => {
    render(<TranscriptVideoPlayer recordingUrl={null} seekToSec={120} />);
    expect(screen.getByText(/No recording available/i)).toBeDefined();
    // Surface the timestamp the user clicked so they can still navigate
    // the transcript panel.
    expect(screen.getByText(/2:00/)).toBeDefined();
  });

  it("renders iframe for Loom", () => {
    render(
      <TranscriptVideoPlayer
        recordingUrl="https://www.loom.com/share/abc123"
        seekToSec=  {90}
      />,
    );
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("loom.com/embed/abc123");
    expect(iframe?.getAttribute("src")).toContain("t=90s");
  });

  it("renders iframe for YouTube", () => {
    render(
      <TranscriptVideoPlayer
        recordingUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        seekToSec={45}
      />,
    );
    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toContain("youtube.com/embed/dQw4w9WgXcQ");
    expect(iframe?.getAttribute("src")).toContain("start=45");
  });

  it("renders native <video> for direct mp4", () => {
    render(
      <TranscriptVideoPlayer
        recordingUrl="https://cdn.example.com/r.mp4"
        seekToSec={17}
      />,
    );
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toContain("r.mp4#t=17");
  });

  it("renders Zoom external-link fallback (provider blocks framing)", () => {
    render(
      <TranscriptVideoPlayer
        recordingUrl="https://us02web.zoom.us/rec/share/abc"
        seekToSec={300}
      />,
    );
    expect(screen.getByText(/Zoom recording/i)).toBeDefined();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("startTime=300000");
  });

  it("renders unknown-provider fallback for unrecognised host", () => {
    render(
      <TranscriptVideoPlayer
        recordingUrl="https://example.com/recording"
        seekToSec={10}
      />,
    );
    expect(screen.getByText(/Unrecognised recording host/i)).toBeDefined();
  });

  it("re-renders iframe with new src when seekToSec changes", () => {
    const { rerender } = render(
      <TranscriptVideoPlayer
        recordingUrl="https://www.loom.com/share/abc"
        seekToSec={30}
      />,
    );
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain(
      "t=30s",
    );
    rerender(
      <TranscriptVideoPlayer
        recordingUrl="https://www.loom.com/share/abc"
        seekToSec={90}
      />,
    );
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain(
      "t=90s",
    );
  });

  it("renders empty-state for empty string URL", () => {
    render(<TranscriptVideoPlayer recordingUrl="" seekToSec={0} />);
    expect(screen.getByText(/No recording available/i)).toBeDefined();
  });
});
