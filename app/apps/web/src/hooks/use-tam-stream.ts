"use client";

import { useCallback, useReducer, useRef } from "react";
import type {
  BuildRequest,
  BuildSummary,
  CompanyCompact,
  ContactCompact,
  EnrichmentPatch,
  ScorePayload,
  SignalKey,
  SignalPayload,
  TamEvent,
  WarmPath,
} from "@/lib/tam-stream/events";
import { emptySignalsLit } from "@/lib/tam-stream/events";

/** Per-signal state as tracked by the reducer. `pending` is the
 * initial shimmer chip; a resolved payload replaces it. */
export type SignalSlotState =
  | { status: "pending" }
  | { status: "resolved"; payload: SignalPayload };

export interface StreamedRow {
  company: CompanyCompact;
  enrichment: EnrichmentPatch;
  score: ScorePayload;
  signals: Partial<Record<SignalKey, SignalSlotState>>;
  contacts: ContactCompact[];
  warmPaths: WarmPath[];
  /** Timestamp of the `company.inserted` event — used to dim rows
   * older than N seconds once the stream is done (they've had their
   * moment in the sun). */
  insertedAt: number;
}

export interface TamStreamState {
  jobId: string | null;
  startedAt: string | null;
  strategies: Array<{ label: string; reasoning: string; done: boolean }>;
  rows: Map<string, StreamedRow>;
  rowOrder: string[];
  progress: {
    foundSoFar: number;
    insertedSoFar: number;
    aBurning: number;
    signalsLit: Record<SignalKey, number>;
  };
  summary: BuildSummary | null;
  errors: Array<{ companyId?: string; stage: string; message: string }>;
  isRunning: boolean;
  /** Terminal state — stream closed either by `done` event, by
   * client cancel, or by network failure. Drives the banner UI. */
  terminated: "done" | "cancelled" | "error" | null;
}

export type TamStreamAction =
  | { type: "start" }
  | { type: "event"; event: TamEvent }
  | { type: "cancel" }
  | { type: "stream_error"; message: string }
  | { type: "stream_closed" };

export const initialTamStreamState: TamStreamState = {
  jobId: null,
  startedAt: null,
  strategies: [],
  rows: new Map(),
  rowOrder: [],
  progress: {
    foundSoFar: 0,
    insertedSoFar: 0,
    aBurning: 0,
    signalsLit: emptySignalsLit(),
  },
  summary: null,
  errors: [],
  isRunning: false,
  terminated: null,
};

/** Exported for unit tests — the hook wires this via `useReducer`. */
export function tamReducer(state: TamStreamState, action: TamStreamAction): TamStreamState {
  switch (action.type) {
    case "start":
      return {
        ...initialTamStreamState,
        // Preserve rows from previous run if any — the accounts page
        // layers newly streamed rows on top of whatever was there.
        rows: state.rows,
        rowOrder: state.rowOrder,
        isRunning: true,
      };

    case "cancel":
      return { ...state, isRunning: false, terminated: "cancelled" };

    case "stream_error":
      return {
        ...state,
        isRunning: false,
        terminated: "error",
        errors: [
          ...state.errors,
          { stage: "stream", message: action.message },
        ],
      };

    case "stream_closed":
      // Safety net: the NDJSON response closed without us receiving
      // a terminal `done` event. This happens when the server throws
      // *after* emitting a recoverable error (fallbacks to the outer
      // catch) or when the network drops mid-stream. We don't want
      // the UI to keep spinning "Building…" in that case.
      if (!state.isRunning) return state;
      return {
        ...state,
        isRunning: false,
        terminated: state.errors.length > 0 ? "error" : "done",
      };

    case "event":
      return reduceEvent(state, action.event);
  }
}

function reduceEvent(state: TamStreamState, event: TamEvent): TamStreamState {
  switch (event.type) {
    case "hello":
      return {
        ...state,
        jobId: event.jobId,
        startedAt: event.startedAt,
      };

    case "strategy.generated":
      return {
        ...state,
        strategies: event.strategies.map((s) => ({ ...s, done: false })),
      };

    case "strategy.complete":
      return {
        ...state,
        strategies: state.strategies.map((s) =>
          s.label === event.label ? { ...s, done: true } : s,
        ),
      };

    case "search.progress":
      return {
        ...state,
        progress: {
          ...state.progress,
          foundSoFar: Math.max(state.progress.foundSoFar, event.foundSoFar),
        },
      };

    case "company.inserted": {
      const id = event.company.id;
      if (state.rows.has(id)) return state; // idempotent

      const signals: Partial<Record<SignalKey, SignalSlotState>> = {
        investor_overlap: { status: "pending" },
        funding_recent: { status: "pending" },
        funding_crunchbase: { status: "pending" },
        hiring_intent: { status: "pending" },
        yc_company: { status: "pending" },
      };

      if (event.initialSignal) {
        signals[event.initialSignal.key] = {
          status: "resolved",
          payload: event.initialSignal.payload,
        };
      }

      const row: StreamedRow = {
        company: event.company,
        enrichment: event.enrichment,
        score: event.initialScore,
        signals,
        contacts: [],
        warmPaths: [],
        insertedAt: Date.now(),
      };

      const nextRows = new Map(state.rows);
      nextRows.set(id, row);

      const lit = { ...state.progress.signalsLit };
      if (event.initialSignal && event.initialSignal.payload.value) {
        lit[event.initialSignal.key]++;
      }

      return {
        ...state,
        rows: nextRows,
        rowOrder: [...state.rowOrder, id],
        progress: {
          ...state.progress,
          insertedSoFar: state.progress.insertedSoFar + 1,
          aBurning:
            state.progress.aBurning +
            (event.initialScore.grade === "A" || event.initialScore.grade === "A+" ? 1 : 0),
          signalsLit: lit,
        },
      };
    }

    case "company.scored": {
      const row = state.rows.get(event.companyId);
      if (!row) return state;
      const nextRows = new Map(state.rows);
      nextRows.set(event.companyId, { ...row, score: event.score });
      // If the grade crossed into A territory, bump the counter.
      const wasA = row.score.grade === "A" || row.score.grade === "A+";
      const isA = event.score.grade === "A" || event.score.grade === "A+";
      return {
        ...state,
        rows: nextRows,
        progress: {
          ...state.progress,
          aBurning: state.progress.aBurning + (isA && !wasA ? 1 : wasA && !isA ? -1 : 0),
        },
      };
    }

    case "signal.computed": {
      const row = state.rows.get(event.companyId);
      if (!row) return state;
      const prevSlot = row.signals[event.key];
      const alreadyCounted =
        prevSlot?.status === "resolved" && prevSlot.payload.value;
      const nowLit = event.payload.value && !alreadyCounted;
      const nextRows = new Map(state.rows);
      nextRows.set(event.companyId, {
        ...row,
        signals: {
          ...row.signals,
          [event.key]: { status: "resolved", payload: event.payload },
        },
      });
      const lit = { ...state.progress.signalsLit };
      if (nowLit) lit[event.key]++;
      return {
        ...state,
        rows: nextRows,
        progress: { ...state.progress, signalsLit: lit },
      };
    }

    case "contacts.found": {
      const row = state.rows.get(event.companyId);
      if (!row) return state;
      const nextRows = new Map(state.rows);
      nextRows.set(event.companyId, { ...row, contacts: event.contacts });
      return { ...state, rows: nextRows };
    }

    case "warm_path.computed": {
      const row = state.rows.get(event.companyId);
      if (!row) return state;
      const nextRows = new Map(state.rows);
      nextRows.set(event.companyId, { ...row, warmPaths: event.paths });
      return { ...state, rows: nextRows };
    }

    case "done":
      return {
        ...state,
        isRunning: false,
        terminated: "done",
        summary: event.summary,
      };

    case "error":
      return {
        ...state,
        errors: [
          ...state.errors,
          {
            companyId: event.companyId,
            stage: event.stage,
            message: event.message,
          },
        ],
      };

    case "heartbeat":
      // No-op — the fact that we received it is already evidence the
      // connection is alive. A future enhancement could track
      // lastHeartbeat and show a "reconnecting…" hint if > 45s pass
      // without one.
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────────

export function useTamStream() {
  const [state, dispatch] = useReducer(tamReducer, initialTamStreamState);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (opts: BuildRequest = {}) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ type: "start" });

    let res: Response;
    try {
      res = await fetch("/api/tam/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts),
        signal: ctrl.signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        dispatch({ type: "cancel" });
      } else {
        dispatch({ type: "stream_error", message: (err as Error).message });
      }
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      dispatch({
        type: "stream_error",
        message: text || `HTTP ${res.status}`,
      });
      return;
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const ev = JSON.parse(trimmed) as TamEvent;
            dispatch({ type: "event", event: ev });
          } catch {
            console.warn("[tam-stream] malformed line dropped:", trimmed);
          }
        }
      }
      // Flush any trailing buffered line that didn't end with a newline.
      const tail = buffer.trim();
      if (tail) {
        try {
          dispatch({ type: "event", event: JSON.parse(tail) as TamEvent });
        } catch {
          console.warn("[tam-stream] trailing line dropped:", tail);
        }
      }
      // Stream ended cleanly — clamp isRunning in case the server
      // never got to emit its terminal `done` (e.g. threw after
      // starting work). The reducer is idempotent if a `done` did
      // arrive earlier.
      dispatch({ type: "stream_closed" });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        dispatch({ type: "cancel" });
      } else {
        dispatch({ type: "stream_error", message: (err as Error).message });
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "cancel" });
  }, []);

  return {
    ...state,
    start,
    cancel,
  };
}
