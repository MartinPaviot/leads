/**
 * Frozen transport tags for the v1 page-action result round-trip (README §3.5).
 *
 * Pure module (no React, no client deps) so BOTH the client executor
 * (use-ui-directives.ts) and the server-side system prompt (chat-system-prompt.ts)
 * import the SAME literals — the model is taught to read exactly what the client
 * writes, with zero drift, and the server bundle never pulls in a "use client" module.
 */
export const ACTION_RESULT_OPEN = "[[action-result]]";
export const ACTION_RESULT_CLOSE = "[[/action-result]]";
