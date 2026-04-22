/**
 * Client-side request coalescer for logo resolution.
 *
 * Accumulates individual CompanyLogo mount requests into batches,
 * debounces 50ms, then flushes to /api/company-logo/resolve-batch.
 * Each caller gets a per-domain promise that resolves when its
 * batch returns.
 */

export interface CoalescerRequest {
  domain: string;
  companyName: string;
  existingLogoUrl?: string | null;
}

export interface CoalescerResult {
  url: string | null;
  tier: number;
  fromCache: boolean;
  resolvedAt: string;
}

interface PendingEntry {
  request: CoalescerRequest;
  resolve: (r: CoalescerResult) => void;
  reject: (e: Error) => void;
  cancelled: boolean;
}

const DEBOUNCE_MS = 50;
const MAX_BATCH = 50;

let queue: PendingEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  const batch = queue.splice(0, MAX_BATCH);
  if (batch.length === 0) return;

  // If there's overflow, schedule another flush immediately
  if (queue.length > 0) {
    scheduleFlush();
  }

  const live = batch.filter((e) => !e.cancelled);
  if (live.length === 0) return;

  // Deduplicate by domain — keep first entry per domain, fan out to all
  const byDomain = new Map<string, PendingEntry[]>();
  for (const entry of live) {
    const key = entry.request.domain.toLowerCase();
    const group = byDomain.get(key);
    if (group) {
      group.push(entry);
    } else {
      byDomain.set(key, [entry]);
    }
  }

  const entries = Array.from(byDomain.entries()).map(([, group]) => ({
    domain: group[0].request.domain,
    companyName: group[0].request.companyName,
    existingLogoUrl: group[0].request.existingLogoUrl,
  }));

  try {
    const res = await fetch("/api/company-logo/resolve-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });

    if (!res.ok) {
      const err = new Error(`Logo resolve failed: ${res.status}`);
      for (const entry of live) {
        if (!entry.cancelled) entry.reject(err);
      }
      return;
    }

    const data = (await res.json()) as {
      results: Record<string, CoalescerResult>;
    };

    for (const [domain, group] of byDomain) {
      const result = data.results[domain];
      for (const entry of group) {
        if (entry.cancelled) continue;
        if (result) {
          entry.resolve(result);
        } else {
          entry.resolve({
            url: null,
            tier: 6,
            fromCache: false,
            resolvedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (err) {
    const error =
      err instanceof Error ? err : new Error("Logo resolve network error");
    for (const entry of live) {
      if (!entry.cancelled) entry.reject(error);
    }
  }
}

function scheduleFlush(): void {
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, DEBOUNCE_MS);
}

export function enqueueLogoResolve(
  request: CoalescerRequest,
): { promise: Promise<CoalescerResult>; cancel: () => void } {
  let entry: PendingEntry;

  const promise = new Promise<CoalescerResult>((resolve, reject) => {
    entry = { request, resolve, reject, cancelled: false };
    queue.push(entry);
  });

  scheduleFlush();

  return {
    promise,
    cancel: () => {
      entry.cancelled = true;
    },
  };
}

/** Reset internal state — for tests only. */
export function __resetCoalescer(): void {
  queue = [];
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}
