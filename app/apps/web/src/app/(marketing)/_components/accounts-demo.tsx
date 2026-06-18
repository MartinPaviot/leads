"use client";

/**
 * AccountsDemo — self-playing "your target list builds itself" surface (landing
 * step Find demand). Same model as the other demos: plays one loop in view,
 * static under reduced-motion, GPU-safe.
 *
 * The story: describe the ICP once, Elevay searches a live B2B database and the
 * matched accounts stream in — scored against the ICP — while a counter climbs.
 */

import { useEffect, useRef, useState } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { Search, Check, Target } from "lucide-react";
import { AppFrame, ScaleToFit, Logo, clogo } from "./product-mockups";

const T = { text: "#1A1A2E", sec: "#64648C", ter: "#9CA3AF", border: "#E8E8F0", soft: "#EFEFF5", page: "#FAFAFA", card: "#FFFFFF", accent: "#2C6BED", accentSoft: "rgba(44,107,237,0.08)" };
const GREEN = "#4E9E86";

const ACCOUNTS = [
  { dom: "retool.com", name: "Retool", ind: "Developer tools", score: 92 },
  { dom: "mercury.com", name: "Mercury", ind: "Fintech", score: 88 },
  { dom: "posthog.com", name: "PostHog", ind: "Product analytics", score: 84 },
  { dom: "linear.app", name: "Linear", ind: "Project management", score: 81 },
  { dom: "loom.com", name: "Loom", ind: "Async video", score: 77 },
  { dom: "vercel.com", name: "Vercel", ind: "Cloud platform", score: 73 },
  { dom: "airtable.com", name: "Airtable", ind: "No-code platform", score: 71 },
];
const TARGET_COUNT = 247;
const CYCLE_MS = 9500;

function scoreTone(s: number) {
  if (s >= 85) return { fg: GREEN, bg: "rgba(78,158,134,0.13)" };
  if (s >= 75) return { fg: T.accent, bg: T.accentSoft };
  return { fg: "#CDA25C", bg: "rgba(205,162,92,0.15)" };
}

export function AccountsDemo() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px 0px" });
  const [shown, setShown] = useState(reduced ? ACCOUNTS.length : 0);
  const [count, setCount] = useState(reduced ? TARGET_COUNT : 0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    setShown(0); setCount(0);
    // Reveal one row every ~700ms after a short "searching" beat.
    const rowTimers = ACCOUNTS.map((_, i) => setTimeout(() => setShown(i + 1), 800 + i * 700));
    // Counter climbs to TARGET while rows stream in.
    let c = 0;
    const counter = setInterval(() => {
      c = Math.min(TARGET_COUNT, c + 7);
      setCount(c);
      if (c >= TARGET_COUNT) clearInterval(counter);
    }, 60);
    const restart = setTimeout(() => setCycle((k) => k + 1), CYCLE_MS);
    return () => { rowTimers.forEach(clearTimeout); clearInterval(counter); clearTimeout(restart); };
  }, [reduced, inView, cycle]);

  const done = shown >= ACCOUNTS.length;

  return (
    <div ref={ref}>
      <ScaleToFit designWidth={1080}>
        <AppFrame url="app.elevay.com/accounts">
          <div className="flex flex-col" style={{ height: 485, background: T.page }}>
            {/* header */}
            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: T.border, background: T.card }}>
              <div>
                <div className="text-[14px] font-semibold" style={{ color: T.text }}>Target accounts</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px]" style={{ color: T.ter }}>
                  <Target size={11} style={{ color: T.accent }} /> ICP · SaaS founders, Series A–B, EU/US
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: done ? "rgba(78,158,134,0.13)" : T.accentSoft, color: done ? GREEN : T.accent }}>
                {done ? <Check size={12} /> : <Search size={12} className={reduced ? "" : "animate-pulse"} />}
                <span className="tabular-nums">{count}</span> {done ? "matched" : "scanning…"}
              </div>
            </div>

            {/* rows */}
            <div className="flex-1 overflow-hidden px-3 py-2">
              {ACCOUNTS.map((a, i) => {
                const tone = scoreTone(a.score);
                return (
                  <m.div
                    key={a.dom}
                    initial={reduced ? false : { opacity: 0, y: 10 }}
                    animate={i < shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex items-center gap-3 border-b px-2 py-2.5"
                    style={{ borderColor: T.soft }}
                  >
                    <Logo src={clogo(a.dom)} name={a.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold" style={{ color: T.text }}>{a.name}</div>
                      <div className="text-[10.5px]" style={{ color: T.ter }}>{a.ind}</div>
                    </div>
                    <span className="rounded-md px-2 py-1 text-[11px] font-bold tabular-nums" style={{ background: tone.bg, color: tone.fg }}>{a.score}</span>
                  </m.div>
                );
              })}
            </div>
          </div>
        </AppFrame>
      </ScaleToFit>
    </div>
  );
}
