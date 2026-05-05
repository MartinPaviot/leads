/**
 * In-memory circuit breaker for critical external dependencies.
 *
 * Three states:
 *   CLOSED  — calls flow through normally, failures are counted
 *   OPEN    — calls are rejected immediately (fast-fail)
 *   HALF-OPEN — a limited number of trial calls are allowed through
 *
 * State is in-memory (lost on process restart). On Vercel serverless each
 * isolate gets its own circuit, which is fine — the breaker protects
 * against cascading failures within a single request burst, not across
 * the fleet.
 *
 * No external dependencies.
 */

import logger from "../observability/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CircuitBreakerConfig {
  /** Human-readable name, used in logs and status reporting. */
  name: string;
  /** Consecutive failures before the circuit opens. */
  failureThreshold: number;
  /** Milliseconds the circuit stays open before transitioning to half-open. */
  resetTimeoutMs: number;
  /** Successful trial calls in half-open before the circuit closes again. */
  halfOpenMaxAttempts: number;
}

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitStatus {
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
  lastFailureAt: string | null;
  lastStateChange: string | null;
}

// ---------------------------------------------------------------------------
// Internal state per circuit
// ---------------------------------------------------------------------------

interface CircuitInternalState {
  config: CircuitBreakerConfig;
  state: CircuitState;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
  lastFailureAt: number | null;
  openedAt: number | null;
  lastStateChange: number | null;
}

// ---------------------------------------------------------------------------
// Circuit registry (module-level singleton)
// ---------------------------------------------------------------------------

const circuits = new Map<string, CircuitInternalState>();

function getOrCreate(config: CircuitBreakerConfig): CircuitInternalState {
  let circuit = circuits.get(config.name);
  if (!circuit) {
    circuit = {
      config,
      state: "closed",
      consecutiveFailures: 0,
      halfOpenSuccesses: 0,
      lastFailureAt: null,
      openedAt: null,
      lastStateChange: null,
    };
    circuits.set(config.name, circuit);
  }
  return circuit;
}

// ---------------------------------------------------------------------------
// State transitions (always logged)
// ---------------------------------------------------------------------------

function transitionTo(circuit: CircuitInternalState, newState: CircuitState): void {
  const prev = circuit.state;
  if (prev === newState) return;

  circuit.state = newState;
  circuit.lastStateChange = Date.now();

  logger.warn(`[circuit-breaker] ${circuit.config.name}: ${prev} -> ${newState}`, {
    circuit: circuit.config.name,
    from: prev,
    to: newState,
    consecutiveFailures: circuit.consecutiveFailures,
  });
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Custom error thrown when the circuit is open and calls are rejected
 * without hitting the external service.
 */
export class CircuitOpenError extends Error {
  readonly circuitName: string;

  constructor(circuitName: string) {
    super(`Circuit breaker "${circuitName}" is OPEN — call rejected without hitting the external service`);
    this.name = "CircuitOpenError";
    this.circuitName = circuitName;
  }
}

function recordSuccess(circuit: CircuitInternalState): void {
  if (circuit.state === "half-open") {
    circuit.halfOpenSuccesses += 1;
    if (circuit.halfOpenSuccesses >= circuit.config.halfOpenMaxAttempts) {
      // Enough successful trial calls — close the circuit
      circuit.consecutiveFailures = 0;
      circuit.halfOpenSuccesses = 0;
      transitionTo(circuit, "closed");
    }
  } else {
    // In closed state, a success resets the failure counter
    circuit.consecutiveFailures = 0;
  }
}

function recordFailure(circuit: CircuitInternalState): void {
  circuit.consecutiveFailures += 1;
  circuit.lastFailureAt = Date.now();

  if (circuit.state === "half-open") {
    // Any failure in half-open sends us back to open
    circuit.halfOpenSuccesses = 0;
    circuit.openedAt = Date.now();
    transitionTo(circuit, "open");
  } else if (
    circuit.state === "closed" &&
    circuit.consecutiveFailures >= circuit.config.failureThreshold
  ) {
    circuit.openedAt = Date.now();
    transitionTo(circuit, "open");
  }
}

function shouldAllow(circuit: CircuitInternalState): boolean {
  if (circuit.state === "closed") return true;
  if (circuit.state === "half-open") return true;

  // State is open — check if enough time has passed to try half-open
  const elapsed = Date.now() - (circuit.openedAt ?? 0);
  if (elapsed >= circuit.config.resetTimeoutMs) {
    circuit.halfOpenSuccesses = 0;
    transitionTo(circuit, "half-open");
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wrap an async function with circuit breaker protection.
 *
 * @example
 * ```ts
 * const data = await withCircuitBreaker(APOLLO_CIRCUIT, () =>
 *   apolloFetch("/v1/organizations/enrich?domain=example.com")
 * );
 * ```
 */
export async function withCircuitBreaker<T>(
  config: CircuitBreakerConfig,
  fn: () => Promise<T>,
): Promise<T> {
  const circuit = getOrCreate(config);

  if (!shouldAllow(circuit)) {
    throw new CircuitOpenError(config.name);
  }

  try {
    const result = await fn();
    recordSuccess(circuit);
    return result;
  } catch (err) {
    recordFailure(circuit);
    throw err;
  }
}

/**
 * Check whether a named circuit is currently allowing calls.
 *
 * Useful for the AI provider to pre-check Anthropic availability and
 * immediately fall back to OpenAI without attempting a call that will
 * be rejected.
 */
export function isCircuitClosed(name: string): boolean {
  const circuit = circuits.get(name);
  if (!circuit) return true; // No circuit registered yet = healthy
  return shouldAllow(circuit);
}

/**
 * Return the current state of every registered circuit.
 * Designed for the admin dashboard observability page.
 */
export function getCircuitStatus(): CircuitStatus[] {
  const results: CircuitStatus[] = [];
  for (const circuit of circuits.values()) {
    // Re-evaluate open->half-open transition for accurate reporting
    if (circuit.state === "open") {
      const elapsed = Date.now() - (circuit.openedAt ?? 0);
      if (elapsed >= circuit.config.resetTimeoutMs) {
        circuit.halfOpenSuccesses = 0;
        transitionTo(circuit, "half-open");
      }
    }

    results.push({
      name: circuit.config.name,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      halfOpenSuccesses: circuit.halfOpenSuccesses,
      lastFailureAt: circuit.lastFailureAt
        ? new Date(circuit.lastFailureAt).toISOString()
        : null,
      lastStateChange: circuit.lastStateChange
        ? new Date(circuit.lastStateChange).toISOString()
        : null,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Pre-configured circuit configs for critical dependencies
// ---------------------------------------------------------------------------

/** Apollo API: 5 consecutive failures, 30 s cooldown, 2 trial calls. */
export const APOLLO_CIRCUIT: CircuitBreakerConfig = {
  name: "apollo",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 2,
};

/** Anthropic API: 5 consecutive failures, 30 s cooldown, 2 trial calls. */
export const ANTHROPIC_CIRCUIT: CircuitBreakerConfig = {
  name: "anthropic",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 2,
};

/** Recall.ai API: 3 consecutive failures, 60 s cooldown, 2 trial calls. */
export const RECALL_CIRCUIT: CircuitBreakerConfig = {
  name: "recall",
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
};

// ---------------------------------------------------------------------------
// Reset (for testing only)
// ---------------------------------------------------------------------------

/** @internal — clear all circuit state. Tests only. */
export function _resetAllCircuitsForTesting(): void {
  circuits.clear();
}
