"use client";

/**
 * Animated, self-advancing product tour that walks through the exact
 * process the page describes: build your TAM, prioritize, reach out,
 * capture, ask. Each step swaps the matching product mock inside an app
 * window with a crossfade; a left rail shows progress.
 *
 * Accessibility: auto-advance is disabled under prefers-reduced-motion
 * (the rail stays fully clickable), it pauses on hover, and it only runs
 * while in view.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion, useInView } from "framer-motion";
import { Target, BarChart3, Send, Calendar, MessageSquare, type LucideIcon } from "lucide-react";
import {
  AppFrame,
  TamMock,
  SignalsMock,
  OutreachMock,
  MeetingMock,
  ChatMock,
} from "./product-mockups";

const STEP_MS = 4200;

const steps: { icon: LucideIcon; label: string; caption: string; visual: React.ReactNode }[] = [
  { icon: Target, label: "Build your TAM", caption: "Describe your ICP. Elevay searches live databases and builds a scored target list.", visual: <TamMock /> },
  { icon: BarChart3, label: "Prioritize", caption: "Each morning opens on who to work next, ranked by live signals.", visual: <SignalsMock /> },
  { icon: Send, label: "Reach out", caption: "AI drafts sequences and call briefs from real context. Nothing sends without you.", visual: <OutreachMock /> },
  { icon: Calendar, label: "Capture", caption: "A bot joins your meetings, transcribes them, and pulls out the signals. You confirm.", visual: <MeetingMock /> },
  { icon: MessageSquare, label: "Ask anything", caption: "Ask your pipeline in plain language. Every answer cites its source.", visual: <ChatMock /> },
];

export function ProcessTour() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-120px 0px" });

  useEffect(() => {
    if (reduced || paused || !inView) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % steps.length), STEP_MS);
    return () => clearTimeout(t);
  }, [active, paused, inView, reduced]);

  return (
    <div
      ref={ref}
      className="grid items-center gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Step rail */}
      <div className="space-y-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const on = i === active;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setActive(i)}
              aria-current={on ? "step" : undefined}
              className="relative block w-full cursor-pointer overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors"
              style={{ borderColor: on ? "rgba(44,107,237,0.30)" : "#EAEBF0", background: on ? "rgba(44,107,237,0.045)" : "#fff" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                  style={{ background: on ? "#2C6BED" : "#F2F3F7", color: on ? "#fff" : "#9CA3AF" }}
                >
                  <Icon size={14} />
                </span>
                <span className="text-[14px] font-semibold" style={{ color: on ? "#111827" : "#6B7280" }}>
                  {i + 1}. {s.label}
                </span>
              </div>
              <motion.div
                initial={false}
                animate={{ height: on ? "auto" : 0, opacity: on ? 1 : 0, marginTop: on ? 8 : 0 }}
                transition={{ duration: reduced ? 0 : 0.3, ease: "easeOut" }}
                className="overflow-hidden pl-10 text-[13px] leading-relaxed text-gray-500"
              >
                {s.caption}
              </motion.div>
              {on && !reduced && (
                <motion.span
                  key={active}
                  className="absolute bottom-0 left-0 h-[2px] w-full origin-left"
                  style={{ background: "#2C6BED" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: paused ? 0 : 1 }}
                  transition={{ duration: paused ? 0 : STEP_MS / 1000, ease: "linear" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Animated viewport */}
      <div className="relative">
        <AppFrame>
          <div className="relative flex items-start bg-[#FAFAFA] p-4 sm:p-5" style={{ minHeight: 372 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                className="w-full"
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
                transition={{ duration: reduced ? 0 : 0.35, ease: "easeOut" }}
              >
                {steps[active].visual}
              </motion.div>
            </AnimatePresence>
          </div>
        </AppFrame>
      </div>
    </div>
  );
}
