/**
 * Network helper that surfaces failures instead of swallowing them.
 *
 * Replace `await fetch(url).catch(() => {})` with
 *   const { data, error } = await safeFetch<MyType>(url, { errorMessage: "Failed to load X" });
 *   if (data) setX(data);
 *
 * The optional `toast` callback is invoked on error (HTTP >= 400 or thrown
 * exception). Pass `useToast().toast` from `@/components/ui/toast` to wire UI
 * feedback. If you need fire-and-forget telemetry, pass `silent: true`.
 */

export interface SafeFetchOptions extends RequestInit {
  /** User-facing message for toasts/UI. Defaults to a generic "Request failed". */
  errorMessage?: string;
  /** Skip toast/UI side-effects (still returns the error). */
  silent?: boolean;
  /** Toast callback. Pass `useToast().toast` from the React tree. */
  toast?: (message: string, variant?: "success" | "error" | "warning" | "info") => void;
  /** Custom fetch implementation (mostly for tests). */
  fetchImpl?: typeof fetch;
}

export type SafeFetchResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

export async function safeFetch<T = unknown>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult<T>> {
  const { errorMessage, silent = false, toast, fetchImpl, ...init } = options;
  const f = fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    const display = errorMessage ?? `Network error: ${msg}`;
    if (!silent && toast) toast(display, "error");
    if (typeof console !== "undefined") {
      console.warn("safeFetch network error", { url, error: msg });
    }
    return { data: null, error: display };
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; message?: string };
          if (json.error) detail = json.error;
          else if (json.message) detail = json.message;
          else detail = `${detail}: ${text.slice(0, 200)}`;
        } catch {
          detail = `${detail}: ${text.slice(0, 200)}`;
        }
      }
    } catch {
      // body unreadable — keep generic detail
    }

    // E8 — rate-limit (429) responses get a purpose-built toast that
    // reads the `Retry-After` header (seconds per RFC 7231 §7.1.3 or
    // HTTP-date per the spec; we handle seconds only — that's what
    // rateLimitResponse() emits). An explicit `errorMessage` always
    // wins so callers that already frame the context ("Couldn't load
    // your accounts") stay in charge.
    let display = errorMessage ?? detail;
    let variant: "error" | "warning" = "error";
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : NaN;
      const friendly = Number.isFinite(seconds) && seconds > 0
        ? `You've hit a temporary limit. Try again in ${formatRetryAfter(seconds)}.`
        : "You've hit a temporary limit. Try again in a moment.";
      display = errorMessage ?? friendly;
      // Warning not error — the user did nothing wrong, we just paced.
      variant = "warning";
    }

    if (!silent && toast) toast(display, variant);
    if (typeof console !== "undefined") {
      console.warn("safeFetch HTTP error", { url, status: res.status, detail });
    }
    return { data: null, error: display };
  }

  // 204 No Content — no body to parse
  if (res.status === 204) {
    return { data: undefined as T, error: null };
  }

  try {
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON response";
    const display = errorMessage ?? msg;
    if (!silent && toast) toast(display, "error");
    return { data: null, error: display };
  }
}

/**
 * E8 — human-friendly `Retry-After` renderer. Seconds get bucketed so
 * the toast reads like a person wrote it (no "59 seconds", no "1.5
 * minutes"). Under 10s we just say "a few seconds" — anything more
 * precise than that just reads like code.
 */
function formatRetryAfter(seconds: number): string {
  if (seconds < 10) return "a few seconds";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  return "a few minutes";
}
