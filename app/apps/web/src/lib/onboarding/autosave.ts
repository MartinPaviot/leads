/**
 * Per-phase form autosave helpers (P0-3 task 3.7).
 *
 * The wizard's per-phase forms are uncontrolled at the wizard level —
 * each phase component owns its useState. A flaky tab refresh loses
 * everything the user typed since the last submit. localStorage
 * autosave fills the gap : as the user types we debounce-persist
 * the draft, on mount we hydrate before falling back to server
 * `priorData`.
 *
 * Pure helpers ; the wizard owns the actual `useEffect` plumbing so
 * the helpers stay framework-agnostic. Tests cover serialise / parse
 * round-trip, namespace isolation, and the freshness window.
 *
 * Storage key shape :
 *   `elevay:onboarding:<tenantId>:phase:<n>`
 *
 * Why namespace by tenant : a single browser may have multiple
 * tenants attached to the same user (consultant / agency case), and
 * we don't want phase-3 data from tenant A leaking into tenant B's
 * draft pane.
 */

const NAMESPACE = "elevay:onboarding";
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AutosaveDraft<T = unknown> {
  /** ISO-stringified write time. Used to drop drafts older than the
   *  freshness window — old localStorage entries from a long-since-
   *  abandoned session shouldn't repopulate a fresh attempt. */
  savedAt: string;
  /** The actual phase payload — same shape that submitPhase sends. */
  payload: T;
}

export function buildKey(tenantId: string, phase: number): string {
  if (!tenantId) {
    // Don't fall back to a global key — better to disable autosave
    // entirely than write tenant-scoped data to a shared bucket.
    throw new Error("buildKey requires a non-empty tenantId");
  }
  if (!Number.isInteger(phase) || phase < 1 || phase > 7) {
    throw new Error(`buildKey: phase must be 1..7 (got ${phase})`);
  }
  return `${NAMESPACE}:${tenantId}:phase:${phase}`;
}

/**
 * Serialise a draft for storage. Always wraps in the canonical
 * envelope so reading code can validate the shape before trusting
 * the contents.
 */
export function serialiseDraft<T>(payload: T, now: Date = new Date()): string {
  const draft: AutosaveDraft<T> = {
    savedAt: now.toISOString(),
    payload,
  };
  return JSON.stringify(draft);
}

/**
 * Parse a stored draft. Returns null on :
 *  - Malformed JSON
 *  - Missing `savedAt` / `payload` keys (foreign data in our key)
 *  - Draft older than `freshnessWindowMs` (stale)
 *
 * Pure ; takes `now` so tests don't depend on real-clock timing.
 */
export function parseDraft<T = unknown>(
  raw: string | null,
  opts: { now?: Date; freshnessWindowMs?: number } = {},
): AutosaveDraft<T> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.savedAt !== "string" || !("payload" in obj)) {
    return null;
  }
  const savedAt = new Date(obj.savedAt);
  if (Number.isNaN(savedAt.getTime())) return null;
  const now = opts.now ?? new Date();
  const window = opts.freshnessWindowMs ?? FRESHNESS_WINDOW_MS;
  if (now.getTime() - savedAt.getTime() > window) return null;
  return { savedAt: obj.savedAt, payload: obj.payload as T };
}

/**
 * Decide which draft to use for hydration : the localStorage one if
 * present and fresher than the server one, else the server one. The
 * server's `priorData` carries no timestamp, so when both exist we
 * prefer local — local is always at-least-as-recent (it was written
 * after the last successful submit).
 *
 * Returns `{ source: "local" | "server" | "none", payload }`.
 */
export function pickDraft<T>(
  local: AutosaveDraft<T> | null,
  server: T | undefined | null,
):
  | { source: "local"; payload: T }
  | { source: "server"; payload: T }
  | { source: "none" } {
  if (local) return { source: "local", payload: local.payload };
  if (server !== undefined && server !== null) {
    return { source: "server", payload: server };
  }
  return { source: "none" };
}

/**
 * Pure debounce — returns a function that delays its callback until
 * `delayMs` of quiet has passed. Exported for testability ; the
 * wizard could just use lodash but keeping our own keeps the wizard
 * dependency-free.
 *
 * The returned function exposes a `flush` for tests + page-unload
 * scenarios where we want to commit the pending write immediately.
 */
export interface DebouncedFn<TArgs extends unknown[]> {
  (...args: TArgs): void;
  flush: () => void;
  cancel: () => void;
}

export function createDebouncer<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
  scheduler: {
    setTimeout?: (cb: () => void, ms: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
  } = {},
): DebouncedFn<TArgs> {
  const setT = scheduler.setTimeout ?? setTimeout;
  const clearT = scheduler.clearTimeout ?? clearTimeout;
  let handle: unknown = null;
  let lastArgs: TArgs | null = null;

  const debounced = ((...args: TArgs) => {
    lastArgs = args;
    if (handle) clearT(handle);
    handle = setT(() => {
      handle = null;
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }, delayMs);
  }) as DebouncedFn<TArgs>;

  debounced.flush = () => {
    if (handle) clearT(handle);
    handle = null;
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  debounced.cancel = () => {
    if (handle) clearT(handle);
    handle = null;
    lastArgs = null;
  };

  return debounced;
}

/**
 * Storage adapter — abstracts localStorage so server-side render or
 * Safari-private-mode (no localStorage) gracefully no-ops. The
 * wizard injects `window.localStorage` ; tests inject a Map-backed
 * stub.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function safeStorageAdapter(
  source: Storage | undefined | null,
): StorageAdapter {
  if (!source) return noopStorage;
  return {
    getItem(k) {
      try {
        return source.getItem(k);
      } catch {
        return null;
      }
    },
    setItem(k, v) {
      try {
        source.setItem(k, v);
      } catch {
        // QuotaExceeded / private mode → silently drop. Autosave
        // is best-effort, never load-bearing.
      }
    },
    removeItem(k) {
      try {
        source.removeItem(k);
      } catch {
        // Same.
      }
    },
  };
}

const noopStorage: StorageAdapter = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/**
 * High-level helper used by the wizard hook : reads a draft if
 * present + fresh + tenant-scoped, returns the payload directly.
 * Returns null when nothing usable lives in storage.
 */
export function loadDraft<T = unknown>(
  storage: StorageAdapter,
  tenantId: string,
  phase: number,
  opts: { now?: Date; freshnessWindowMs?: number } = {},
): AutosaveDraft<T> | null {
  let key: string;
  try {
    key = buildKey(tenantId, phase);
  } catch {
    return null;
  }
  return parseDraft<T>(storage.getItem(key), opts);
}

export function saveDraft<T>(
  storage: StorageAdapter,
  tenantId: string,
  phase: number,
  payload: T,
  now: Date = new Date(),
): void {
  let key: string;
  try {
    key = buildKey(tenantId, phase);
  } catch {
    return;
  }
  storage.setItem(key, serialiseDraft(payload, now));
}

export function clearDraft(
  storage: StorageAdapter,
  tenantId: string,
  phase: number,
): void {
  let key: string;
  try {
    key = buildKey(tenantId, phase);
  } catch {
    return;
  }
  storage.removeItem(key);
}
