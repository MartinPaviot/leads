"use client";

import { useCallback, useReducer, useRef } from "react";
import type { CriterionOutcome } from "@/lib/providers/company-enrichment/criteria";
import type { EnrichCompanyStatus } from "@/lib/enrichment/enrich-company-row";
import type {
  EnrichStreamEvent,
  EnrichStreamRequest,
  EnrichStreamSummary,
} from "@/lib/enrichment/enrich-stream-events";

/** Per-cell state the table renders: a shimmer while fetching, then the
 * resolved outcome (so a miss reads "not found", never a fake value). */
export type EnrichCellState =
  | { status: "searching" }
  | { status: "resolved"; outcome: CriterionOutcome; value: string | null };

export interface EnrichStreamState {
  jobId: string | null;
  isRunning: boolean;
  total: number;
  /** Companies that have reached `company.done`. */
  processed: number;
  /** companyId → (criterionKey → cell state). */
  cells: Map<string, Map<string, EnrichCellState>>;
  /** companyId → final status (set on `company.done`). */
  companyStatus: Map<string, EnrichCompanyStatus>;
  /** Companies currently in flight (start seen, done not yet). */
  active: Set<string>;
  summary: EnrichStreamSummary | null;
  errors: Array<{ companyId?: string; message: string }>;
  terminated: "done" | "error" | "cancelled" | null;
}

export type EnrichStreamAction =
  | { type: "start"; total: number }
  | { type: "event"; event: EnrichStreamEvent }
  | { type: "cancel" }
  | { type: "stream_error"; message: string }
  | { type: "stream_closed" };

export const initialEnrichStreamState: EnrichStreamState = {
  jobId: null,
  isRunning: false,
  total: 0,
  processed: 0,
  cells: new Map(),
  companyStatus: new Map(),
  active: new Set(),
  summary: null,
  errors: [],
  terminated: null,
};

/** Immutably set one cell, cloning the outer + inner maps. */
function setCell(
  cells: Map<string, Map<string, EnrichCellState>>,
  companyId: string,
  key: string,
  value: EnrichCellState,
): Map<string, Map<string, EnrichCellState>> {
  const next = new Map(cells);
  const inner = new Map(next.get(companyId) ?? []);
  inner.set(key, value);
  next.set(companyId, inner);
  return next;
}

/** Exported for unit tests — the hook wires this via `useReducer`. */
export function enrichReducer(state: EnrichStreamState, action: EnrichStreamAction): EnrichStreamState {
  switch (action.type) {
    case "start":
      // Preserve resolved cells from a previous run so re-enriching a
      // subset doesn't blank the rest of the table.
      return {
        ...initialEnrichStreamState,
        cells: state.cells,
        companyStatus: state.companyStatus,
        isRunning: true,
        total: action.total,
      };

    case "cancel":
      return { ...state, isRunning: false, active: new Set(), terminated: "cancelled" };

    case "stream_error":
      return {
        ...state,
        isRunning: false,
        active: new Set(),
        terminated: "error",
        errors: [...state.errors, { message: action.message }],
      };

    case "stream_closed":
      if (!state.isRunning) return state;
      return {
        ...state,
        isRunning: false,
        active: new Set(),
        terminated: state.errors.length > 0 ? "error" : "done",
      };

    case "event":
      return reduceEvent(state, action.event);
  }
}

function reduceEvent(state: EnrichStreamState, event: EnrichStreamEvent): EnrichStreamState {
  switch (event.type) {
    case "hello":
      return { ...state, jobId: event.jobId, total: event.companyIds.length };

    case "company.start": {
      const active = new Set(state.active);
      active.add(event.companyId);
      return { ...state, active };
    }

    case "criterion.searching":
      return {
        ...state,
        cells: setCell(state.cells, event.companyId, event.key, { status: "searching" }),
      };

    case "criterion.resolved":
      return {
        ...state,
        cells: setCell(state.cells, event.companyId, event.key, {
          status: "resolved",
          outcome: event.outcome,
          value: event.value,
        }),
      };

    case "company.done": {
      const companyStatus = new Map(state.companyStatus);
      companyStatus.set(event.companyId, event.status);
      const active = new Set(state.active);
      active.delete(event.companyId);
      return { ...state, companyStatus, active, processed: state.processed + 1 };
    }

    case "done":
      return { ...state, isRunning: false, active: new Set(), terminated: "done", summary: event.summary };

    case "error":
      return {
        ...state,
        errors: [...state.errors, { companyId: event.companyId, message: event.message }],
      };

    case "heartbeat":
      return state;
  }
}

/** Mirrors MAX_STREAM_COMPANIES in /api/enrich/stream — the server slices
 * anything beyond this per request, so full coverage of a bigger run is
 * built by chaining sequential batch requests. */
export const ENRICH_STREAM_BATCH_SIZE = 100;

/**
 * Drive one enrichment run of ANY size as a chain of batch-capped stream
 * requests, reduced into a single continuous run:
 *
 * - ONE `start` with the full total; per-batch `hello` events are
 *   re-echoed with the full id list so the reducer's total never snaps
 *   to a batch size. `processed` accumulates across batches.
 * - Per-batch `done` summaries are absorbed and summed; ONE synthetic
 *   `done` goes out after the last batch, so the run terminates exactly
 *   once with the aggregate summary.
 * - A transport failure (fetch threw / non-2xx) stops the chain and
 *   surfaces `stream_error` — the remaining batches would hit the same
 *   wall, and partial progress is already in the reduced state.
 * - An abort stops before the next batch fires.
 *
 * Exported for unit tests; `useEnrichStream` wires it to the reducer.
 */
export async function runEnrichStream(opts: {
  req: EnrichStreamRequest;
  dispatch: (action: EnrichStreamAction) => void;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  batchSize?: number;
}): Promise<void> {
  const { req, dispatch, signal, fetchImpl, batchSize = ENRICH_STREAM_BATCH_SIZE } = opts;
  const doFetch = fetchImpl ?? fetch;
  const allIds = req.companyIds;
  dispatch({ type: "start", total: allIds.length });

  const merged: EnrichStreamSummary = {
    total: 0,
    enriched: 0,
    alreadyComplete: 0,
    noData: 0,
    failed: 0,
    durationMs: 0,
  };
  let sawSummary = false;
  const startedAt = Date.now();

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: EnrichStreamEvent;
    try {
      event = JSON.parse(trimmed) as EnrichStreamEvent;
    } catch {
      console.warn("[enrich-stream] malformed line dropped:", trimmed);
      return;
    }
    if (event.type === "hello") {
      dispatch({ type: "event", event: { ...event, companyIds: allIds } });
      return;
    }
    if (event.type === "done") {
      sawSummary = true;
      merged.total += event.summary.total;
      merged.enriched += event.summary.enriched;
      merged.alreadyComplete += event.summary.alreadyComplete;
      merged.noData += event.summary.noData;
      merged.failed += event.summary.failed;
      return;
    }
    dispatch({ type: "event", event });
  };

  for (let i = 0; i < allIds.length; i += batchSize) {
    if (signal.aborted) {
      dispatch({ type: "cancel" });
      return;
    }
    const batch = allIds.slice(i, i + batchSize);

    let res: Response;
    try {
      res = await doFetch("/api/enrich/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...req, companyIds: batch }),
        signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") dispatch({ type: "cancel" });
      else dispatch({ type: "stream_error", message: (err as Error).message });
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      dispatch({ type: "stream_error", message: text || `HTTP ${res.status}` });
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
        for (const line of lines) handleLine(line);
      }
      if (buffer.trim()) handleLine(buffer);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") dispatch({ type: "cancel" });
      else dispatch({ type: "stream_error", message: (err as Error).message });
      return;
    }
  }

  if (signal.aborted) {
    dispatch({ type: "cancel" });
    return;
  }
  if (sawSummary) {
    merged.durationMs = Date.now() - startedAt;
    dispatch({ type: "event", event: { type: "done", summary: merged } });
  }
  // No batch produced a summary (server crashed before its `done`): the
  // reducer's stream_closed terminates by the collected errors instead.
  dispatch({ type: "stream_closed" });
}

export function useEnrichStream() {
  const [state, dispatch] = useReducer(enrichReducer, initialEnrichStreamState);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const start = useCallback(async (req: EnrichStreamRequest) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Run-scoped dispatch: a superseded run's abort rejection lands on a
    // later microtask — without the guard its `cancel` would kill the run
    // that replaced it.
    const runId = ++runIdRef.current;
    const scopedDispatch = (action: EnrichStreamAction) => {
      if (runIdRef.current === runId) dispatch(action);
    };
    await runEnrichStream({ req, dispatch: scopedDispatch, signal: ctrl.signal });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "cancel" });
  }, []);

  return { ...state, start, cancel };
}
