"use client";

/**
 * OpportunitiesDemo — self-playing "your CRM fills itself" surface (landing step
 * Capture). Same model as the other demos: one loop in view, static under
 * reduced-motion, GPU-safe.
 *
 * The story: straight from the last call, a deal's fields populate themselves
 * (value, close date, next step) and Elevay advances the stage — no manual
 * logging.
 */

import { useEffect, useRef, useState } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { Sparkles, Check, Banknote, CalendarClock, ArrowRight } from "lucide-react";
import { AppFrame, ScaleToFit, Logo, Avatar, clogo } from "./product-mockups";

const T = { text: "#1A1A2E", sec: "#64648C", ter: "#9CA3AF", border: "#E8E8F0", soft: "#EFEFF5", page: "#FAFAFA", card: "#FFFFFF", accent: "#2C6BED", accentSoft: "rgba(44,107,237,0.08)" };
const GREEN = "#4E9E86";
const GREEN_SOFT = "rgba(78,158,134,0.13)";

const STAGES = ["Lead", "Discovery", "Qualified", "Proposal", "Closed"];
const FROM_STAGE = 1; // Discovery
const TO_STAGE = 2; // Qualified

const FIELDS: { icon: typeof Banknote; label: string; value: string }[] = [
  { icon: Banknote, label: "Value", value: "$48k ARR" },
  { icon: CalendarClock, label: "Expected close", value: "End of Q3" },
];

const PHASES = [0, 1100, 2400, 3700, 5200]; // src · deal · fields · advance · nextstep
const CYCLE_MS = 8500;

export function OpportunitiesDemo() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px 0px" });
  const [phase, setPhase] = useState(reduced ? 4 : 0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    setPhase(0);
    const timers = PHASES.map((ms, i) => setTimeout(() => setPhase(i), ms));
    const restart = setTimeout(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => { timers.forEach(clearTimeout); clearTimeout(restart); };
  }, [reduced, inView, cycle]);

  const showDeal = phase >= 1;
  const showFields = phase >= 2;
  const advanced = phase >= 3;
  const showNext = phase >= 4;
  const activeStage = advanced ? TO_STAGE : FROM_STAGE;

  return (
    <div ref={ref}>
      <ScaleToFit designWidth={1080}>
        <AppFrame url="app.elevay.com/opportunities">
          <div className="flex flex-col p-6" style={{ height: 420, background: T.page }}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: showNext ? GREEN : T.accent }}>
              {showNext ? <Check size={13} /> : <Sparkles size={13} className={reduced ? "" : "animate-pulse"} />}
              {showNext ? "Updated from your call with Mercury" : "Updating from your last call…"}
            </div>

            <m.div
              className="mt-3 flex-1 rounded-2xl border p-5"
              style={{ borderColor: T.border, background: T.card }}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={showDeal ? { opacity: 1, y: 0 } : { opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              {/* deal header */}
              <div className="flex items-center gap-3">
                <Logo src={clogo("mercury.com")} name="Mercury" size={36} />
                <div className="flex-1">
                  <div className="text-[16px] font-bold" style={{ color: T.text }}>Mercury — Platform</div>
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: T.ter }}>
                    <Avatar name="Dana Liu" size={16} /> Dana Liu · Head of Growth
                  </div>
                </div>
              </div>

              {/* stage pipeline */}
              <div className="mt-5 flex items-center gap-1.5">
                {STAGES.map((st, i) => {
                  const active = i === activeStage;
                  const passed = i < activeStage;
                  return (
                    <div key={st} className="flex flex-1 items-center gap-1.5">
                      <m.div
                        className="flex-1 rounded-full py-1.5 text-center text-[10px] font-semibold"
                        animate={{
                          background: active ? T.accent : passed ? GREEN_SOFT : T.soft,
                          color: active ? "#fff" : passed ? GREEN : T.ter,
                        }}
                        transition={{ duration: 0.5 }}
                      >
                        {st}
                      </m.div>
                    </div>
                  );
                })}
              </div>
              {advanced && (
                <m.div
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-1.5 flex items-center justify-center gap-1 text-[9.5px] font-medium"
                  style={{ color: T.accent }}
                >
                  <ArrowRight size={10} /> advanced to {STAGES[TO_STAGE]} · suggested by Elevay
                </m.div>
              )}

              {/* populated fields */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                {FIELDS.map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <m.div
                      key={f.label}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={showFields ? { opacity: 1, y: 0 } : { opacity: 0 }}
                      transition={{ duration: 0.35, delay: reduced ? 0 : i * 0.12 }}
                      className="rounded-xl border px-3 py-2.5"
                      style={{ borderColor: T.border, background: T.page }}
                    >
                      <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: T.ter }}>
                        <Icon size={11} /> {f.label}
                      </div>
                      <div className="mt-1 text-[14px] font-bold" style={{ color: T.text }}>{f.value}</div>
                    </m.div>
                  );
                })}
              </div>

              {/* next step */}
              <m.div
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={showNext ? { opacity: 1, y: 0 } : { opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11.5px]"
                style={{ background: GREEN_SOFT, color: T.text }}
              >
                <span className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: GREEN }}>Next</span>
                Book the technical review · CRM-sync confirmed
              </m.div>
            </m.div>
          </div>
        </AppFrame>
      </ScaleToFit>
    </div>
  );
}
