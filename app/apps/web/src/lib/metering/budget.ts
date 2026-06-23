/**
 * Budget scope + typed exhaustion error (spec 02, AC2). A metered call is
 * checked at workspace/campaign/segment scope; an exhausted budget surfaces a
 * typed BudgetExhausted (never an opaque failure).
 */

export interface BudgetScope {
  /** Workspace (tenant) id — always present. */
  workspace: string;
  /** Optional campaign scope. */
  campaign?: string;
  /** Optional segment scope. */
  segment?: string;
}

/** The budget scope keys to enforce, most-specific last. "ws" is always present;
 *  campaign/segment keys are added when the scope carries them. A budget row may
 *  exist for any subset — every existing one must cover the charge. */
export function scopeKeys(scope: BudgetScope): string[] {
  const keys = ["ws"];
  if (scope.campaign) keys.push(`campaign:${scope.campaign}`);
  if (scope.segment) keys.push(`segment:${scope.segment}`);
  return keys;
}

export class BudgetExhausted extends Error {
  readonly scope: BudgetScope;
  readonly scopeKey: string;
  readonly requested: number;
  readonly remaining: number;
  constructor(scope: BudgetScope, scopeKey: string, requested: number, remaining: number) {
    super(
      `Budget exhausted at scope "${scopeKey}" (requested ${requested}, ${remaining} remaining)`,
    );
    this.name = "BudgetExhausted";
    this.scope = scope;
    this.scopeKey = scopeKey;
    this.requested = requested;
    this.remaining = remaining;
  }
}
