/**
 * Conversation analytics — the Gong-grade read on HOW a connected call was
 * conducted, derived from the diarised transcript already stored on
 * `calls.transcript` ([{ speaker, text, tsMs }]). Pure, client-safe, no LLM:
 * the metrics route feeds it the stored chunks, the dashboard formats the
 * aggregate.
 *
 * Distinct from lever-scoring (which judges the methodology levers): this is the
 * shape of the dialogue — talk balance, questions asked, the longest monologue,
 * and how often the line changes hands (interactivity). Thin transcripts return
 * null — a two-line exchange is not a conversation to characterise.
 */

export interface TranscriptChunk {
  speaker?: string; // "agent" | "prospect" | "unknown"
  text?: string;
  tsMs?: number; // ms from call start
}

export interface ConversationMetrics {
  /** Agent share of spoken characters, 0-100 (mirrors leverScores.talkRatioPct). */
  agentTalkPct: number;
  /** Count of "?" across the agent's turns — discovery pressure. */
  questionsAsked: number;
  /** Times the line changed hands between agent and prospect. */
  speakerSwitches: number;
  /** Wall-clock span of the dialogue, or null when timing is unusable. */
  durationSec: number | null;
  /** Longest single-speaker stretch in seconds, or null without timing. */
  longestMonologueSec: number | null;
  /** Speaker switches per minute — higher = more of a back-and-forth. */
  interactivityPerMin: number | null;
}

/** ~15 characters/second is a normal speaking pace — used to estimate a chunk's
 * duration when we only have its start timestamp. */
const CHARS_PER_SEC = 15;
function estDurMs(text: string | undefined): number {
  return Math.max(500, ((text?.length ?? 0) / CHARS_PER_SEC) * 1000);
}

function countQuestions(text: string): number {
  const m = text.match(/\?/g);
  return m ? m.length : 0;
}

/**
 * Characterise one call's dialogue. Returns null when there isn't enough of a
 * two-sided exchange to mean anything (voicemail, instant hangup, agent-only).
 */
export function computeConversationMetrics(chunks: TranscriptChunk[]): ConversationMetrics | null {
  const turns = chunks.filter(
    (c) => (c.speaker === "agent" || c.speaker === "prospect") && c.text && c.text.trim().length > 0,
  );
  if (turns.length < 3) return null;

  const agent = turns.filter((c) => c.speaker === "agent");
  const prospect = turns.filter((c) => c.speaker === "prospect");
  if (agent.length < 1 || prospect.length < 1) return null;

  const agentChars = agent.reduce((a, c) => a + (c.text?.length ?? 0), 0);
  const prospectChars = prospect.reduce((a, c) => a + (c.text?.length ?? 0), 0);
  const totalChars = agentChars + prospectChars;
  if (totalChars < 120) return null;

  const agentTalkPct = Math.round((agentChars / totalChars) * 100);
  const questionsAsked = agent.reduce((a, c) => a + countQuestions(c.text ?? ""), 0);

  let speakerSwitches = 0;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].speaker !== turns[i - 1].speaker) speakerSwitches++;
  }

  // Timing — only when the chunk timestamps are present and monotonic.
  const tsList = turns.map((c) => c.tsMs);
  const hasTiming =
    tsList.every((t) => typeof t === "number" && Number.isFinite(t)) &&
    (tsList[tsList.length - 1] as number) > (tsList[0] as number);

  let durationSec: number | null = null;
  let longestMonologueSec: number | null = null;
  let interactivityPerMin: number | null = null;

  if (hasTiming) {
    const first = tsList[0] as number;
    const lastTs = tsList[tsList.length - 1] as number;
    const durMs = lastTs - first + estDurMs(turns[turns.length - 1].text);
    durationSec = Math.round(durMs / 1000);

    // Longest run of consecutive same-speaker turns, measured by the gap until
    // the other speaker takes over (the last run gets an estimated tail).
    let longestMs = 0;
    let runStart = first;
    for (let i = 1; i <= turns.length; i++) {
      const cur = turns[i];
      const prev = turns[i - 1];
      if (!cur || cur.speaker !== prev.speaker) {
        const runEnd = cur ? (cur.tsMs as number) : (prev.tsMs as number) + estDurMs(prev.text);
        longestMs = Math.max(longestMs, runEnd - runStart);
        if (cur) runStart = cur.tsMs as number;
      }
    }
    longestMonologueSec = Math.round(longestMs / 1000);

    interactivityPerMin = durationSec > 0 ? +(speakerSwitches / (durationSec / 60)).toFixed(1) : null;
  }

  return {
    agentTalkPct,
    questionsAsked,
    speakerSwitches,
    durationSec,
    longestMonologueSec,
    interactivityPerMin,
  };
}

export interface ConversationAggregate {
  /** Calls with a usable transcript. */
  sample: number;
  avgAgentTalkPct: number | null;
  avgQuestionsAsked: number | null;
  avgLongestMonologueSec: number | null;
  avgInteractivityPerMin: number | null;
}

/** Minimum usable transcripts before the conversation read is shown. */
export const CONVERSATION_SAMPLE_FLOOR = 5;

/** Methodology repères surfaced next to the live numbers (Gong-informed). */
export const CONVERSATION_BENCHMARKS = {
  agentTalkBand: [40, 70] as [number, number], // ~55% target on a cold call
  longestMonologueMaxSec: 60, // a rep stretch past ~1 min is a monologue
  questionsTarget: 3, // at least a few discovery questions on a connect
};

function avg(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function aggregateConversation(
  perCall: ConversationMetrics[],
  floor = CONVERSATION_SAMPLE_FLOOR,
): ConversationAggregate {
  const sample = perCall.length;
  if (sample < floor) {
    return {
      sample,
      avgAgentTalkPct: null,
      avgQuestionsAsked: null,
      avgLongestMonologueSec: null,
      avgInteractivityPerMin: null,
    };
  }
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  const round1 = (v: number | null) => (v === null ? null : +v.toFixed(1));
  return {
    sample,
    avgAgentTalkPct: round(avg(perCall.map((m) => m.agentTalkPct))),
    avgQuestionsAsked: round1(avg(perCall.map((m) => m.questionsAsked))),
    avgLongestMonologueSec: round(avg(perCall.map((m) => m.longestMonologueSec))),
    avgInteractivityPerMin: round1(avg(perCall.map((m) => m.interactivityPerMin))),
  };
}

/** Parse + characterise a raw stored transcript (jsonb) in one go; null when
 * unusable so callers can simply filter. */
export function conversationFromTranscript(raw: unknown): ConversationMetrics | null {
  if (!Array.isArray(raw)) return null;
  return computeConversationMetrics(raw as TranscriptChunk[]);
}
