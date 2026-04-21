import type { ChannelAdapter, DispatchInput, DispatchResult, SequenceStepType } from "./types";

const adapters = new Map<SequenceStepType, ChannelAdapter>();
let defaultsLoaded = false;

export function registerAdapter(a: ChannelAdapter): void {
  adapters.set(a.type, a);
}

export function getAdapter(type: SequenceStepType): ChannelAdapter | null {
  return adapters.get(type) ?? null;
}

export function listAdapters(): ChannelAdapter[] {
  return [...adapters.values()];
}

export function resetRegistryForTest(): void {
  adapters.clear();
  defaultsLoaded = false;
}

async function ensureDefaultsLoaded(): Promise<void> {
  if (defaultsLoaded || adapters.size > 0) {
    defaultsLoaded = true;
    return;
  }
  defaultsLoaded = true;
  const { registerDefaults } = await import("./register-defaults");
  registerDefaults();
}

/**
 * Route a step through the registered adapter. Unknown types or
 * disabled adapters return a structured error so the caller can mark
 * the enrollment `failed` rather than silently hang.
 */
export async function dispatchStep(input: DispatchInput): Promise<DispatchResult> {
  await ensureDefaultsLoaded();

  const adapter = adapters.get(input.step.stepType);
  if (!adapter) {
    return {
      ok: false,
      channel: input.step.stepType,
      error: `No adapter registered for step type "${input.step.stepType}"`,
    };
  }
  if (!adapter.isAvailable()) {
    return {
      ok: false,
      channel: input.step.stepType,
      error: `Adapter "${input.step.stepType}" is not available (missing credentials or feature flag)`,
    };
  }
  try {
    return await adapter.dispatch(input);
  } catch (err) {
    return {
      ok: false,
      channel: input.step.stepType,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
