/**
 * Race a promise against a timeout. Fail-open: a rejection OR a timeout both
 * resolve to `null` rather than throwing, so a caller can degrade gracefully
 * instead of failing the whole request on an optional dependency.
 */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p.catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
