/**
 * Marketing product primitives.
 *
 * Shared building blocks for the landing's product shots: the app-window
 * chrome (AppFrame), a company Logo and a person Avatar, plus the two
 * real-logo rows (IntegrationsStrip, BuiltOnStrip).
 *
 * Logos/avatars attempt a real image, but ALWAYS degrade to a crafted
 * fallback (a brand monogram tile, or coloured initials) instead of a
 * generic glyph — so a flaky/blocked logo CDN never makes the page look
 * broken. The animated app surfaces live in hero-demo.tsx and are replayed
 * by process-steps.tsx.
 *
 * Every export is decorative: the root carries aria-hidden so assistive tech
 * skips the faux UI and reads the adjacent copy.
 */

import { Lock } from "lucide-react";

// Full-colour real company logos (the brand's actual favicon). When the CDN
// is slow/blocked the <img> hides and the monogram tile shows through.
export const clogo = (domain: string) => `https://icon.horse/icon/${domain}`;

/* ── fallbacks: deterministic, tasteful, never a generic glyph ─── */

function hashIdx(s: string, n: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

// Muted, professional avatar tones (soft bg + readable fg), picked by hash.
const AV_TONES = [
  { bg: "#EEF2FF", fg: "#4F46E5" },
  { bg: "#ECFDF5", fg: "#047857" },
  { bg: "#FFF1F2", fg: "#BE123C" },
  { bg: "#F0F9FF", fg: "#0369A1" },
  { bg: "#FEF3C7", fg: "#B45309" },
  { bg: "#F5F3FF", fg: "#6D28D9" },
  { bg: "#F0FDFA", fg: "#0F766E" },
];

const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  (e.currentTarget as HTMLImageElement).style.display = "none";
};

// First letter for a company monogram, from an explicit name or the src URL.
function brandLetter(src: string, name: string) {
  if (name) return name.trim().charAt(0).toUpperCase();
  const m =
    src.match(/icon\/([^/?]+)/) ||
    src.match(/domain=([^&]+)/) ||
    src.match(/simpleicons\.org\/([^/?]+)/);
  const d = (m ? m[1] : src).replace(/^www\./, "");
  return (d.charAt(0) || "•").toUpperCase();
}

/* ── person avatar (coloured initials, optional real photo) ─────── */

export function Avatar({ src, name = "", size = 28 }: { src?: string; name?: string; size?: number }) {
  const initials = (name.match(/\b[A-Za-z]/g) || []).slice(0, 2).join("").toUpperCase() || "•";
  const tone = AV_TONES[hashIdx(name || src || "x", AV_TONES.length)];
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: tone.bg, color: tone.fg }}
    >
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.4)), fontWeight: 600, letterSpacing: "-0.02em" }}>{initials}</span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={hideOnError} />
      )}
    </span>
  );
}

/* ── company logo (monogram tile, real favicon on top) ──────────── */

export function Logo({
  src,
  name = "",
  size = 26,
  rounded = "rounded-[7px]",
  bordered = true,
}: {
  src: string;
  name?: string;
  size?: number;
  rounded?: string;
  bordered?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ${rounded} ${bordered ? "border border-[#EDEFF3]" : ""}`}
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: Math.round(size * 0.5), fontWeight: 700, color: "#9499A6", letterSpacing: "-0.03em" }}>{brandLetter(src, name)}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="absolute inset-0 m-auto h-full w-full object-contain p-[10%]"
        onError={hideOnError}
      />
    </span>
  );
}

/* ── app-window chrome ─────────────────────────────────────────── */

export function AppFrame({
  children,
  url = "app.elevay.com",
  className = "",
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-2xl bg-white ${className}`}
      // Layered depth: a tight contact shadow, a mid ambient, and a long
      // soft cast, plus a 1px inner hairline border and a top glass
      // highlight. Reads as a real window floating above the page.
      style={{
        boxShadow:
          "0 2px 4px -1px rgba(26,26,46,0.05), 0 14px 30px -12px rgba(26,26,46,0.16), 0 46px 84px -34px rgba(26,26,46,0.34), inset 0 0 0 1px rgba(26,26,46,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      <div className="flex h-9 items-center gap-2 border-b px-3.5" style={{ borderColor: "#EFEFF5", background: "linear-gradient(180deg,#FFFFFF 0%,#F6F7FA 100%)" }}>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#F0A8A0", boxShadow: "inset 0 1px 1.5px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(0,0,0,0.06)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#F3D08A", boxShadow: "inset 0 1px 1.5px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(0,0,0,0.06)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#A9DCA0", boxShadow: "inset 0 1px 1.5px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(0,0,0,0.06)" }} />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px]" style={{ borderColor: "#EAEAF2", background: "#fff", color: "#9CA3AF", boxShadow: "0 1px 1px rgba(26,26,46,0.03)" }}>
          <Lock size={9} />
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Integrations strip — real brand logos ──────────────────────── */

export function IntegrationsStrip() {
  // Real full-colour brand logos (favicons), highest-res source per brand.
  const items = [
    { src: "https://icon.horse/icon/mail.google.com", l: "Gmail" },
    { src: "https://icon.horse/icon/outlook.com", l: "Outlook" },
    { src: "https://www.google.com/s2/favicons?domain=meet.google.com&sz=128", l: "Google Meet" },
    { src: "https://icon.horse/icon/zoom.us", l: "Zoom" },
    { src: "https://icon.horse/icon/teams.microsoft.com", l: "Teams" },
    { src: "https://cdn.simpleicons.org/googlecalendar", l: "Calendar" },
  ];
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
      {items.map((i) => (
        <div key={i.l} className="flex items-center gap-2">
          <Logo src={i.src} name={i.l} size={24} rounded="rounded-md" bordered={false} />
          <span className="text-[13px] font-medium text-[#475569]">{i.l}</span>
        </div>
      ))}
    </div>
  );
}

/* ── "Built on" infrastructure credibility row ──────────────────── */

export function BuiltOnStrip() {
  // Borrowed credibility, but every name is real and verifiable in the
  // codebase: Anthropic + OpenAI (@ai-sdk/anthropic, @ai-sdk/openai),
  // Twilio (twilio), Deepgram (@deepgram/sdk), Recall.ai (RECALL_API_KEY
  // + /api/webhooks/recall). Logos render grayscale so a mix of brand
  // colours reads as one calm row, and colour up on hover. A monogram tile
  // sits under each logo, so a blocked logo CDN still shows a clean mark.
  const items: { src: string; l: string; w: string }[] = [
    { src: "https://cdn.simpleicons.org/anthropic", l: "Anthropic", w: "Reasoning" },
    // OpenAI was pulled from Simple Icons (trademark request); use favicon.
    { src: "https://www.google.com/s2/favicons?domain=openai.com&sz=128", l: "OpenAI", w: "Drafting" },
    { src: "https://cdn.simpleicons.org/twilio", l: "Twilio", w: "Calls" },
    { src: "https://cdn.simpleicons.org/deepgram", l: "Deepgram", w: "Transcription" },
    { src: "https://www.google.com/s2/favicons?domain=recall.ai&sz=128", l: "Recall.ai", w: "Capture" },
  ];
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-x-7 gap-y-5 sm:gap-x-10">
      {items.map((i) => (
        <div key={i.l} className="group flex items-center gap-2.5">
          <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md">
            <span style={{ fontSize: 12, fontWeight: 700, color: "#AEB4C0", letterSpacing: "-0.03em" }}>{i.l.charAt(0)}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={i.src}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              className="absolute inset-0 m-auto h-5 w-5 object-contain opacity-65 grayscale transition duration-200 group-hover:opacity-100 group-hover:grayscale-0"
              onError={hideOnError}
            />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[13.5px] font-semibold tracking-tight text-[#3A4252]">{i.l}</span>
            <span className="mt-[3px] text-[10.5px] font-medium uppercase tracking-wider text-[#AEB4C0]">{i.w}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
